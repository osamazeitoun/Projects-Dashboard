import { useRoute, Link, useLocation } from "wouter";
import { useState } from "react";
import {
  useGetBaselineReviewDetail,
  useSubmitBaselineDecision,
  getListBaselineReviewsQueryKey,
  getGetBaselineReviewDetailQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft, CheckCircle2, XCircle, ClipboardCheck, Flag, Loader2,
} from "lucide-react";

export default function ClientBaselineReview() {
  const [, params] = useRoute("/client/baseline-review/:id");
  const id = Number(params?.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useGetBaselineReviewDetail(id);
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [comment, setComment] = useState("");

  const submit = useSubmitBaselineDecision({
    mutation: {
      onSuccess: () => {
        toast({
          title: decision === "approve" ? "Baseline approved" : "Baseline rejected",
        });
        qc.invalidateQueries({ queryKey: getListBaselineReviewsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetBaselineReviewDetailQueryKey(id) });
        setDecision(null);
        setComment("");
        navigate("/client/inbox");
      },
      onError: (err) => toast({
        variant: "destructive",
        title: "Decision failed",
        description: (err as unknown as { error?: string })?.error ?? "Try again.",
      }),
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-96" />
        <Skeleton className="h-40" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }
  if (isError || !data) {
    return <div className="p-6 text-destructive">Failed to load baseline.</div>;
  }

  const isPending = data.status === "Pending";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <Link href="/client/inbox" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to inbox
        </Link>
      </div>

      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <Badge variant="outline">{data.projectCode}</Badge>
          <Badge variant="outline" className={
            data.status === "Pending" ? "bg-amber-50 text-amber-700 border-amber-200" :
            data.status === "Approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
            "bg-destructive/10 text-destructive border-destructive/30"
          }>
            {data.status}
          </Badge>
        </div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ClipboardCheck className="w-7 h-7 text-primary" /> Schedule baseline review
        </h1>
        <p className="text-muted-foreground">
          {data.projectName} · {data.milestones.length} milestone{data.milestones.length === 1 ? "" : "s"} ·
          submitted {formatDistanceToNow(new Date(data.submittedAt), { addSuffix: true })}
          {data.submittedByEmail ? ` by ${data.submittedByEmail}` : ""}
        </p>
      </header>

      {data.submissionNote && (
        <Card className="p-4 bg-muted/40">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Note from project manager</div>
          <p className="text-sm italic">"{data.submissionNote}"</p>
        </Card>
      )}

      {data.decisionComment && data.status !== "Pending" && (
        <Card className={`p-4 ${data.status === "Approved" ? "border-emerald-200 bg-emerald-50/50" : "border-destructive/30 bg-destructive/5"}`}>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Your decision {data.decidedAt && `· ${format(new Date(data.decidedAt), "MMM d, yyyy")}`}
          </div>
          <p className="text-sm italic">"{data.decisionComment}"</p>
        </Card>
      )}

      <Card className="overflow-hidden shadow-sm p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Stage</TableHead>
              <TableHead>Milestone</TableHead>
              <TableHead>Owner role</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.milestones.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-32 text-muted-foreground">
                  No milestones in this baseline.
                </TableCell>
              </TableRow>
            ) : data.milestones.map((m) => (
              <TableRow key={m.milestoneId}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {m.stageName ?? m.stageCode}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{m.code}</span>
                    {m.isKeyOutput && <Badge className="text-[10px] h-4 px-1 py-0 uppercase">Key</Badge>}
                    {m.criticalFlag && (
                      <Badge variant="destructive" className="text-[10px] h-4 px-1 py-0 uppercase">
                        <Flag className="w-3 h-3 mr-1" />Critical
                      </Badge>
                    )}
                  </div>
                  <div className="font-medium text-sm">{m.name}</div>
                </TableCell>
                <TableCell className="text-xs">{m.ownerRole}</TableCell>
                <TableCell className="text-sm tabular-nums whitespace-nowrap">
                  {format(new Date(m.baselineDate), "MMM d, yyyy")}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {m.isPaymentTrigger ? "$ payment" : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {isPending && (
        <Card className="p-6 sticky bottom-4 shadow-md border-primary/30">
          <CardHeader className="p-0 mb-3">
            <CardTitle className="text-base">Your decision</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex gap-3">
            <Button onClick={() => setDecision("approve")} className="bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="w-4 h-4 mr-1" /> Approve baseline
            </Button>
            <Button onClick={() => setDecision("reject")} variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10">
              <XCircle className="w-4 h-4 mr-1" /> Reject baseline
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={decision !== null} onOpenChange={(o) => { if (!o) { setDecision(null); setComment(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === "approve" ? "Approve baseline?" : "Reject baseline?"}
            </DialogTitle>
            <DialogDescription>
              {decision === "approve"
                ? "Approving locks the schedule. Any future changes will be tracked as change events."
                : "Rejecting sends the schedule back to Draft. The project manager will be able to revise and resubmit."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="decision-comment">
              Comment {decision === "reject" ? "(required)" : "(optional)"}
            </Label>
            <Textarea
              id="decision-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="h-24 resize-none"
              placeholder={decision === "reject" ? "Let the project manager know what needs to change..." : "Anything you want to note?"}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)} disabled={submit.isPending}>Cancel</Button>
            <Button
              onClick={() => submit.mutate({
                baselineId: id,
                data: { decision: decision!, comment: comment.trim() || undefined },
              })}
              disabled={submit.isPending || (decision === "reject" && !comment.trim())}
              className={decision === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-destructive hover:bg-destructive/90"}
            >
              {submit.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {decision === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
