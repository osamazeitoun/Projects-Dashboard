import { useGetPmProjectSummary } from "@workspace/api-client-react";
import { usePmProjectId } from "@/components/pm-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  AlertTriangle,
  Flag,
  GitPullRequestArrow,
  Clock,
  CheckCircle2,
  ArrowRight,
  Activity,
  TrendingUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function PmDashboard() {
  const [projectId] = usePmProjectId();
  const { data, isLoading, isError } = useGetPmProjectSummary(projectId);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (isError || !data) {
    return <div className="p-6 text-destructive">Failed to load project summary.</div>;
  }

  const tiles = [
    {
      label: "Total Milestones",
      value: data.totalMilestones,
      sub: `${data.keyOutputCount} key outputs`,
      icon: Flag,
      tone: "text-[color:var(--c-gold)]",
      bg: "bg-surface-2",
    },
    {
      label: "At Risk",
      value: data.atRiskMilestoneCount + data.delayedMilestoneCount,
      sub: `${data.atRiskMilestoneCount} at risk · ${data.delayedMilestoneCount} delayed`,
      icon: AlertTriangle,
      tone: "text-destructive",
      bg: "bg-destructive/5",
    },
    {
      label: "Open Change Events",
      value: data.openChangeEventCount,
      sub: "awaiting responses",
      icon: GitPullRequestArrow,
      tone: "text-[color-mix(in_srgb,var(--c-warn)_70%,var(--c-ink))]",
      bg: "bg-surface-2",
      href: "/pm/change-events",
    },
    {
      label: "Overdue Responses",
      value: data.overdueResponseCount,
      sub: `of ${data.pendingResponseCount} pending`,
      icon: Clock,
      tone: data.overdueResponseCount > 0 ? "text-destructive" : "text-muted-foreground",
      bg: data.overdueResponseCount > 0 ? "bg-destructive/5" : "bg-muted",
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
            {data.projectCode}
          </div>
          <h1 className="font-serif text-4xl font-normal tracking-tight text-ink">{data.projectName}</h1>
          <p className="text-muted-foreground mt-1">
            Command center for {data.gcCompanyName}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((t) => {
          const card = (
            <Card className={`shadow-sm border-border hover:border-primary/30 transition-colors ${t.href ? "cursor-pointer" : ""}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t.label}
                </CardTitle>
                <div className={`p-1.5 rounded-md ${t.bg}`}>
                  <t.icon className={`h-4 w-4 ${t.tone}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${t.tone}`}>{t.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{t.sub}</div>
              </CardContent>
            </Card>
          );
          return t.href ? (
            <Link key={t.label} href={t.href}>{card}</Link>
          ) : (
            <div key={t.label}>{card}</div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4 text-[color:var(--c-gold)]" /> Stage Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.stages
                .filter((s) => s.milestoneCount > 0)
                .map((s) => {
                  const pct = s.milestoneCount > 0 ? (s.completedCount / s.milestoneCount) * 100 : 0;
                  return (
                    <div key={s.stageCode} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-muted-foreground font-mono w-8">S{s.order}</span>
                          <span className="font-medium truncate">{s.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs flex-shrink-0">
                          {s.atRiskCount > 0 && (
                            <span className="text-destructive font-medium">{s.atRiskCount} at risk</span>
                          )}
                          <span className="text-muted-foreground">
                            {s.completedCount}/{s.milestoneCount}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${s.atRiskCount > 0 ? "bg-[color:var(--c-warn)]" : "bg-ink"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
            <div className="mt-4 pt-4 border-t flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {data.completedMilestoneCount} completed across project
              </span>
              <Link href="/pm/schedule" className="text-[color:var(--c-gold)] font-medium hover:underline inline-flex items-center gap-1">
                Open master schedule <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="w-4 h-4 text-[color:var(--c-gold)]" /> Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recentActivity.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                No recent activity yet.
              </div>
            ) : (
              data.recentActivity.map((a) => (
                <div key={a.id} className="flex gap-3 text-sm">
                  <div
                    className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${a.kind === "ChangeEventOpened" ? "bg-[color-mix(in_srgb,var(--c-warn)_18%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-warn)_70%,var(--c-ink))]" : "bg-surface-2 text-ink"}`}
                  >
                    {a.kind === "ChangeEventOpened" ? (
                      <GitPullRequestArrow className="w-3.5 h-3.5" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm leading-tight">{a.summary}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(a.at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
