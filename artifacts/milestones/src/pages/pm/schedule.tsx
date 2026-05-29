import { useState, useMemo, useEffect } from "react";
import {
  useGetProjectMilestones,
  useGetProjectCompanies,
  useGetPmProjectSummary,
  useCreateMilestone,
  useDeleteMilestone,
  useSubmitScheduleBaseline,
  useAcknowledgeBaselineDecision,
  useListStages,
  useCreateStage,
  useRenameStage,
  useDeleteStage,
  useReorderStages,
  getGetProjectMilestonesQueryKey,
  getGetPmProjectSummaryQueryKey,
  getListBaselineReviewsQueryKey,
  getListStagesQueryKey,
  type CreateMilestoneInput,
  type BaselineDecisionSummary,
  type ProjectStage,
  StageCode,
} from "@workspace/api-client-react";
import { usePmProjectId } from "@/components/pm-layout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format, differenceInDays } from "date-fns";
import { Link } from "wouter";
import {
  Flag, AlertCircle, CheckCircle2, Clock, PlayCircle, Search,
  Plus, Send, Lock, FilePenLine, Trash2, Loader2, XCircle, Inbox,
} from "lucide-react";

const STATUSES = ["Planned", "OnTrack", "AtRisk", "Delayed", "Completed"] as const;


function statusBadge(status: string) {
  switch (status) {
    case "Completed":
      return <Badge variant="success" withDot><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
    case "OnTrack":
      return <Badge variant="info" withDot><PlayCircle className="w-3 h-3 mr-1" />On Track</Badge>;
    case "AtRisk":
      return <Badge variant="warn" withDot><AlertCircle className="w-3 h-3 mr-1" />At Risk</Badge>;
    case "Delayed":
      return <Badge variant="danger" withDot><Clock className="w-3 h-3 mr-1" />Delayed</Badge>;
    default:
      return <Badge variant="neutral" withDot>Planned</Badge>;
  }
}

