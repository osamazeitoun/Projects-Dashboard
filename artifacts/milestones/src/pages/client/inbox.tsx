import {
  useListClientReviews,
  useListBaselineReviews,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { ArrowRight, Inbox, ClipboardCheck, FilePenLine } from "lucide-react";

function summarizeChanges(changes: Record<string, unknown> | null | undefined): string[] {
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
  if (changes.predecessorIds !== undefined) {
    const arr = changes.predecessorIds as number[];
    lines.push(`Predecessors → ${arr.length === 0 ? "none" : `${arr.length} milestone${arr.length === 1 ? "" : "s"}`}`);
  }
  return lines;
}

export default function ClientInbox() {
  const { data: events, isLoading: eventsLoading, isError: eventsError } = useListClientReviews();
  const { data: baselines, isLoading: baselinesLoading, isError: baselinesError } = useListBaselineReviews();

  if (eventsLoading || baselinesLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }
  if (eventsError || baselinesError || !events || !baselines) {
    return <div className="p-6 text-destructive">Failed to load review inbox.</div>;
  }

  const total = events.length + baselines.length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <header>
        <h1 className="font-serif text-4xl font-normal tracking-tight text-ink flex items-center gap-2">
          <Inbox className="w-7 h-7 text-[color:var(--c-gold)]" />
          Awaiting your decision
        </h1>
        <p className="text-muted-foreground mt-1">
          Approve or reject each pending baseline submission or change request. Your decision is recorded against your account.
        </p>
      </header>

      {total === 0 && (
        <Card className="p-12 text-center text-muted-foreground border-dashed">
          You're all caught up — nothing is waiting for your decision.
        </Card>
      )}

      {baselines.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" /> Schedule baselines ({baselines.length})
          </h2>
          {baselines.map((b) => (
            <Link key={b.id} href={`/client/baseline-review/${b.id}`}>
              <Card className="p-4 shadow-sm hover:border-primary/40 transition-colors cursor-pointer">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <Badge variant="outline">{b.projectCode}</Badge>
                      <span className="text-muted-foreground">{b.projectName}</span>
                      <span className="text-muted-foreground">
                        submitted {formatDistanceToNow(new Date(b.submittedAt), { addSuffix: true })}
                      </span>
                      {b.submittedByEmail && (
                        <span className="text-muted-foreground">by {b.submittedByEmail}</span>
                      )}
                    </div>
                    <div className="font-semibold">
                      Master schedule baseline · {b.milestoneCount} milestone{b.milestoneCount === 1 ? "" : "s"}
                    </div>
                    {b.submissionNote && (
                      <p className="text-sm text-muted-foreground italic">"{b.submissionNote}"</p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    <Badge variant="warn" withDot>
                      Awaiting your decision
                    </Badge>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </section>
      )}

      {events.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Change requests ({events.length})
          </h2>
          {events.map((ev) => {
            const isFieldEdit = ev.editKind === "FieldEdit";
            const shift = !isFieldEdit && ev.oldDate && ev.proposedNewDate
              ? differenceInDays(new Date(ev.proposedNewDate), new Date(ev.oldDate))
              : 0;
            const summary = isFieldEdit ? summarizeChanges(ev.proposedChanges as Record<string, unknown> | null | undefined) : [];
            return (
              <Link key={ev.id} href={`/client/change-event/${ev.id}`}>
                <Card className="p-4 shadow-sm hover:border-primary/40 transition-colors cursor-pointer">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <Badge variant="outline">{ev.projectCode}</Badge>
                        <span className="text-muted-foreground">{ev.projectName}</span>
                        <Badge variant="outline">{ev.stageName}</Badge>
                        <span className="font-mono text-muted-foreground">{ev.milestoneCode}</span>
                        <Badge variant="outline" className={isFieldEdit ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-secondary/10 text-secondary-foreground border-secondary/30"}>
                          {isFieldEdit ? (<><FilePenLine className="w-3 h-3 mr-1" />Field edit</>) : "Date change"}
                        </Badge>
                        <span className="text-muted-foreground">
                          opened {formatDistanceToNow(new Date(ev.initiatedAt), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="font-semibold">{ev.milestoneName}</div>
                      <p className="text-sm text-muted-foreground italic">"{ev.changeReason}"</p>
                      {isFieldEdit ? (
                        summary.length > 0 && (
                          <ul className="text-sm space-y-0.5 pl-4 list-disc">
                            {summary.map((line, i) => (<li key={i}>{line}</li>))}
                          </ul>
                        )
                      ) : (
                        ev.oldDate && ev.proposedNewDate && (
                          <div className="flex items-center gap-3 text-sm">
                            <span className="line-through text-muted-foreground">{format(new Date(ev.oldDate), "MMM d, yyyy")}</span>
                            <ArrowRight className="w-4 h-4 text-muted-foreground" />
                            <span className="font-bold">{format(new Date(ev.proposedNewDate), "MMM d, yyyy")}</span>
                            <Badge variant={shift > 0 ? "danger" : "info"}>
                              {shift > 0 ? `+${shift}` : shift} days
                            </Badge>
                          </div>
                        )
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      <Badge variant="warn" withDot>Awaiting your decision</Badge>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}
