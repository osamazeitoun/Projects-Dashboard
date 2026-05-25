import { useRoute, Link } from "wouter";
import {
  useGetClientReviewDetail,
  useSubmitClientDecision,
  getGetClientReviewDetailQueryKey,
  getListClientReviewsQueryKey,
  type ChangeEventDetail,
  type ClientDecisionInputDecision,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
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
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

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

type DialogConfig = {
  decision: ClientDecisionInputDecision;
  title: string;
  description: string;
  commentLabel: string;
  requireComment: boolean;
  submitLabel: string;
  submitVariant: "default" | "destructive";
  successMessage: string;
};

const APPROVE_CONFIG: DialogConfig = {
  decision: "approve",
  title: "Approve this date change",
  description:
    "Your approval is recorded against your account and the project team will be notified.",
  commentLabel: "Comment (optional)",
  requireComment: false,
  submitLabel: "Approve",
  submitVariant: "default",
  successMessage: "Date change approved.",
};

const REJECT_CONFIG: DialogConfig = {
  decision: "reject",
  title: "Reject this date change",
  description:
    "Your rejection is recorded against your account. Please explain why so the project team can revise the plan.",
  commentLabel: "Reason for rejection (required)",
  requireComment: true,
  submitLabel: "Reject",
  submitVariant: "destructive",
  successMessage: "Date change rejected.",
};

function DecisionDialog({
  open,
  onOpenChange,
  config,
  changeEventId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: DialogConfig | null;
  changeEventId: number;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useSubmitClientDecision({
    mutation: {
      onSuccess: (data) => {
        toast({ title: config?.successMessage ?? "Decision recorded" });
        qc.invalidateQueries({
          queryKey: getGetClientReviewDetailQueryKey(data.id),
        });
        qc.invalidateQueries({ queryKey: getListClientReviewsQueryKey() });
        onOpenChange(false);
        setComment("");
        setError(null);
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Could not record your decision",
          description:
            (err as unknown as { error?: string })?.error ?? "Please try again.",
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
      setError("Please share a reason so the team understands your decision.");
      return;
    }
    setError(null);
    mutation.mutate({
      changeEventId,
      data: {
        decision: config.decision,
        ...(trimmed.length > 0 ? { comment: trimmed } : {}),
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
          <div className="space-y-1.5">
            <Label htmlFor="client-comment">{config.commentLabel}</Label>
            <Textarea
              id="client-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share any context for the project team..."
              className="h-24 resize-none"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
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
            <Button
              type="submit"
              variant={config.submitVariant}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Working..." : config.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ClientChangeEventDetail() {
  const [, params] = useRoute("/client/change-event/:id");
  const id = Number(params?.id);
  const { data, isLoading, isError, error } = useGetClientReviewDetail(id);
  const [activeDialog, setActiveDialog] = useState<DialogConfig | null>(null);

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (isError || !data) {
    const status = (error as unknown as { status?: number })?.status;
    if (status === 403) {
      return (
        <div className="p-6 max-w-5xl mx-auto">
          <Card className="p-8 text-center text-muted-foreground border-dashed">
            You don't have client-side access to this change event.
          </Card>
        </div>
      );
    }
    return <div className="p-6 text-destructive">Failed to load change event.</div>;
  }

  const isFieldEdit = data.editKind === "FieldEdit";
  const shift = !isFieldEdit && data.oldDate && data.proposedNewDate
    ? differenceInDays(new Date(data.proposedNewDate), new Date(data.oldDate))
    : 0;
  const canDecide = data.status === "SentForClientReview";
  const proposedChanges = (data.proposedChanges ?? null) as Record<string, unknown> | null;
  const changeLines: string[] = [];
  if (proposedChanges) {
    if (proposedChanges.name !== undefined) changeLines.push(`Name → "${proposedChanges.name}"`);
    if (proposedChanges.code !== undefined) changeLines.push(`Code → "${proposedChanges.code}"`);
    if (proposedChanges.description !== undefined) changeLines.push(`Description updated`);
    if (proposedChanges.ownerRole !== undefined) changeLines.push(`Owner role → ${proposedChanges.ownerRole}`);
    if (proposedChanges.criticalFlag !== undefined) changeLines.push(`Critical → ${proposedChanges.criticalFlag ? "yes" : "no"}`);
    if (proposedChanges.isKeyOutput !== undefined) changeLines.push(`Key output → ${proposedChanges.isKeyOutput ? "yes" : "no"}`);
    if (proposedChanges.isPaymentTrigger !== undefined) changeLines.push(`Payment trigger → ${proposedChanges.isPaymentTrigger ? "yes" : "no"}`);
    if (proposedChanges.ownerProjectCompanyIds !== undefined) changeLines.push(`Owner companies updated`);
    if (proposedChanges.contributorProjectCompanyIds !== undefined) changeLines.push(`Contributor companies updated`);
    if (proposedChanges.predecessorIds !== undefined) {
      const arr = proposedChanges.predecessorIds as number[];
      changeLines.push(`Predecessors → ${arr.length === 0 ? "none" : `${arr.length} milestone${arr.length === 1 ? "" : "s"}`}`);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <Link
          href="/client"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" /> Back to review inbox
        </Link>
      </div>

      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <Badge variant="outline">{data.stageName}</Badge>
          <span className="font-mono text-muted-foreground">{data.milestoneCode}</span>
          {statusBadge(data.status)}
          <span className="text-muted-foreground">
            Opened {formatDistanceToNow(new Date(data.initiatedAt), { addSuffix: true })}
          </span>
          {data.clientDecisionAt && (
            <span className="text-muted-foreground">
              · Decided {formatDistanceToNow(new Date(data.clientDecisionAt), { addSuffix: true })}
            </span>
          )}
        </div>
        <h1 className="font-serif text-4xl font-normal tracking-tight text-ink">{data.milestoneName}</h1>
        <p className="text-muted-foreground italic">"{data.changeReason}"</p>
      </header>

      <Card className="shadow-sm">
        <CardContent className="p-5 flex items-start gap-4 flex-wrap">
          <div className="text-sm flex-1 min-w-[260px]">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              {isFieldEdit ? "Proposed changes" : "Proposed shift"}
            </div>
            {isFieldEdit ? (
              changeLines.length === 0 ? (
                <p className="text-muted-foreground italic">No field changes recorded.</p>
              ) : (
                <ul className="space-y-1 list-disc pl-5">
                  {changeLines.map((line, i) => (<li key={i}>{line}</li>))}
                </ul>
              )
            ) : (
              data.oldDate && data.proposedNewDate && (
                <div className="flex items-center gap-3">
                  <span className="line-through text-muted-foreground">
                    {format(new Date(data.oldDate), "MMM d, yyyy")}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                  <span className="font-bold">
                    {format(new Date(data.proposedNewDate), "MMM d, yyyy")}
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      shift > 0
                        ? "bg-[color-mix(in_srgb,var(--c-danger)_14%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-danger)_70%,var(--c-ink))] border-[color-mix(in_srgb,var(--c-danger)_30%,var(--c-line))]"
                        : "bg-[color-mix(in_srgb,var(--c-info)_14%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-info)_70%,var(--c-ink))] border-[color-mix(in_srgb,var(--c-info)_30%,var(--c-line))]"
                    }
                  >
                    {shift > 0 ? `+${shift}` : shift} days
                  </Badge>
                </div>
              )
            )}
          </div>
          {data.clientComment && (
            <div className="ml-auto text-sm text-muted-foreground italic max-w-md">
              <span className="font-medium not-italic text-foreground">
                Your comment:
              </span>{" "}
              "{data.clientComment}"
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your decision</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {canDecide ? (
            <>
              <p className="text-sm text-muted-foreground">
                Review the proposed change and approve or reject it. Your decision
                is final and is recorded against your account.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setActiveDialog(APPROVE_CONFIG)}>
                  <ThumbsUp className="w-4 h-4 mr-1.5" />
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setActiveDialog(REJECT_CONFIG)}
                >
                  <ThumbsDown className="w-4 h-4 mr-1.5" />
                  Reject
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {data.status === "ClientApproved" &&
                "You approved this change. The project team will finalize it."}
              {data.status === "ClientRejected" &&
                "You rejected this change. The project team has been notified."}
              {data.status === "PMApproved" &&
                "This change has been approved and applied to the milestone."}
              {data.status === "Cancelled" &&
                "This change event has been cancelled by the project team."}
              {data.status === "Draft" &&
                "This change event hasn't been sent for your review yet."}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">
            Contractor feedback ({data.impacts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.impacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No contractors have been notified about this change yet.
            </p>
          ) : (
            <div className="divide-y border rounded-md">
              {data.impacts.map((i) => (
                <div
                  key={i.id}
                  className="p-4 flex flex-col md:flex-row gap-3 md:items-start"
                >
                  <div className="md:w-56 flex-shrink-0">
                    <div className="font-semibold">{i.companyName}</div>
                    <div className="text-xs text-muted-foreground">{i.companyRole}</div>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    {i.responseStatus === "Pending" ? (
                      <div className="text-sm text-[color-mix(in_srgb,var(--c-warn)_70%,var(--c-ink))] flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Awaiting response · notified{" "}
                        {formatDistanceToNow(new Date(i.notifiedAt), { addSuffix: true })}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-xs flex-wrap">
                          <CheckCircle2 className="w-4 h-4 text-[color:var(--c-success)]" />
                          {riskBadge(i.impactRiskLevel ?? null)}
                          {i.impactRiskType && (
                            <Badge variant="outline">{i.impactRiskType}</Badge>
                          )}
                          <span className="text-muted-foreground">
                            {i.respondedAt &&
                              `responded ${formatDistanceToNow(new Date(i.respondedAt), { addSuffix: true })}`}
                          </span>
                        </div>
                        {i.mainRiskIssue && (
                          <div className="text-sm font-medium">{i.mainRiskIssue}</div>
                        )}
                        {i.detailedComment && (
                          <p className="text-sm text-muted-foreground">{i.detailedComment}</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DecisionDialog
        open={activeDialog !== null}
        onOpenChange={(o) => {
          if (!o) setActiveDialog(null);
        }}
        config={activeDialog}
        changeEventId={id}
      />
    </div>
  );
}