function ClientDecisionBanner({
  decision,
  projectId,
}: {
  decision: BaselineDecisionSummary;
  projectId: number;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const ack = useAcknowledgeBaselineDecision({
    mutation: {
      onSuccess: () => {
        toast({ title: "Decision acknowledged" });
        qc.invalidateQueries({ queryKey: getGetPmProjectSummaryQueryKey(projectId) });
      },
      onError: (err) => toast({
        variant: "destructive",
        title: "Couldn't acknowledge",
        description: (err as unknown as { error?: string })?.error ?? "Try again.",
      }),
    },
  });

  const approved = decision.status === "Approved";
  const tone = approved
    ? {
        wrap: "border-emerald-300 bg-emerald-50/70",
        head: "text-emerald-900",
        body: "text-emerald-800",
        Icon: CheckCircle2,
        iconClr: "text-emerald-700",
        title: "Client approved your baseline",
      }
    : {
        wrap: "border-rose-300 bg-rose-50/70",
        head: "text-rose-900",
        body: "text-rose-800",
        Icon: XCircle,
        iconClr: "text-rose-700",
        title: "Client rejected your baseline",
      };
  const isUnread = !decision.acknowledged;
  const decider = decision.decidedByEmail ?? "the client";

  return (
    <Card className={`p-4 border ${tone.wrap} ${isUnread ? "ring-1 ring-offset-1 ring-[color:var(--c-gold)]/40 shadow-md" : ""}`}>
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 mt-0.5 relative">
          <tone.Icon className={`w-5 h-5 ${tone.iconClr}`} />
          {isUnread && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[color:var(--c-gold)] ring-2 ring-white" />
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold ${tone.head}`}>{tone.title}</span>
            {isUnread ? (
              <Badge variant="outline" className="bg-[color:var(--c-gold)]/15 text-[color:var(--c-gold)] border-[color:var(--c-gold)]/40 inline-flex items-center gap-1">
                <Inbox className="w-3 h-3" /> New
              </Badge>
            ) : null}
            <Badge variant="outline" className={`${tone.body} border-current/30 bg-white/60`}>
              Baseline #{decision.id}
            </Badge>
          </div>
          <p className={`text-sm ${tone.body}`}>
            {decider} {approved ? "approved" : "rejected"} the {decision.milestoneCount}-milestone
            baseline on {format(new Date(decision.decidedAt), "MMM d, yyyy 'at' h:mm a")}.
          </p>
          {decision.decisionComment ? (
            <div className={`text-sm rounded-md border bg-white/70 p-3 italic ${tone.body}`}>
              "{decision.decisionComment}"
            </div>
          ) : approved ? null : (
            <div className={`text-sm ${tone.body} opacity-80`}>No comment was left.</div>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="flex-shrink-0"
          onClick={() => ack.mutate({ projectId, baselineId: decision.id })}
          disabled={ack.isPending || !isUnread}
        >
          {ack.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          {isUnread ? "Mark as seen" : "Acknowledged"}
        </Button>
      </div>
    </Card>
  );
}

function LifecycleBanner({
  status,
  baselinedAt,
  pendingBaselineId,
  projectId,
  milestoneCount,
}: {
  status: "Draft" | "PendingBaseline" | "Baselined";
  baselinedAt: string | null | undefined;
  pendingBaselineId: number | null | undefined;
  projectId: number;
  milestoneCount: number;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  const submit = useSubmitScheduleBaseline({
    mutation: {
      onSuccess: () => {
        toast({ title: "Submitted for baseline approval" });
        qc.invalidateQueries({ queryKey: getGetPmProjectSummaryQueryKey(projectId) });
        qc.invalidateQueries({ queryKey: getGetProjectMilestonesQueryKey(projectId) });
        qc.invalidateQueries({ queryKey: getListBaselineReviewsQueryKey() });
        setOpen(false);
        setNote("");
      },
      onError: (err) => toast({
        variant: "destructive",
        title: "Submission failed",
        description: (err as unknown as { error?: string })?.error ?? "Try again.",
      }),
    },
  });

  if (status === "Draft") {
    return (
      <>
        <Card className="p-4 border-amber-200 bg-amber-50/50 flex items-start gap-4">
          <FilePenLine className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-amber-900">Schedule is in Draft</div>
            <p className="text-sm text-amber-800 mt-0.5">
              Add, edit, or remove milestones freely. Once you're ready, submit the schedule for client baseline approval. After approval, all edits will route through change events.
            </p>
          </div>
          <Button
            onClick={() => setOpen(true)}
            disabled={milestoneCount === 0}
            className="flex-shrink-0"
          >
            <Send className="w-4 h-4 mr-1" /> Submit for Baseline
          </Button>
        </Card>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit schedule for baseline approval</DialogTitle>
              <DialogDescription>
                This sends the current {milestoneCount} milestone{milestoneCount === 1 ? "" : "s"} to the client for approval. The schedule will be locked until they decide.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="baseline-note">Note to client (optional)</Label>
              <Textarea
                id="baseline-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything you want to call out to the client about this schedule..."
                className="h-24 resize-none"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={submit.isPending}>
                Cancel
              </Button>
              <Button
                onClick={() => submit.mutate({ projectId, data: { note: note.trim() || undefined } })}
                disabled={submit.isPending}
              >
                {submit.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Submit for approval
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (status === "PendingBaseline") {
    return (
      <Card className="p-4 border-blue-200 bg-blue-50/50 flex items-start gap-4">
        <Clock className="w-5 h-5 text-blue-700 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-blue-900">Awaiting client baseline approval</div>
          <p className="text-sm text-blue-800 mt-0.5">
            The schedule is locked while the client reviews it. You'll be notified when they approve or reject.
          </p>
        </div>
        {pendingBaselineId && (
          <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300 flex-shrink-0">
            Baseline #{pendingBaselineId}
          </Badge>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-4 border-emerald-200 bg-emerald-50/50 flex items-start gap-4">
      <Lock className="w-5 h-5 text-emerald-700 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-emerald-900">Schedule is Baselined</div>
        <p className="text-sm text-emerald-800 mt-0.5">
          {baselinedAt ? `Baselined on ${format(new Date(baselinedAt), "MMM d, yyyy")}. ` : ""}
          Any further changes must go through a change event opened from the milestone page.
        </p>
      </div>
    </Card>
  );
}

function AddMilestoneDialog({
  open,
  onOpenChange,
  projectId,
  companies,
  siblings,
  stageOptions,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: number;
  companies: Array<{ projectCompanyId: number; name: string; roleOnProject: string }>;
  siblings: Array<{ id: number; code: string; name: string }>;
  stageOptions: Array<{ code: string; label: string }>;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [stageCode, setStageCode] = useState<string>(stageOptions[0]?.code ?? "");
  useEffect(() => {
    if (!stageCode && stageOptions[0]) setStageCode(stageOptions[0].code);
  }, [stageOptions, stageCode]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ownerRole, setOwnerRole] = useState("");
  const [baselineDate, setBaselineDate] = useState("");
  const [isKeyOutput, setIsKeyOutput] = useState(false);
  const [critical, setCritical] = useState(false);
  const [isPayment, setIsPayment] = useState(false);
  const [ownerPcIds, setOwnerPcIds] = useState<Set<number>>(new Set());
  const [contribPcIds, setContribPcIds] = useState<Set<number>>(new Set());
  const [predIds, setPredIds] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  function reset() {
    setStageCode(stageOptions[0]?.code ?? "");
    setCode(""); setName(""); setDescription(""); setOwnerRole(""); setBaselineDate("");
    setIsKeyOutput(false); setCritical(false); setIsPayment(false);
    setOwnerPcIds(new Set()); setContribPcIds(new Set()); setPredIds(new Set()); setErrors({});
  }

  const create = useCreateMilestone({
    mutation: {
      onSuccess: () => {
        toast({ title: "Milestone added" });
        qc.invalidateQueries({ queryKey: getGetProjectMilestonesQueryKey(projectId) });
        qc.invalidateQueries({ queryKey: getGetPmProjectSummaryQueryKey(projectId) });
        onOpenChange(false);
        reset();
      },
      onError: (err) => toast({
        variant: "destructive",
        title: "Could not add milestone",
        description: (err as unknown as { error?: string })?.error ?? "Try again.",
      }),
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!code.trim()) errs.code = "Code is required.";
    if (!name.trim()) errs.name = "Name is required.";
    if (!ownerRole.trim()) errs.ownerRole = "Owner role is required.";
    if (!baselineDate) errs.baselineDate = "Date is required.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const data: CreateMilestoneInput = {
      stageCode: stageCode as StageCode,
      code: code.trim(),
      name: name.trim(),
      description: description.trim() || undefined,
      ownerRole: ownerRole.trim(),
      baselineDate: new Date(baselineDate).toISOString(),
      criticalFlag: critical,
      isKeyOutput,
      isPaymentTrigger: isPayment,
      ownerProjectCompanyIds: Array.from(ownerPcIds),
      contributorProjectCompanyIds: Array.from(contribPcIds),
      predecessorIds: Array.from(predIds),
    };
    create.mutate({ projectId, data });
  }

  function togglePc(set: Set<number>, setFn: (s: Set<number>) => void, id: number) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setFn(next);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add milestone</DialogTitle>
          <DialogDescription>Create a new milestone on the master schedule.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label>Stage</Label>
              <Select value={stageCode} onValueChange={setStageCode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stageOptions.map((s) => (
                    <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. M-101" />
              {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="baselineDate">Target date</Label>
              <Input id="baselineDate" type="date" value={baselineDate} onChange={(e) => setBaselineDate(e.target.value)} />
              {errors.baselineDate && <p className="text-xs text-destructive">{errors.baselineDate}</p>}
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="h-20 resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ownerRole">Owner role</Label>
              <Input id="ownerRole" value={ownerRole} onChange={(e) => setOwnerRole(e.target.value)} placeholder="e.g. Architect" />
              {errors.ownerRole && <p className="text-xs text-destructive">{errors.ownerRole}</p>}
            </div>
            <div className="space-y-2 pt-6">
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

          {companies.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Owner companies</Label>
                <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                  {companies.map((c) => (
                    <label key={c.projectCompanyId} className="flex items-center gap-2 p-2 text-sm cursor-pointer hover:bg-muted/40">
                      <Checkbox
                        checked={ownerPcIds.has(c.projectCompanyId)}
                        onCheckedChange={() => togglePc(ownerPcIds, setOwnerPcIds, c.projectCompanyId)}
                      />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.roleOnProject}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Contributor companies</Label>
                <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                  {companies.map((c) => (
                    <label key={c.projectCompanyId} className="flex items-center gap-2 p-2 text-sm cursor-pointer hover:bg-muted/40">
                      <Checkbox
                        checked={contribPcIds.has(c.projectCompanyId)}
                        onCheckedChange={() => togglePc(contribPcIds, setContribPcIds, c.projectCompanyId)}
                      />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.roleOnProject}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {siblings.length > 0 && (
            <div className="space-y-2">
              <Label>Predecessors (optional)</Label>
              <div className="border rounded-md divide-y max-h-32 overflow-y-auto">
                {siblings.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 p-2 text-sm cursor-pointer hover:bg-muted/40">
                    <Checkbox
                      checked={predIds.has(s.id)}
                      onCheckedChange={() => togglePc(predIds, setPredIds, s.id)}
                    />
                    <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
                    <span className="flex-1 truncate">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Add milestone
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteMilestoneButton({
  milestoneId,
  milestoneName,
  projectId,
}: {
  milestoneId: number;
  milestoneName: string;
  projectId: number;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const del = useDeleteMilestone({
    mutation: {
      onSuccess: () => {
        toast({ title: "Milestone deleted" });
        qc.invalidateQueries({ queryKey: getGetProjectMilestonesQueryKey(projectId) });
        qc.invalidateQueries({ queryKey: getGetPmProjectSummaryQueryKey(projectId) });
        setOpen(false);
      },
      onError: (err) => toast({
        variant: "destructive",
        title: "Could not delete",
        description: (err as unknown as { error?: string })?.error ?? "Try again.",
      }),
    },
  });

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        title="Delete milestone"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this milestone?</AlertDialogTitle>
            <AlertDialogDescription>
              {milestoneName} will be permanently removed from the draft schedule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => del.mutate({ milestoneId })}
              disabled={del.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function PmSchedule() {
  const [projectId] = usePmProjectId();
  const { data: milestones, isLoading } = useGetProjectMilestones(projectId);
  const { data: companies } = useGetProjectCompanies(projectId);
  const { data: summary } = useGetPmProjectSummary(projectId);
  const { data: globalStages = [] } = useListStages();

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [riskOnly, setRiskOnly] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const scheduleStatus = summary?.scheduleStatus ?? "Draft";
  const isDraft = scheduleStatus === "Draft";

  const stageOptions = useMemo(
    () =>
      globalStages.map((s) => ({
        code: s.code,
        name: s.label,
        order: s.displayOrder,
      })),
    [globalStages],
  );

  const dialogStageOptions = useMemo(
    () => globalStages.map((s) => ({ code: s.code, label: s.label })),
    [globalStages],
  );

  const milestoneCountByStageCode = useMemo(() => {
    const m = new Map<string, number>();
    for (const ms of milestones ?? []) {
      m.set(ms.stageCode, (m.get(ms.stageCode) ?? 0) + 1);
    }
    return m;
  }, [milestones]);

  const filtered = useMemo(() => {
    if (!milestones) return [];
    return milestones.filter((m) => {
      if (stageFilter !== "all" && m.stageCode !== stageFilter) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (riskOnly && m.status !== "AtRisk" && m.status !== "Delayed") return false;
      if (companyFilter !== "all") {
        const cid = Number(companyFilter);
        const hit = [...m.owningCompanies, ...m.contributorCompanies].some((c) => c.projectCompanyId === cid);
        if (!hit) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!m.name.toLowerCase().includes(q) && !m.code.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [milestones, search, stageFilter, companyFilter, statusFilter, riskOnly]);

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Master Schedule</h1>
          <p className="text-muted-foreground mt-1">
            Every milestone in the project, across every company.
          </p>
        </div>
        {isDraft && (
          <Button onClick={() => setAddOpen(true)} className="flex-shrink-0">
            <Plus className="w-4 h-4 mr-1" /> Add Milestone
          </Button>
        )}
      </header>

      {summary?.latestDecidedBaseline && !summary.latestDecidedBaseline.acknowledged && (
        <ClientDecisionBanner
          decision={summary.latestDecidedBaseline}
          projectId={projectId}
        />
      )}

      {isDraft && (
        <StagesEditor milestoneCountByStageCode={milestoneCountByStageCode} />
      )}

      {summary && (
        <LifecycleBanner
          status={scheduleStatus}
          baselinedAt={summary.baselinedAt}
          pendingBaselineId={summary.pendingBaselineId}
          projectId={projectId}
          milestoneCount={milestones?.length ?? 0}
        />
      )}

      <Card className="p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search milestone name or code..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger><SelectValue placeholder="Stage" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {stageOptions.map((s) => (
                <SelectItem key={s.code} value={s.code}>{s.order}. {s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger><SelectValue placeholder="Company" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {(companies ?? []).map((c) => (
                <SelectItem key={c.projectCompanyId} value={String(c.projectCompanyId)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs">
          <button
            onClick={() => setRiskOnly(!riskOnly)}
            className={`px-2 py-1 rounded border transition-colors ${riskOnly ? "bg-destructive/10 border-destructive/30 text-destructive" : "border-border text-muted-foreground hover:bg-muted"}`}
          >
            At-risk only
          </button>
          <span className="text-muted-foreground ml-auto">
            {filtered.length} of {milestones?.length ?? 0} milestones
          </span>
        </div>
      </Card>

      <Card className="overflow-hidden shadow-sm p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Stage</TableHead>
              <TableHead>Milestone</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Contributors</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">{isDraft ? "Actions" : "Changes"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-32 text-muted-foreground">
                  {milestones?.length === 0 && isDraft
                    ? "No milestones yet — click \"Add Milestone\" above to start building the schedule."
                    : "No milestones match the filters."}
                </TableCell>
              </TableRow>
            ) : filtered.map((m) => {
              const shift = m.previousDate ? differenceInDays(new Date(m.currentDate), new Date(m.previousDate)) : 0;
              return (
                <TableRow key={m.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="text-xs text-muted-foreground font-medium whitespace-nowrap">S{m.stageOrder}</TableCell>
                  <TableCell>
                    <Link href={`/pm/milestone/${m.id}`} className="block group">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{m.code}</span>
                        {m.isKeyOutput && (<Badge variant="default" className="text-[10px] h-4 px-1 py-0 uppercase">Key</Badge>)}
                        {m.criticalFlag && (<Badge variant="destructive" className="text-[10px] h-4 px-1 py-0 uppercase"><Flag className="w-3 h-3 mr-1" />Critical</Badge>)}
                        {m.isPaymentTrigger && (<Badge variant="outline" className="text-[10px] h-4 px-1 py-0 uppercase">$</Badge>)}
                      </div>
                      <div className="font-medium text-sm group-hover:text-ink transition-colors">{m.name}</div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">
                    {m.owningCompanies.length === 0 ? (
                      <span className="text-muted-foreground italic">{m.ownerRole}</span>
                    ) : (
                      <div className="space-y-0.5">
                        {m.owningCompanies.map((c) => (<div key={c.projectCompanyId} className="font-medium">{c.name}</div>))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.contributorCompanies.length === 0 ? "—" : m.contributorCompanies.map((c) => c.name).join(", ")}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums whitespace-nowrap">
                    {format(new Date(m.currentDate), "MMM d, yyyy")}
                    {m.previousDate && (
                      <div className="text-xs text-muted-foreground">
                        was <span className="line-through">{format(new Date(m.previousDate), "MMM d")}</span>
                        {shift !== 0 && (<span className={shift > 0 ? "text-destructive ml-1" : "text-[color:var(--c-info)] ml-1"}>({shift > 0 ? `+${shift}` : shift}d)</span>)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{statusBadge(m.status)}</TableCell>
                  <TableCell className="text-right text-xs">
                    {isDraft ? (
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/pm/milestone/${m.id}`}>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit">
                            <FilePenLine className="w-4 h-4" />
                          </Button>
                        </Link>
                        <DeleteMilestoneButton
                          milestoneId={m.id}
                          milestoneName={m.name}
                          projectId={projectId}
                        />
                      </div>
                    ) : (
                      <>
                        {m.openChangeEventCount > 0 && (
                          <Badge variant="outline" className="bg-[color-mix(in_srgb,var(--c-warn)_14%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-warn)_70%,var(--c-ink))] border-[color-mix(in_srgb,var(--c-warn)_30%,var(--c-line))]">{m.openChangeEventCount} open</Badge>
                        )}
                        {m.pendingResponseCount > 0 && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">{m.pendingResponseCount} awaiting</div>
                        )}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <AddMilestoneDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
        companies={companies ?? []}
        siblings={(milestones ?? []).map((m) => ({ id: m.id, code: m.code, name: m.name }))}
        stageOptions={dialogStageOptions}
      />
    </div>
  );
}

