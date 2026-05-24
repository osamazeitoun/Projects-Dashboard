import { useState } from "react";
import { useRoute, Link } from "wouter";
import {
  useGetChangeEventDetail,
  useTransitionChangeEvent,
  useResendChangeEventNotifications,
  getGetChangeEventDetailQueryKey,
  getGetMilestoneDetailQueryKey,
  type ChangeEventDetail,
  type TransitionChangeEventAction,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  Mail,
  RefreshCw,
  Send,
  Stamp,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

function riskBadge(level: string | null | undefined) {
  if (!level) return null;
  const tone =
    level === "High"
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : level === "Medium"
        ? "bg-secondary/10 text-secondary-foreground border-secondary/30"
        : level === "Low"
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : "bg-muted text-muted-foreground";
  return <Badge variant="outline" className={tone}>{level} risk</Badge>;
}

function statusBadge(status: ChangeEventDetail["status"]) {
  const tone =
    status === "PMApproved"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "ClientApproved"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : status === "ClientRejected" || status === "Cancelled"
          ? "bg-destructive/10 text-destructive border-destructive/30"
          : status === "SentForClientReview"
            ? "bg-amber-50 text-amber-700 border-amber-200"
            : "bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={tone}>
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
      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
        <AlertTriangle className="w-3 h-3 mr-1" />
        Delivery failed
      </Badge>
    );
  }
  if (channel === "log") {
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
        <Mail className="w-3 h-3 mr-1" />
        Logged (no SMTP)
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
      <Mail className="w-3 h-3 mr-1" />
      Emailed
    </Badge>
  );
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: TransitionConfig | null;
  changeEvent: ChangeEventDetail;
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
        qc.invalidateQueries({ queryKey: getGetChangeEventDetailQueryKey(data.id) });
        qc.invalidateQueries({ queryKey: getGetMilestoneDetailQueryKey(data.milestoneId) });
        qc.invalidateQueries({
          predicate: (q) => {
            const key = q.queryKey[0];
            return (
              typeof key === "string" &&
              (key.includes("/change-events") || key.includes("/pm-summary"))
            );
          },
        });
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

export default function PmChangeEventDetail() {
  const [, params] = useRoute("/pm/change-event/:id");
  const id = Number(params?.id);
  const { data, isLoading, isError } = useGetChangeEventDetail(id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTransition, setActiveTransition] = useState<TransitionConfig | null>(null);
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
          <Link href={`/pm/milestone/${data.milestoneId}`} className="font-mono text-muted-foreground hover:text-primary">{data.milestoneCode}</Link>
          {statusBadge(data.status)}
          <span className="text-muted-foreground">Opened {formatDistanceToNow(new Date(data.initiatedAt), { addSuffix: true })}</span>
          {data.clientDecisionAt && (
            <span className="text-muted-foreground">
              · Client decided {formatDistanceToNow(new Date(data.clientDecisionAt), { addSuffix: true })}
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{data.milestoneName}</h1>
        <p className="text-muted-foreground italic">"{data.changeReason}"</p>
      </header>

      <Card className="shadow-sm">
        <CardContent className="p-5 flex items-center gap-4 flex-wrap">
          <div className="text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Proposed shift</div>
            <div className="flex items-center gap-3">
              <span className="line-through text-muted-foreground">{format(new Date(data.oldDate), "MMM d, yyyy")}</span>
              <ArrowRight className="w-4 h-4" />
              <span className="font-bold">{format(new Date(data.proposedNewDate), "MMM d, yyyy")}</span>
              <Badge variant="outline" className={shift > 0 ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-primary/10 text-primary border-primary/20"}>
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
                    <div className="text-sm text-secondary-foreground flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Awaiting response · notified {formatDistanceToNow(new Date(i.notifiedAt), { addSuffix: true })}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
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
      />
    </div>
  );
}
