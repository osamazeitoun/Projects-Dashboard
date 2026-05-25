import { useRoute, Link, useLocation } from "wouter";
import {
  useGetMilestoneDetail,
  useCreateChangeEvent,
  getGetMilestoneDetailQueryKey,
  getGetProjectChangeEventsQueryKey,
  getGetPmProjectSummaryQueryKey,
  getGetChangeEventDetailQueryKey,
  type MilestoneDetail,
} from "@workspace/api-client-react";
import { usePmProjectId } from "@/components/pm-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  Flag,
  CheckCircle2,
  Clock,
  AlertCircle,
  GitPullRequestArrow,
  CalendarDays,
  Users,
  Plus,
} from "lucide-react";

function riskBadge(level: string | null | undefined) {
  if (!level) return null;
  const tone: BadgeVariant =
    level === "High"
      ? "danger"
      : level === "Medium"
        ? "warn"
        : level === "Low"
          ? "info"
          : "neutral";
  return <Badge variant={tone} withDot>{level} risk</Badge>;
}

function ProposeDateChangeDialog({
  open,
  onOpenChange,
  milestone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  milestone: MilestoneDetail;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [projectId] = usePmProjectId();

  const defaultCompanies = useMemo(
    () => [...milestone.owningCompanies, ...milestone.contributorCompanies],
    [milestone.owningCompanies, milestone.contributorCompanies],
  );
  const dedupedCompanies = useMemo(() => {
    const seen = new Set<number>();
    return defaultCompanies.filter((c) => {
      if (seen.has(c.projectCompanyId)) return false;
      seen.add(c.projectCompanyId);
      return true;
    });
  }, [defaultCompanies]);

  const currentDate = new Date(milestone.currentDate);
  const currentDateIso = format(currentDate, "yyyy-MM-dd");

  const [newDate, setNewDate] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [selectedPcIds, setSelectedPcIds] = useState<Set<number>>(
    () => new Set(dedupedCompanies.map((c) => c.projectCompanyId)),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset when (re)opened
  function reset() {
    setNewDate("");
    setReason("");
    setSelectedPcIds(new Set(dedupedCompanies.map((c) => c.projectCompanyId)));
    setErrors({});
  }

  const mutation = useCreateChangeEvent({
    mutation: {
      onSuccess: (data) => {
        toast({
          title: "Change event created",
          description: `${data.impacts.length} ${data.impacts.length === 1 ? "company has" : "companies have"} been notified.`,
        });
        qc.invalidateQueries({ queryKey: getGetMilestoneDetailQueryKey(milestone.id) });
        qc.invalidateQueries({ queryKey: getGetProjectChangeEventsQueryKey(projectId) });
        qc.invalidateQueries({ queryKey: getGetPmProjectSummaryQueryKey(projectId) });
        qc.invalidateQueries({ queryKey: getGetChangeEventDetailQueryKey(data.id) });
        onOpenChange(false);
        reset();
        navigate(`/pm/change-event/${data.id}`);
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Failed to create change event",
          description: (err as unknown as { error?: string })?.error ?? "Please try again.",
        });
      },
    },
  });

  function toggleCompany(pcId: number) {
    setSelectedPcIds((prev) => {
      const next = new Set(prev);
      if (next.has(pcId)) next.delete(pcId);
      else next.add(pcId);
      return next;
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!newDate) errs.newDate = "New date is required.";
    else {
      const parsed = new Date(newDate);
      if (Number.isNaN(parsed.getTime())) errs.newDate = "Invalid date.";
      else if (
        format(parsed, "yyyy-MM-dd") === format(currentDate, "yyyy-MM-dd")
      ) {
        errs.newDate = "New date must differ from current date.";
      }
    }
    if (!reason.trim()) errs.reason = "Reason is required.";
    if (selectedPcIds.size === 0)
      errs.companies = "Select at least one company.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const proposed = new Date(newDate);
    // Preserve current-date time-of-day so the diff is a clean day-count
    proposed.setHours(
      currentDate.getHours(),
      currentDate.getMinutes(),
      currentDate.getSeconds(),
      currentDate.getMilliseconds(),
    );

    mutation.mutate({
      milestoneId: milestone.id,
      data: {
        proposedNewDate: proposed.toISOString(),
        changeReason: reason.trim(),
        impactedProjectCompanyIds: Array.from(selectedPcIds),
      },
    });
  }

  const shiftDays = newDate
    ? differenceInDays(new Date(newDate), currentDate)
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Propose Date Change</DialogTitle>
          <DialogDescription>
            Open a change event for <span className="font-medium">{milestone.name}</span>. Selected companies will be notified and asked to assess the impact.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Current date</Label>
              <Input value={currentDateIso} readOnly disabled className="bg-muted" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-date">New date</Label>
              <Input
                id="new-date"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
              {errors.newDate && (
                <p className="text-xs text-destructive">{errors.newDate}</p>
              )}
              {!errors.newDate && shiftDays !== null && (
                <p className={`text-xs ${shiftDays > 0 ? "text-destructive" : "text-[color:var(--c-gold)]"}`}>
                  {shiftDays > 0 ? `+${shiftDays}` : shiftDays} day{Math.abs(shiftDays) === 1 ? "" : "s"} shift
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason / description</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why the date is changing and what's driving it..."
              className="h-24 resize-none"
            />
            {errors.reason && (
              <p className="text-xs text-destructive">{errors.reason}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Impacted companies</Label>
            <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
              {dedupedCompanies.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">
                  No companies are assigned to this milestone.
                </div>
              ) : (
                dedupedCompanies.map((c) => (
                  <label
                    key={c.projectCompanyId}
                    className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={selectedPcIds.has(c.projectCompanyId)}
                      onCheckedChange={() => toggleCompany(c.projectCompanyId)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.role}</div>
                    </div>
                  </label>
                ))
              )}
            </div>
            {errors.companies && (
              <p className="text-xs text-destructive">{errors.companies}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating..." : "Create change event"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function PmMilestoneDetail() {
  const [, params] = useRoute("/pm/milestone/:id");
  const id = Number(params?.id);
  const { data, isLoading, isError } = useGetMilestoneDetail(id);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-8 w-96" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (isError || !data) {
    return <div className="p-6 text-destructive">Failed to load milestone.</div>;
  }

  const shift = data.previousDate ? differenceInDays(new Date(data.currentDate), new Date(data.previousDate)) : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/pm/schedule" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to master schedule
        </Link>
      </div>

      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline">S{data.stageOrder}: {data.stageName}</Badge>
            <span className="font-mono text-muted-foreground">{data.code}</span>
            {data.isKeyOutput && <Badge>Key Output</Badge>}
            {data.criticalFlag && (<Badge variant="destructive"><Flag className="w-3 h-3 mr-1" />Critical</Badge>)}
            {data.isPaymentTrigger && <Badge variant="outline">Payment Trigger</Badge>}
          </div>
          <h1 className="font-serif text-4xl font-normal tracking-tight text-ink">{data.name}</h1>
          {data.description && (<p className="text-muted-foreground">{data.description}</p>)}
        </div>
        <Button onClick={() => setDialogOpen(true)} className="flex-shrink-0">
          <Plus className="w-4 h-4 mr-1" /> Propose Date Change
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" /> Current Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{format(new Date(data.currentDate), "MMM d, yyyy")}</div>
            {data.previousDate && (
              <div className="text-xs text-muted-foreground mt-1">
                Was <span className="line-through">{format(new Date(data.previousDate), "MMM d")}</span>{" "}
                <span className={shift > 0 ? "text-destructive" : "text-[color:var(--c-gold)]"}>({shift > 0 ? "+" : ""}{shift}d)</span>
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-0.5">Baseline {format(new Date(data.baselineDate), "MMM d, yyyy")}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold flex items-center gap-2">
              {data.status === "Completed" && <CheckCircle2 className="w-5 h-5 text-[color:var(--c-success)]" />}
              {data.status === "AtRisk" && <AlertCircle className="w-5 h-5 text-[color-mix(in_srgb,var(--c-warn)_70%,var(--c-ink))]" />}
              {data.status === "Delayed" && <Clock className="w-5 h-5 text-destructive" />}
              {data.status}
            </div>
            {data.changeReasonLatest && (
              <p className="text-xs text-muted-foreground italic mt-2">"{data.changeReasonLatest}"</p>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Outstanding Responses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{data.outstandingCompanies.length}</div>
            {data.outstandingCompanies.length > 0 ? (
              <div className="text-xs text-muted-foreground mt-1 truncate">
                {data.outstandingCompanies.map((c) => c.name).join(", ")}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground mt-1">All companies have responded.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Companies on this milestone</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Owner ({data.ownerRole})</div>
              {data.owningCompanies.length === 0 ? (
                <div className="text-sm text-muted-foreground italic">No company assigned</div>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {data.owningCompanies.map((c) => (<li key={c.projectCompanyId} className="font-medium">{c.name}</li>))}
                </ul>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Contributors</div>
              {data.contributorCompanies.length === 0 ? (
                <div className="text-sm text-muted-foreground italic">None</div>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {data.contributorCompanies.map((c) => (
                    <li key={c.projectCompanyId} className="flex justify-between">
                      <span>{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.role}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <GitPullRequestArrow className="w-5 h-5 text-[color:var(--c-gold)]" /> Change History
        </h2>
        {data.changeEvents.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground border-dashed">No date changes have been proposed on this milestone yet.</Card>
        ) : (
          data.changeEvents.map((ev) => {
            const evShift = differenceInDays(new Date(ev.proposedNewDate), new Date(ev.oldDate));
            return (
              <Card key={ev.id} className="shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Opened {formatDistanceToNow(new Date(ev.initiatedAt), { addSuffix: true })}</span>
                        <Badge variant="outline">{ev.status}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="line-through text-muted-foreground">{format(new Date(ev.oldDate), "MMM d, yyyy")}</span>
                        <ArrowRight className="w-4 h-4" />
                        <span className="font-bold">{format(new Date(ev.proposedNewDate), "MMM d, yyyy")}</span>
                        <Badge variant="outline" className={evShift > 0 ? "bg-[color-mix(in_srgb,var(--c-danger)_14%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-danger)_70%,var(--c-ink))] border-[color-mix(in_srgb,var(--c-danger)_30%,var(--c-line))]" : "bg-[color-mix(in_srgb,var(--c-info)_14%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-info)_70%,var(--c-ink))] border-[color-mix(in_srgb,var(--c-info)_30%,var(--c-line))]"}>
                          {evShift > 0 ? `+${evShift}` : evShift} days
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground italic">"{ev.changeReason}"</p>
                    </div>
                    <Link href={`/pm/change-event/${ev.id}`} className="text-xs text-[color:var(--c-gold)] hover:underline whitespace-nowrap">Open full event →</Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-2">Company Responses</div>
                  <div className="border rounded-md divide-y">
                    {ev.impacts.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">No companies have been notified.</div>
                    ) : ev.impacts.map((i) => (
                      <div key={i.id} className="p-3 flex items-start gap-3 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{i.companyName}</span>
                            <span className="text-xs text-muted-foreground">{i.companyRole}</span>
                          </div>
                          {i.responseStatus === "Pending" ? (
                            <div className="text-xs text-[color-mix(in_srgb,var(--c-warn)_70%,var(--c-ink))] mt-0.5">
                              Awaiting response · notified {formatDistanceToNow(new Date(i.notifiedAt), { addSuffix: true })}
                            </div>
                          ) : (
                            <div className="space-y-1 mt-1">
                              <div className="flex items-center gap-2 text-xs">
                                {riskBadge(i.impactRiskLevel ?? null)}
                                {i.impactRiskType && <Badge variant="outline">{i.impactRiskType}</Badge>}
                                <span className="text-muted-foreground">
                                  responded {i.respondedAt ? formatDistanceToNow(new Date(i.respondedAt), { addSuffix: true }) : ""}
                                </span>
                              </div>
                              {i.mainRiskIssue && <div className="text-sm">{i.mainRiskIssue}</div>}
                              {i.detailedComment && <p className="text-sm text-muted-foreground">{i.detailedComment}</p>}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <ProposeDateChangeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        milestone={data}
      />
    </div>
  );
}
