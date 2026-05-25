import { useRoute, Link, useLocation } from "wouter";
import {
  useGetMilestoneDetail,
  useCreateChangeEvent,
  useUpdateMilestone,
  useDeleteMilestone,
  useCreateMilestoneEditRequest,
  useGetProjectCompanies,
  useGetProjectMilestones,
  getGetMilestoneDetailQueryKey,
  getGetProjectChangeEventsQueryKey,
  getGetPmProjectSummaryQueryKey,
  getGetProjectMilestonesQueryKey,
  getGetChangeEventDetailQueryKey,
  type MilestoneDetail,
  type MilestoneProposedChanges,
  type UpdateMilestoneInput,
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
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import {
  ArrowLeft, ArrowRight, Flag, CheckCircle2, Clock, AlertCircle,
  GitPullRequestArrow, CalendarDays, Users, Plus, FilePenLine, Trash2, Loader2, Lock,
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
  open, onOpenChange, milestone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  milestone: MilestoneDetail;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [projectId] = usePmProjectId();

  const dedupedCompanies = useMemo(() => {
    const seen = new Set<number>();
    return [...milestone.owningCompanies, ...milestone.contributorCompanies].filter((c) => {
      if (seen.has(c.projectCompanyId)) return false;
      seen.add(c.projectCompanyId); return true;
    });
  }, [milestone.owningCompanies, milestone.contributorCompanies]);

  const currentDate = new Date(milestone.currentDate);
  const currentDateIso = format(currentDate, "yyyy-MM-dd");
  const [newDate, setNewDate] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [selectedPcIds, setSelectedPcIds] = useState<Set<number>>(
    () => new Set(dedupedCompanies.map((c) => c.projectCompanyId)),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  function reset() {
    setNewDate(""); setReason("");
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
        onOpenChange(false); reset();
        navigate(`/pm/change-event/${data.id}`);
      },
      onError: (err) => toast({
        variant: "destructive",
        title: "Failed to create change event",
        description: (err as unknown as { error?: string })?.error ?? "Please try again.",
      }),
    },
  });

  function toggleCompany(pcId: number) {
    setSelectedPcIds((prev) => {
      const next = new Set(prev);
      if (next.has(pcId)) next.delete(pcId); else next.add(pcId);
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
      else if (format(parsed, "yyyy-MM-dd") === format(currentDate, "yyyy-MM-dd")) {
        errs.newDate = "New date must differ from current date.";
      }
    }
    if (!reason.trim()) errs.reason = "Reason is required.";
    if (selectedPcIds.size === 0) errs.companies = "Select at least one company.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const proposed = new Date(newDate);
    proposed.setHours(
      currentDate.getHours(), currentDate.getMinutes(),
      currentDate.getSeconds(), currentDate.getMilliseconds(),
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

  const shiftDays = newDate ? differenceInDays(new Date(newDate), currentDate) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
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
              <Input id="new-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              {errors.newDate && (<p className="text-xs text-destructive">{errors.newDate}</p>)}
              {!errors.newDate && shiftDays !== null && (
                <p className={`text-xs ${shiftDays > 0 ? "text-destructive" : "text-[color:var(--c-gold)]"}`}>
                  {shiftDays > 0 ? `+${shiftDays}` : shiftDays} day{Math.abs(shiftDays) === 1 ? "" : "s"} shift
                </p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason / description</Label>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why the date is changing..." className="h-24 resize-none" />
            {errors.reason && (<p className="text-xs text-destructive">{errors.reason}</p>)}
          </div>
          <div className="space-y-2">
            <Label>Impacted companies</Label>
            <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
              {dedupedCompanies.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">No companies are assigned to this milestone.</div>
              ) : dedupedCompanies.map((c) => (
                <label key={c.projectCompanyId} className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/40">
                  <Checkbox checked={selectedPcIds.has(c.projectCompanyId)} onCheckedChange={() => toggleCompany(c.projectCompanyId)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.role}</div>
                  </div>
                </label>
              ))}
            </div>
            {errors.companies && (<p className="text-xs text-destructive">{errors.companies}</p>)}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating..." : "Create change event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditMilestoneDialog({
  open, onOpenChange, milestone, mode,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  milestone: MilestoneDetail;
  mode: "direct" | "request";
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [projectId] = usePmProjectId();
  const { data: companies } = useGetProjectCompanies(projectId);
  const { data: siblingMs } = useGetProjectMilestones(projectId);

  const [name, setName] = useState(milestone.name);
  const [code, setCode] = useState(milestone.code);
  const [description, setDescription] = useState(milestone.description ?? "");
  const [ownerRole, setOwnerRole] = useState(milestone.ownerRole);
  const [baselineDate, setBaselineDate] = useState(
    format(new Date(milestone.baselineDate), "yyyy-MM-dd"),
  );
  const [isKeyOutput, setIsKeyOutput] = useState(milestone.isKeyOutput);
  const [critical, setCritical] = useState(milestone.criticalFlag);
  const [isPayment, setIsPayment] = useState(milestone.isPaymentTrigger);
  const [reason, setReason] = useState("");
  const [editCompanies, setEditCompanies] = useState(false);
  const [ownerPcIds, setOwnerPcIds] = useState<Set<number>>(
    () => new Set(milestone.owningCompanies.map((c) => c.projectCompanyId)),
  );
  const [contribPcIds, setContribPcIds] = useState<Set<number>>(
    () => new Set(milestone.contributorCompanies.map((c) => c.projectCompanyId)),
  );
  const [predIds, setPredIds] = useState<Set<number>>(
    () => new Set(milestone.predecessorIds ?? []),
  );
  const [notifyPcIds, setNotifyPcIds] = useState<Set<number>>(() => {
    const ids = new Set<number>();
    milestone.owningCompanies.forEach((c) => ids.add(c.projectCompanyId));
    milestone.contributorCompanies.forEach((c) => ids.add(c.projectCompanyId));
    return ids;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = useUpdateMilestone({
    mutation: {
      onSuccess: () => {
        toast({ title: "Milestone updated" });
        qc.invalidateQueries({ queryKey: getGetMilestoneDetailQueryKey(milestone.id) });
        qc.invalidateQueries({ queryKey: getGetProjectMilestonesQueryKey(projectId) });
        onOpenChange(false);
      },
      onError: (err) => toast({
        variant: "destructive",
        title: "Update failed",
        description: (err as unknown as { error?: string })?.error ?? "Try again.",
      }),
    },
  });

  const editRequest = useCreateMilestoneEditRequest({
    mutation: {
      onSuccess: (ev) => {
        toast({
          title: "Edit request submitted",
          description: "It has been sent to the client for review.",
        });
        qc.invalidateQueries({ queryKey: getGetMilestoneDetailQueryKey(milestone.id) });
        qc.invalidateQueries({ queryKey: getGetProjectChangeEventsQueryKey(projectId) });
        qc.invalidateQueries({ queryKey: getGetPmProjectSummaryQueryKey(projectId) });
        onOpenChange(false);
        navigate(`/pm/change-event/${ev.id}`);
      },
      onError: (err) => toast({
        variant: "destructive",
        title: "Could not submit edit request",
        description: (err as unknown as { error?: string })?.error ?? "Try again.",
      }),
    },
  });

  function togglePc(set: Set<number>, setFn: (s: Set<number>) => void, id: number) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setFn(next);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Required.";
    if (!code.trim()) errs.code = "Required.";
    if (!ownerRole.trim()) errs.ownerRole = "Required.";
    if (mode === "request" && !reason.trim()) errs.reason = "Reason is required for an edit request.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    if (mode === "direct") {
      const payload: UpdateMilestoneInput = {
        name: name.trim(),
        code: code.trim(),
        description: description.trim() ? description.trim() : null,
        ownerRole: ownerRole.trim(),
        baselineDate: new Date(baselineDate).toISOString(),
        criticalFlag: critical,
        isKeyOutput,
        isPaymentTrigger: isPayment,
      };
      if (editCompanies) {
        payload.ownerProjectCompanyIds = Array.from(ownerPcIds);
        payload.contributorProjectCompanyIds = Array.from(contribPcIds);
      }
      const currentPreds = new Set(milestone.predecessorIds ?? []);
      if (currentPreds.size !== predIds.size || [...predIds].some((id) => !currentPreds.has(id))) {
        payload.predecessorIds = Array.from(predIds);
      }
      update.mutate({ milestoneId: milestone.id, data: payload });
    } else {
      const changes: MilestoneProposedChanges = {};
      if (name.trim() !== milestone.name) changes.name = name.trim();
      if (code.trim() !== milestone.code) changes.code = code.trim();
      const newDesc = description.trim() ? description.trim() : null;
      if (newDesc !== (milestone.description ?? null)) changes.description = newDesc;
      if (ownerRole.trim() !== milestone.ownerRole) changes.ownerRole = ownerRole.trim();
      if (critical !== milestone.criticalFlag) changes.criticalFlag = critical;
      if (isKeyOutput !== milestone.isKeyOutput) changes.isKeyOutput = isKeyOutput;
      if (isPayment !== milestone.isPaymentTrigger) changes.isPaymentTrigger = isPayment;
      if (editCompanies) {
        const currentOwners = new Set(milestone.owningCompanies.map((c) => c.projectCompanyId));
        const currentContribs = new Set(milestone.contributorCompanies.map((c) => c.projectCompanyId));
        if (currentOwners.size !== ownerPcIds.size || [...ownerPcIds].some((id) => !currentOwners.has(id))) {
          changes.ownerProjectCompanyIds = Array.from(ownerPcIds);
        }
        if (currentContribs.size !== contribPcIds.size || [...contribPcIds].some((id) => !currentContribs.has(id))) {
          changes.contributorProjectCompanyIds = Array.from(contribPcIds);
        }
      }
      const currentPreds = new Set(milestone.predecessorIds ?? []);
      if (currentPreds.size !== predIds.size || [...predIds].some((id) => !currentPreds.has(id))) {
        changes.predecessorIds = Array.from(predIds);
      }
      if (Object.keys(changes).length === 0) {
        setErrors({ form: "No changes to submit." });
        return;
      }
      editRequest.mutate({
        milestoneId: milestone.id,
        data: {
          proposedChanges: changes,
          changeReason: reason.trim(),
          impactedProjectCompanyIds: Array.from(notifyPcIds),
        },
      });
    }
  }

  const isPending = mode === "direct" ? update.isPending : editRequest.isPending;
  const allCompanies = companies ?? [];
  const otherMilestones = (siblingMs ?? []).filter((m) => m.id !== milestone.id);

  function togglePred(id: number) {
    const next = new Set(predIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPredIds(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "direct" ? "Edit milestone" : "Request milestone edit"}
          </DialogTitle>
          <DialogDescription>
            {mode === "direct"
              ? "Changes are applied immediately while the schedule is in Draft."
              : "The schedule is baselined. This proposal will be sent to the client for approval. To change the date, use Propose Date Change instead."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ed-code">Code</Label>
              <Input id="ed-code" value={code} onChange={(e) => setCode(e.target.value)} />
              {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-owner">Owner role</Label>
              <Input id="ed-owner" value={ownerRole} onChange={(e) => setOwnerRole(e.target.value)} />
              {errors.ownerRole && <p className="text-xs text-destructive">{errors.ownerRole}</p>}
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="ed-name">Name</Label>
              <Input id="ed-name" value={name} onChange={(e) => setName(e.target.value)} />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="ed-desc">Description</Label>
              <Textarea id="ed-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="h-20 resize-none" />
            </div>
            {mode === "direct" && (
              <div className="space-y-1.5">
                <Label htmlFor="ed-date">Target date</Label>
                <Input id="ed-date" type="date" value={baselineDate} onChange={(e) => setBaselineDate(e.target.value)} />
              </div>
            )}
            <div className={`space-y-2 ${mode === "direct" ? "pt-6" : "col-span-2"}`}>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={isKeyOutput} onCheckedChange={(c) => setIsKeyOutput(c === true)} /> Key output
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={critical} onCheckedChange={(c) => setCritical(c === true)} /> Critical
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={isPayment} onCheckedChange={(c) => setIsPayment(c === true)} /> Payment trigger
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={editCompanies} onCheckedChange={(c) => setEditCompanies(c === true)} />
              Also change company assignments
            </label>
            {editCompanies && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div className="space-y-1.5">
                  <Label className="text-xs">Owner companies</Label>
                  <div className="border rounded-md divide-y max-h-32 overflow-y-auto">
                    {allCompanies.map((c) => (
                      <label key={c.projectCompanyId} className="flex items-center gap-2 p-1.5 text-xs cursor-pointer hover:bg-muted/40">
                        <Checkbox
                          checked={ownerPcIds.has(c.projectCompanyId)}
                          onCheckedChange={() => togglePc(ownerPcIds, setOwnerPcIds, c.projectCompanyId)}
                        />
                        <span className="flex-1 truncate">{c.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Contributor companies</Label>
                  <div className="border rounded-md divide-y max-h-32 overflow-y-auto">
                    {allCompanies.map((c) => (
                      <label key={c.projectCompanyId} className="flex items-center gap-2 p-1.5 text-xs cursor-pointer hover:bg-muted/40">
                        <Checkbox
                          checked={contribPcIds.has(c.projectCompanyId)}
                          onCheckedChange={() => togglePc(contribPcIds, setContribPcIds, c.projectCompanyId)}
                        />
                        <span className="flex-1 truncate">{c.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {otherMilestones.length > 0 && (
            <div className="space-y-2">
              <Label>Predecessors</Label>
              <div className="border rounded-md divide-y max-h-32 overflow-y-auto">
                {otherMilestones.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 p-2 text-sm cursor-pointer hover:bg-muted/40">
                    <Checkbox
                      checked={predIds.has(s.id)}
                      onCheckedChange={() => togglePred(s.id)}
                    />
                    <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
                    <span className="flex-1 truncate">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {mode === "request" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="ed-reason">Reason for change</Label>
                <Textarea id="ed-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-20 resize-none" placeholder="Why are you proposing this change?" />
                {errors.reason && <p className="text-xs text-destructive">{errors.reason}</p>}
              </div>
              <div className="space-y-2">
                <Label>Notify companies (optional)</Label>
                <div className="border rounded-md divide-y max-h-32 overflow-y-auto">
                  {allCompanies.map((c) => (
                    <label key={c.projectCompanyId} className="flex items-center gap-2 p-2 text-sm cursor-pointer hover:bg-muted/40">
                      <Checkbox
                        checked={notifyPcIds.has(c.projectCompanyId)}
                        onCheckedChange={() => togglePc(notifyPcIds, setNotifyPcIds, c.projectCompanyId)}
                      />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.roleOnProject}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {errors.form && <p className="text-xs text-destructive">{errors.form}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {mode === "direct" ? "Save changes" : "Submit for client review"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function summarizeProposedChanges(changes: MilestoneProposedChanges | null | undefined): string[] {
  if (!changes) return [];
  const lines: string[] = [];
  if (changes.name !== undefined) lines.push(`Name → "${changes.name}"`);
  if (changes.code !== undefined) lines.push(`Code → "${changes.code}"`);
  if (changes.description !== undefined) lines.push(`Description updated`);
  if (changes.ownerRole !== undefined) lines.push(`Owner role → ${changes.ownerRole}`);
  if (changes.criticalFlag !== undefined) lines.push(`Critical → ${changes.criticalFlag ? "yes" : "no"}`);
  if (changes.isKeyOutput !== undefined) lines.push(`Key output → ${changes.isKeyOutput ? "yes" : "no"}`);
  if (changes.isPaymentTrigger !== undefined) lines.push(`Payment trigger → ${changes.isPaymentTrigger ? "yes" : "no"}`);
  if (changes.ownerProjectCompanyIds !== undefined) lines.push(`Owner companies updated`);
  if (changes.contributorProjectCompanyIds !== undefined) lines.push(`Contributor companies updated`);
  if (changes.predecessorIds !== undefined) lines.push(`Predecessors → ${changes.predecessorIds.length === 0 ? "none" : `${changes.predecessorIds.length} milestone${changes.predecessorIds.length === 1 ? "" : "s"}`}`);
  return lines;
}

export default function PmMilestoneDetail() {
  const [, params] = useRoute("/pm/milestone/:id");
  const id = Number(params?.id);
  const [, navigate] = useLocation();
  const { data, isLoading, isError } = useGetMilestoneDetail(id);
  const [projectId] = usePmProjectId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const del = useDeleteMilestone({
    mutation: {
      onSuccess: () => {
        toast({ title: "Milestone deleted" });
        qc.invalidateQueries({ queryKey: getGetProjectMilestonesQueryKey(projectId) });
        qc.invalidateQueries({ queryKey: getGetPmProjectSummaryQueryKey(projectId) });
        navigate("/pm/schedule");
      },
      onError: (err) => toast({
        variant: "destructive",
        title: "Could not delete",
        description: (err as unknown as { error?: string })?.error ?? "Try again.",
      }),
    },
  });

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
  const isDraft = data.scheduleStatus === "Draft";
  const isBaselined = data.scheduleStatus === "Baselined";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/pm/schedule" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to master schedule
        </Link>
      </div>

      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <Badge variant="outline">S{data.stageOrder}: {data.stageName}</Badge>
            <span className="font-mono text-muted-foreground">{data.code}</span>
            {data.isKeyOutput && <Badge>Key Output</Badge>}
            {data.criticalFlag && (<Badge variant="destructive"><Flag className="w-3 h-3 mr-1" />Critical</Badge>)}
            {data.isPaymentTrigger && <Badge variant="outline">Payment Trigger</Badge>}
            <Badge variant="outline" className={
              isDraft ? "bg-amber-50 text-amber-700 border-amber-200" :
              isBaselined ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
              "bg-blue-50 text-blue-700 border-blue-200"
            }>
              Schedule: {data.scheduleStatus}
            </Badge>
          </div>
          <h1 className="font-serif text-4xl font-normal tracking-tight text-ink">{data.name}</h1>
          {data.description && (<p className="text-muted-foreground">{data.description}</p>)}
        </div>
        <div className="flex flex-col gap-2 flex-shrink-0">
          {isDraft && (
            <>
              <Button onClick={() => setEditDialogOpen(true)} variant="outline">
                <FilePenLine className="w-4 h-4 mr-1" /> Edit milestone
              </Button>
              <Button onClick={() => setDeleteOpen(true)} variant="outline" className="text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
            </>
          )}
          {isBaselined && (
            <>
              <Button onClick={() => setDateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Propose Date Change
              </Button>
              <Button onClick={() => setEditDialogOpen(true)} variant="outline">
                <FilePenLine className="w-4 h-4 mr-1" /> Request edit
              </Button>
            </>
          )}
          {!isDraft && !isBaselined && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              <Lock className="w-3 h-3 mr-1" /> Locked — awaiting baseline approval
            </Badge>
          )}
        </div>
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
          <Card className="p-8 text-center text-muted-foreground border-dashed">No changes have been proposed on this milestone yet.</Card>
        ) : (
          data.changeEvents.map((ev) => {
            const isDateChange = ev.editKind === "DateChange";
            const hasDates = ev.oldDate && ev.proposedNewDate;
            const evShift = hasDates ? differenceInDays(new Date(ev.proposedNewDate!), new Date(ev.oldDate!)) : 0;
            const fieldLines = summarizeProposedChanges(ev.proposedChanges);
            return (
              <Card key={ev.id} className="shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <Badge variant="outline" className={isDateChange ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-purple-50 text-purple-700 border-purple-200"}>
                          {isDateChange ? "Date change" : "Field edit"}
                        </Badge>
                        <span>Opened {formatDistanceToNow(new Date(ev.initiatedAt), { addSuffix: true })}</span>
                        <Badge variant="outline">{ev.status}</Badge>
                      </div>
                      {isDateChange && hasDates ? (
                        <div className="flex items-center gap-3 text-sm">
                          <span className="line-through text-muted-foreground">{format(new Date(ev.oldDate!), "MMM d, yyyy")}</span>
                          <ArrowRight className="w-4 h-4" />
                          <span className="font-bold">{format(new Date(ev.proposedNewDate!), "MMM d, yyyy")}</span>
                          <Badge variant="outline" className={evShift > 0 ? "bg-[color-mix(in_srgb,var(--c-danger)_14%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-danger)_70%,var(--c-ink))] border-[color-mix(in_srgb,var(--c-danger)_30%,var(--c-line))]" : "bg-[color-mix(in_srgb,var(--c-info)_14%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-info)_70%,var(--c-ink))] border-[color-mix(in_srgb,var(--c-info)_30%,var(--c-line))]"}>
                            {evShift > 0 ? `+${evShift}` : evShift} days
                          </Badge>
                        </div>
                      ) : (
                        <ul className="text-sm space-y-0.5">
                          {fieldLines.length === 0
                            ? <li className="text-muted-foreground italic">No field changes recorded.</li>
                            : fieldLines.map((l, i) => <li key={i}>• {l}</li>)}
                        </ul>
                      )}
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
                      ))}
                    </div>
                  </CardContent>
                </Card>
            );
          })
        )}
      </div>

      {isBaselined && (
        <ProposeDateChangeDialog
          open={dateDialogOpen}
          onOpenChange={setDateDialogOpen}
          milestone={data}
        />
      )}
      {(isDraft || isBaselined) && editDialogOpen && (
        <EditMilestoneDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          milestone={data}
          mode={isDraft ? "direct" : "request"}
        />
      )}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this milestone?</AlertDialogTitle>
            <AlertDialogDescription>
              {data.name} will be permanently removed from the draft schedule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => del.mutate({ milestoneId: data.id })}
              disabled={del.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