// ---------- Editable global stages strip ----------

function StagesEditor({
  milestoneCountByStageCode,
}: {
  milestoneCountByStageCode: Map<string, number>;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: stages = [] } = useListStages();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [addingLabel, setAddingLabel] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListStagesQueryKey() });
  }

  const rename = useRenameStage({
    mutation: {
      onSuccess: () => { toast({ title: "Stage renamed" }); invalidate(); setEditingId(null); },
      onError: (err) => toast({
        variant: "destructive",
        title: "Couldn't rename",
        description: (err as unknown as { error?: string })?.error ?? "Try again.",
      }),
    },
  });
  const create = useCreateStage({
    mutation: {
      onSuccess: () => { toast({ title: "Stage added" }); invalidate(); setAddingLabel(""); setShowAdd(false); },
      onError: (err) => toast({
        variant: "destructive",
        title: "Couldn't add",
        description: (err as unknown as { error?: string })?.error ?? "Try again.",
      }),
    },
  });
  const remove = useDeleteStage({
    mutation: {
      onSuccess: () => { toast({ title: "Stage removed" }); invalidate(); },
      onError: (err) => toast({
        variant: "destructive",
        title: "Couldn't remove",
        description: (err as unknown as { error?: string })?.error ?? "Try again.",
      }),
    },
  });
  const reorder = useReorderStages({
    mutation: {
      onSuccess: () => { invalidate(); },
      onError: (err) => toast({
        variant: "destructive",
        title: "Couldn't reorder",
        description: (err as unknown as { error?: string })?.error ?? "Try again.",
      }),
    },
  });

  function move(idx: number, dir: -1 | 1) {
    const ids = stages.map((s) => s.id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= ids.length) return;
    [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
    reorder.mutate({ data: { stageIds: ids } });
  }

  function startEdit(s: ProjectStage) {
    setEditingId(s.id);
    setEditingValue(s.label);
  }
  function commitEdit() {
    if (editingId == null) return;
    const label = editingValue.trim();
    const orig = stages.find((s) => s.id === editingId);
    if (!label || !orig || label === orig.label) { setEditingId(null); return; }
    rename.mutate({ id: editingId, data: { label } });
  }

  return (
    <Card className="p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-ink">Project Stages</div>
          <div className="text-xs text-muted-foreground">
            These stages apply to every project. Click a name to rename, use the arrows to reorder.
          </div>
        </div>
        {!showAdd && (
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add stage
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {stages.map((s, idx) => {
          const count = milestoneCountByStageCode.get(s.code) ?? s.milestoneCount ?? 0;
          const canDelete = !s.isBuiltIn && count === 0;
          const isEditing = editingId === s.id;
          return (
            <div
              key={s.id}
              className="flex items-center gap-1 rounded-md border border-border bg-muted/30 pl-1 pr-1 py-1 text-xs"
            >
              <div className="flex flex-col text-muted-foreground">
                <button
                  className="hover:text-ink disabled:opacity-30 leading-none"
                  disabled={idx === 0 || reorder.isPending}
                  onClick={() => move(idx, -1)}
                  title="Move up"
                >▲</button>
                <button
                  className="hover:text-ink disabled:opacity-30 leading-none"
                  disabled={idx === stages.length - 1 || reorder.isPending}
                  onClick={() => move(idx, 1)}
                  title="Move down"
                >▼</button>
              </div>
              <span className="tabular-nums text-muted-foreground w-6 text-right">{s.displayOrder}.</span>
              {isEditing ? (
                <Input
                  autoFocus
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-7 text-xs w-56"
                />
              ) : (
                <button
                  className="px-2 py-0.5 rounded hover:bg-background text-ink font-medium"
                  onClick={() => startEdit(s)}
                  title="Rename"
                >
                  {s.label}
                </button>
              )}
              {s.isBuiltIn && (
                <Badge variant="outline" className="text-[10px] h-4 px-1 py-0">built-in</Badge>
              )}
              <span className="text-muted-foreground px-1">· {count}</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive disabled:opacity-30"
                disabled={!canDelete || remove.isPending}
                title={
                  s.isBuiltIn
                    ? "Built-in stages can be renamed but not deleted"
                    : count > 0
                      ? "Cannot delete: stage has milestones"
                      : "Delete stage"
                }
                onClick={() => {
                  if (!confirm(`Remove stage "${s.label}"?`)) return;
                  remove.mutate({ id: s.id });
                }}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          );
        })}
        {showAdd && (
          <div className="flex items-center gap-1 rounded-md border border-dashed border-border p-1">
            <Input
              autoFocus
              value={addingLabel}
              placeholder="New stage name"
              onChange={(e) => setAddingLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const label = addingLabel.trim();
                  if (label) create.mutate({ data: { label } });
                }
                if (e.key === "Escape") { setShowAdd(false); setAddingLabel(""); }
              }}
              className="h-7 text-xs w-56"
            />
            <Button
              size="sm"
              className="h-7"
              disabled={!addingLabel.trim() || create.isPending}
              onClick={() => {
                const label = addingLabel.trim();
                if (label) create.mutate({ data: { label } });
              }}
            >
              {create.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => { setShowAdd(false); setAddingLabel(""); }}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
