import { useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import {
  useGetChangeEventDetail,
  useGetMilestoneDetail,
  useTransitionChangeEvent,
  useResendChangeEventNotifications,
  useEditChangeEvent,
  getGetChangeEventDetailQueryKey,
  getGetMilestoneDetailQueryKey,
  getGetProjectChangeEventsQueryKey,
  getGetPmProjectSummaryQueryKey,
  getGetMyPendingImpactsQueryKey,
  type ChangeEventDetail,
  type ChangeEventTimelineEntry,
  type TransitionChangeEventAction,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock,
  FilePlus,
  Mail,
  Pencil,
  RefreshCw,
  Send,
  Stamp,
  ThumbsDown,
  ThumbsUp,
  XCircle,
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

function statusBadge(status: ChangeEventDetail["status"]) {
  const tone: BadgeVariant =
    status === "PMApproved"
      ? "success"
      : status === "ClientApproved"
        ? "info"
        : status === "ClientRejected" || status === "Cancelled"
          ? "danger"
          : status === "SentForClientReview"
            ? "warn"
            : "neutral";
  return (
    <Badge variant={tone} withDot>
      {status}
    </Badge>
  );
}

function deliveryBadge(
  status: "Sent" | "Failed" | null | undefined,
  channel: "email" | "log" | null | undefined,
) {
  if (!status) {
    return (
      <Badge variant="outline" className="bg-muted text-muted-foreground">
        Not yet notified
      </Badge>
    );
  }
  if (status === "Failed") {
    return (
      <Badge variant="danger" withDot>
        <AlertTriangle className="w-3 h-3 mr-1" />
        Delivery failed
      </Badge>
    );
  }
  if (channel === "log") {
    return (
      <Badge variant="warn" withDot>
        <Mail className="w-3 h-3 mr-1" />
        Logged (no SMTP)
      </Badge>
    );
  }
  return (
    <Badge variant="success" withDot>
      <Mail className="w-3 h-3 mr-1" />
      Emailed
    </Badge>
  );
}

function invalidateChangeEventQueries(
  qc: ReturnType<typeof useQueryClient>,
  ev: ChangeEventDetail,
  projectId: number | null,
) {
  qc.invalidateQueries({ queryKey: getGetChangeEventDetailQueryKey(ev.id) });
  qc.invalidateQueries({ queryKey: getGetMilestoneDetailQueryKey(ev.milestoneId) });
  if (projectId != null) {
    qc.invalidateQueries({ queryKey: getGetProjectChangeEventsQueryKey(projectId) });
    qc.invalidateQueries({ queryKey: getGetPmProjectSummaryQueryKey(projectId) });
  }
  qc.invalidateQueries({ queryKey: getGetMyPendingImpactsQueryKey() });
}

type TransitionConfig = {
  action: TransitionChangeEventAction;
  label: string;
  icon: typeof Send;
  variant?: "default" | "outline" | "destructive" | "secondary";
  requireComment?: boolean;
  commentLabel?: string;
  title: string;
  description: string;
  successMessage: string;
};

function getAvailableTransitions(
  status: ChangeEventDetail["status"],
): TransitionConfig[] {
  switch (status) {
    case "Draft":
      return [
        {
          action: "send",
          label: "Send to client for review",
          icon: Send,
          variant: "default",
          title: "Send for client review",
          description:
            "Notify the client that a date change has been proposed and is awaiting their decision.",
          successMessage: "Change event sent for client review.",
        },
        {
          action: "cancel",
          label: "Cancel",
          icon: Ban,
          variant: "outline",
          title: "Cancel change event",
          description: "This change event will be closed and no further action can be taken on it.",
          successMessage: "Change event cancelled.",
        },
      ];
    case "SentForClientReview":
      return [
        {
          action: "client_approve",
          label: "Record client approval",
          icon: ThumbsUp,
          variant: "default",
          commentLabel: "Client comment (optional)",
          title: "Record client approval",
          description:
            "Mark that the client has approved this date change. You can capture any comment they shared.",
          successMessage: "Client approval recorded.",
        },
        {
          action: "client_reject",
          label: "Record client rejection",
          icon: ThumbsDown,
          variant: "destructive",
          requireComment: true,
          commentLabel: "Client comment (required)",
          title: "Record client rejection",
          description:
            "Mark that the client has rejected this date change. A reason from the client is required.",
          successMessage: "Client rejection recorded.",
        },
        {
          action: "cancel",
          label: "Cancel",
          icon: Ban,
          variant: "outline",
          title: "Cancel change event",
          description: "This change event will be closed without a client decision.",
          successMessage: "Change event cancelled.",
        },
      ];
    case "ClientApproved":
      return [
        {
          action: "pm_approve",
          label: "Approve and update milestone",
          icon: Stamp,
          variant: "default",
          title: "Finalize change event",
          description:
            "PM approval will update the milestone's current date to the proposed date and record the change reason.",
          successMessage: "Change event approved. Milestone has been updated.",
        },
        {
          action: "cancel",
          label: "Cancel",
          icon: Ban,
          variant: "outline",
          title: "Cancel change event",
          description: "This change event will be closed without applying it to the milestone.",
          successMessage: "Change event cancelled.",
        },
      ];
    case "ClientRejected":
      return [
        {
          action: "cancel",
          label: "Cancel",
          icon: Ban,
          variant: "outline",
          title: "Cancel change event",
          description: "Close this change event so it no longer appears as open.",
          successMessage: "Change event cancelled.",
        },
      ];
    default:
      return [];
  }
}

function TransitionDialog({
  open,
  onOpenChange,
  config,
  changeEvent,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: TransitionConfig | null;
  changeEvent: ChangeEventDetail;
  projectId: number | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useTransitionChangeEvent({
    mutation: {
      onSuccess: (data) => {
        toast({
          title: config?.successMessage ?? "Change event updated",
        });
        invalidateChangeEventQueries(qc, data, projectId);
        onOpenChange(false);
        setComment("");
        setError(null);
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Action failed",
          description: (err as unknown as { error?: string })?.error ?? "Please try again.",
        });
      },
    },
  });

  if (!config) return null;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    const trimmed = comment.trim();
    if (config.requireComment && trimmed.length === 0) {
      setError("A comment is required for this action.");
      return;
    }
    setError(null);
    mutation.mutate({
      changeEventId: changeEvent.id,
      data: {
        action: config.action,
        ...(trimmed.length > 0 ? { clientComment: trimmed } : {}),
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setComment("");
          setError(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {config.commentLabel && (
            <div className="space-y-1.5">
              <Label htmlFor="client-comment">{config.commentLabel}</Label>
              <Textarea
                id="client-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Capture what the client said..."
                className="h-24 resize-none"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={config.variant ?? "default"}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Working..." : config.label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditChangeEventDialog({
  open,
  onOpenChange,
  ev,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ev: ChangeEventDetail;
  projectId: number | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: milestone, isLoading: msLoading } = useGetMilestoneDetail(ev.milestoneId);

  const availableCompanies = useMemo(() => {
    if (!milestone) return [];
    const seen = new Set<number>();
    return [...milestone.owningCompanies, ...milestone.contributorCompanies].filter((c) => {
      if (seen.has(c.projectCompanyId)) return false;
      seen.add(c.projectCompanyId);
      return true;
    });
  }, [milestone]);

  const currentDate = milestone ? new Date(milestone.currentDate) : null;
  const currentDateIso = currentDate ? format(currentDate, "yyyy-MM-dd") : "";

  const [newDate, setNewDate] = useState<string>(format(new Date(ev.proposedNewDate), "yyyy-MM-dd"));
  const [reason, setReason] = useState<string>(ev.changeReason);
  const [selectedPcIds, setSelectedPcIds] = useState<Set<number>>(
    () => new Set(ev.impacts.map((i) => i.projectCompanyId)),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  function reset() {
    setNewDate(format(new Date(ev.proposedNewDate), "yyyy-MM-dd"));
    setReason(ev.changeReason);
    setSelectedPcIds(new Set(ev.impacts.map((i) => i.projectCompanyId)));
    setErrors({});
  }

  const mutation = useEditChangeEvent({
    mutation: {
      onSuccess: (data) => {
        toast({
          title: "Change event updated",
          description: `${data.impacts.length} ${data.impacts.length === 1 ? "company is" : "companies are"} now notified.`,
        });
        invalidateChangeEventQueries(qc, data, projectId);
        onOpenChange(false);
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Failed to update change event",
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
    if (!currentDate) return;
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
      currentDate.getHours(),
      currentDate.getMinutes(),
      currentDate.getSeconds(),
      currentDate.getMilliseconds(),
    );

    mutation.mutate({
      changeEventId: ev.id,
      data: {
        proposedNewDate: proposed.toISOString(),
        changeReason: reason.trim(),
        impactedProjectCompanyIds: Array.from(selectedPcIds),
      },
    });
  }

  const shiftDays =
    newDate && currentDate ? differenceInDays(new Date(newDate), currentDate) : null;

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
          <DialogTitle>Edit Change Event</DialogTitle>
          <DialogDescription>
            Update the proposed date, reason, or impacted companies. New companies will be notified;
            removed companies will no longer see this request.
          </DialogDescription>
        </DialogHeader>

        {msLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Current date</Label>
                <Input value={currentDateIso} readOnly disabled className="bg-muted" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-new-date">New date</Label>
                <Input
                  id="edit-new-date"
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
              <Label htmlFor="edit-reason">Reason / description</Label>
              <Textarea
                id="edit-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-24 resize-none"
              />
              {errors.reason && (
                <p className="text-xs text-destructive">{errors.reason}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Impacted companies</Label>
              <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                {availableCompanies.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">
                    No companies are assigned to this milestone.
                  </div>
                ) : (
                  availableCompanies.map((c) => (
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

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function timelineLabel(eventType: ChangeEventTimelineEntry["eventType"]): string {
  switch (eventType) {
    case "Opened":
      return "Change event opened";
    case "SentForClientReview":
      return "Sent to client for review";
    case "ClientApproved":
      return "Client approved";
    case "ClientRejected":
      return "Client rejected";
    case "PMApproved":
      return "PM approved and applied to milestone";
    case "Cancelled":
      return "Cancelled";
  }
}

function timelineIcon(eventType: ChangeEventTimelineEntry["eventType"]) {
  switch (eventType) {
    case "Opened":
      return { Icon: FilePlus, tone: "bg-surface-2 text-ink-3" };
    case "SentForClientReview":
      return { Icon: Send, tone: "bg-[color-mix(in_srgb,var(--c-warn)_14%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-warn)_70%,var(--c-ink))]" };
    case "ClientApproved":
      return { Icon: ThumbsUp, tone: "bg-[color-mix(in_srgb,var(--c-info)_14%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-info)_70%,var(--c-ink))]" };
    case "ClientRejected":
      return { Icon: ThumbsDown, tone: "bg-[color-mix(in_srgb,var(--c-danger)_14%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-danger)_70%,var(--c-ink))]" };
    case "PMApproved":
      return { Icon: Stamp, tone: "bg-[color-mix(in_srgb,var(--c-success)_14%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-success)_70%,var(--c-ink))]" };
    case "Cancelled":
      return { Icon: XCircle, tone: "bg-[color-mix(in_srgb,var(--c-danger)_14%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-danger)_70%,var(--c-ink))]" };
  }
}

function Timeline({ entries }: { entries: ChangeEventTimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
    );
  }
  return (
    <ol className="relative space-y-4">
      {entries.map((entry, idx) => {
        const { Icon, tone } = timelineIcon(entry.eventType);
        const at = new Date(entry.occurredAt);
        const isLast = idx === entries.length - 1;
        return (
          <li key={entry.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center border ${tone}`}
              >
                <Icon className="w-4 h-4" />
              </div>
              {!isLast && <div className="flex-1 w-px bg-border mt-1" />}
            </div>
            <div className="pb-2 flex-1 min-w-0">
              <div className="text-sm font-medium">{timelineLabel(entry.eventType)}</div>
              <div className="text-xs text-muted-foreground">
                {format(at, "MMM d, yyyy 'at' h:mm a")}
                {" · "}
                {formatDistanceToNow(at, { addSuffix: true })}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                by {entry.actorEmail ?? "Unknown user"}
              </div>
              {entry.comment && (
                <p className="text-sm italic text-muted-foreground mt-1">
                  "{entry.comment}"
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function PmChangeEventDetail() {
  const [, params] = useRoute("/pm/change-event/:id");
  const id = Number(params?.id);
  const { data, isLoading, isError } = useGetChangeEventDetail(id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [projectId] = usePmProjectId();
  const [activeTransition, setActiveTransition] = useState<TransitionConfig | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [resendingId, setResendingId] = useState<number | "all" | null>(null);

  const resendMutation = useResendChangeEventNotifications({
    mutation: {
      onSuccess: (result, vars) => {
        const single = vars.data?.impactIds?.length === 1;
        if (result.failed > 0) {
          toast({
            title: "Some notifications failed",
            description: `${result.sent} sent, ${result.failed} failed. See per-company status below.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: single ? "Notification re-sent" : "Notifications re-sent",
            description: `${result.sent} of ${result.attempted} delivered successfully.`,
          });
        }
        queryClient.invalidateQueries({ queryKey: getGetChangeEventDetailQueryKey(id) });
      },
      onError: (err) => {
        toast({
          title: "Resend failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      },
      onSettled: () => setResendingId(null),
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (isError || !data) return <div className="p-6 text-destructive">Failed to load change event.</div>;

  const shift = differenceInDays(new Date(data.proposedNewDate), new Date(data.oldDate));
  const transitions = getAvailableTransitions(data.status);
  const isTerminal = data.status === "PMApproved" || data.status === "Cancelled";
  const pendingImpactIds = data.impacts
    .filter((i) => i.responseStatus === "Pending")
    .map((i) => i.id);
  const failedImpactIds = data.impacts
    .filter((i) => i.lastDeliveryStatus === "Failed")
    .map((i) => i.id);

  const handleResend = (impactIds: number[] | undefined, key: number | "all") => {
    setResendingId(key);
    resendMutation.mutate({
      changeEventId: id,
      data: impactIds && impactIds.length > 0 ? { impactIds } : {},
    });
  };

  const isClosed =
    data.status === "PMApproved" ||
    data.status === "Cancelled" ||
    data.status === "ClientApproved" ||
    data.status === "ClientRejected";
  const hasResponses = data.impacts.some(
    (i) => i.responseStatus !== "Pending" || i.respondedAt !== null,
  );
  const canEdit = !isClosed && !hasResponses;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <Link href="/pm/change-events" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to change events
        </Link>
      </div>

      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <Badge variant="outline">{data.stageName}</Badge>
          <Link href={`/pm/milestone/${data.milestoneId}`} className="font-mono text-muted-foreground hover:text-ink">{data.milestoneCode}</Link>
          {statusBadge(data.status)}
          <span className="text-muted-foreground">Opened {formatDistanceToNow(new Date(data.initiatedAt), { addSuffix: true })}</span>
          {data.clientDecisionAt && (
            <span className="text-muted-foreground">
              · Client decided {formatDistanceToNow(new Date(data.clientDecisionAt), { addSuffix: true })}
            </span>
          )}
        </div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="font-serif text-4xl font-normal tracking-tight text-ink">{data.milestoneName}</h1>
            <p className="text-muted-foreground italic">"{data.changeReason}"</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            disabled={!canEdit}
            title={
              !canEdit
                ? hasResponses
                  ? "Editing is locked once responses have come in."
                  : "This change event is closed."
                : undefined
            }
          >
            <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
          </Button>
        </div>
      </header>

      <Card className="shadow-sm">
        <CardContent className="p-5 flex items-center gap-4 flex-wrap">
          <div className="text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Proposed shift</div>
            <div className="flex items-center gap-3">
              <span className="line-through text-muted-foreground">{format(new Date(data.oldDate), "MMM d, yyyy")}</span>
              <ArrowRight className="w-4 h-4" />
              <span className="font-bold">{format(new Date(data.proposedNewDate), "MMM d, yyyy")}</span>
              <Badge variant="outline" className={shift > 0 ? "bg-[color-mix(in_srgb,var(--c-danger)_14%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-danger)_70%,var(--c-ink))] border-[color-mix(in_srgb,var(--c-danger)_30%,var(--c-line))]" : "bg-[color-mix(in_srgb,var(--c-info)_14%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-info)_70%,var(--c-ink))] border-[color-mix(in_srgb,var(--c-info)_30%,var(--c-line))]"}>
                {shift > 0 ? `+${shift}` : shift} days
              </Badge>
            </div>
          </div>
          {data.clientComment && (
            <div className="ml-auto text-sm text-muted-foreground italic max-w-md">
              <span className="font-medium not-italic text-foreground">Client:</span> "{data.clientComment}"
            </div>
          )}
        </CardContent>
      </Card>

      {failedImpactIds.length > 0 && (
        <Card className="shadow-sm border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4" />
              <span>
                <strong>{failedImpactIds.length}</strong> notification
                {failedImpactIds.length === 1 ? "" : "s"} failed to deliver.
              </span>
            </div>
            <Button
              size="sm"
              variant="destructive"
              disabled={resendMutation.isPending}
              onClick={() => handleResend(failedImpactIds, "all")}
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${resendingId === "all" ? "animate-spin" : ""}`} />
              Retry failed
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isTerminal ? (
            <p className="text-sm text-muted-foreground">
              {data.status === "PMApproved"
                ? "This change event has been approved and applied to the milestone. No further action is needed."
                : "This change event has been cancelled and is closed."}
            </p>
          ) : transitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No actions are available on this change event.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {data.status === "Draft" &&
                  "This change event is still a draft. Send it to the client to start their review."}
                {data.status === "SentForClientReview" &&
                  "Awaiting the client's decision. Record their response here once they reply."}
                {data.status === "ClientApproved" &&
                  "The client has approved. Finalize this change event to apply the new date to the milestone."}
                {data.status === "ClientRejected" &&
                  "The client has rejected this change. You can close it out by cancelling."}
              </p>
              <div className="flex flex-wrap gap-2">
                {transitions.map((t) => {
                  const Icon = t.icon;
                  return (
                    <Button
                      key={t.action}
                      variant={t.variant ?? "default"}
                      onClick={() => setActiveTransition(t)}
                    >
                      <Icon className="w-4 h-4 mr-1.5" />
                      {t.label}
                    </Button>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <Timeline entries={data.timeline} />
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Company Responses ({data.impacts.length})</CardTitle>
          {pendingImpactIds.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={resendMutation.isPending}
              onClick={() => handleResend(pendingImpactIds, "all")}
            >
              <Send className={`w-3 h-3 mr-1 ${resendingId === "all" ? "animate-spin" : ""}`} />
              Resend to {pendingImpactIds.length} non-responder
              {pendingImpactIds.length === 1 ? "" : "s"}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="divide-y border rounded-md">
            {data.impacts.map((i) => (
              <div key={i.id} className="p-4 flex flex-col md:flex-row gap-3 md:items-start">
                <div className="md:w-56 flex-shrink-0">
                  <div className="font-semibold">{i.companyName}</div>
                  <div className="text-xs text-muted-foreground">{i.companyRole}</div>
                  {i.recipientEmail && (
                    <div className="text-xs text-muted-foreground mt-1 truncate" title={i.recipientEmail}>
                      {i.recipientEmail}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    {deliveryBadge(i.lastDeliveryStatus, i.lastDeliveryChannel)}
                    {i.lastDeliveryAt && (
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(new Date(i.lastDeliveryAt), { addSuffix: true })}
                      </span>
                    )}
                    {(i.deliveryAttemptCount ?? 0) > 1 && (
                      <span className="text-muted-foreground">
                        · {i.deliveryAttemptCount} attempts
                      </span>
                    )}
                  </div>
                  {i.lastDeliveryStatus === "Failed" && i.lastDeliveryError && (
                    <div className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded px-2 py-1">
                      {i.lastDeliveryError}
                    </div>
                  )}

                  {i.responseStatus === "Pending" ? (
                    <div className="text-sm text-[color-mix(in_srgb,var(--c-warn)_70%,var(--c-ink))] flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Awaiting response · notified {formatDistanceToNow(new Date(i.notifiedAt), { addSuffix: true })}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <CheckCircle2 className="w-4 h-4 text-[color:var(--c-success)]" />
                        {riskBadge(i.impactRiskLevel ?? null)}
                        {i.impactRiskType && <Badge variant="outline">{i.impactRiskType}</Badge>}
                        <span className="text-muted-foreground">
                          {i.respondedAt && `responded ${formatDistanceToNow(new Date(i.respondedAt), { addSuffix: true })}`}
                        </span>
                      </div>
                      {i.mainRiskIssue && <div className="text-sm font-medium">{i.mainRiskIssue}</div>}
                      {i.detailedComment && <p className="text-sm text-muted-foreground">{i.detailedComment}</p>}
                    </>
                  )}
                </div>
                <div className="flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resendMutation.isPending}
                    onClick={() => handleResend([i.id], i.id)}
                  >
                    <RefreshCw className={`w-3 h-3 mr-1 ${resendingId === i.id ? "animate-spin" : ""}`} />
                    {i.lastDeliveryStatus === "Failed" ? "Retry" : "Resend"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <TransitionDialog
        open={activeTransition !== null}
        onOpenChange={(o) => {
          if (!o) setActiveTransition(null);
        }}
        config={activeTransition}
        changeEvent={data}
        projectId={projectId}
      />
      {canEdit && (
        <EditChangeEventDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          ev={data}
          projectId={projectId}
        />
      )}
    </div>
  );
}
