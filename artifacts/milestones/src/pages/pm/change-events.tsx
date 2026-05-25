import { useGetProjectChangeEvents } from "@workspace/api-client-react";
import { usePmProjectId } from "@/components/pm-layout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { ArrowRight, GitPullRequestArrow } from "lucide-react";

function rollupBadge(r: string) {
  switch (r) {
    case "FullyResponded":
      return <Badge variant="success" withDot>Fully responded</Badge>;
    case "PartiallyResponded":
      return <Badge variant="info" withDot>Partially responded</Badge>;
    default:
      return <Badge variant="warn" withDot>Pending</Badge>;
  }
}

export default function PmChangeEvents() {
  const [projectId] = usePmProjectId();
  const { data, isLoading, isError } = useGetProjectChangeEvents(projectId);

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }
  if (isError || !data) return <div className="p-6 text-destructive">Failed to load change events.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="font-serif text-4xl font-normal tracking-tight text-ink flex items-center gap-2">
          <GitPullRequestArrow className="w-7 h-7 text-[color:var(--c-gold)]" />
          Change Events
        </h1>
        <p className="text-muted-foreground mt-1">All date-change proposals issued on this project.</p>
      </header>

      {data.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground border-dashed">No change events have been issued yet.</Card>
      ) : (
        <div className="space-y-3">
          {data.map((ev) => {
            const shift = ev.oldDate && ev.proposedNewDate
              ? differenceInDays(new Date(ev.proposedNewDate), new Date(ev.oldDate))
              : 0;
            return (
              <Link key={ev.id} href={`/pm/change-event/${ev.id}`}>
                <Card className="p-4 shadow-sm hover:border-primary/40 transition-colors cursor-pointer">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <Badge variant="outline">{ev.stageName}</Badge>
                        <span className="font-mono text-muted-foreground">{ev.milestoneCode}</span>
                        <Badge variant="outline">{ev.status}</Badge>
                        <span className="text-muted-foreground">opened {formatDistanceToNow(new Date(ev.initiatedAt), { addSuffix: true })}</span>
                      </div>
                      <div className="font-semibold">{ev.milestoneName}</div>
                      <p className="text-sm text-muted-foreground italic">"{ev.changeReason}"</p>
                      {ev.oldDate && ev.proposedNewDate ? (
                        <div className="flex items-center gap-3 text-sm">
                          <span className="line-through text-muted-foreground">{format(new Date(ev.oldDate), "MMM d, yyyy")}</span>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          <span className="font-bold">{format(new Date(ev.proposedNewDate), "MMM d, yyyy")}</span>
                          <Badge variant="outline" className={shift > 0 ? "bg-[color-mix(in_srgb,var(--c-danger)_14%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-danger)_70%,var(--c-ink))] border-[color-mix(in_srgb,var(--c-danger)_30%,var(--c-line))]" : "bg-[color-mix(in_srgb,var(--c-info)_14%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-info)_70%,var(--c-ink))] border-[color-mix(in_srgb,var(--c-info)_30%,var(--c-line))]"}>
                            {shift > 0 ? `+${shift}` : shift} days
                          </Badge>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground italic">Field edit (no date change)</div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      {rollupBadge(ev.rollupStatus)}
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {ev.respondedCount}/{ev.impactedCompanyCount} responded
                      </div>
                      {ev.pendingCount > 0 && (
                        <div className="text-xs font-medium text-[color-mix(in_srgb,var(--c-warn)_70%,var(--c-ink))]">{ev.pendingCount} pending</div>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
