import {
  useGetMyProjectSummary,
  getGetMyProjectSummaryQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Flag, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: summary, isLoading, isError } = useGetMyProjectSummary({
    query: { queryKey: getGetMyProjectSummaryQueryKey() },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div className="p-6 text-destructive">
        Failed to load project summary.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Company Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your milestones and required actions.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border hover:border-primary/50 transition-colors shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming Milestones</CardTitle>
            <Flag className="h-4 w-4 text-[color:var(--c-gold)]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.upcomingMilestoneCount}</div>
            <p className="text-xs text-muted-foreground mt-1 mb-4">All upcoming milestones for your company</p>
            <Link href="/milestones" className="text-sm font-medium text-[color:var(--c-gold)] hover:underline inline-flex items-center gap-1">
              View Milestones <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card className="border-border hover:border-line-2 transition-colors shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Responses</CardTitle>
            <AlertTriangle className="h-4 w-4 text-[color:var(--c-warn)]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[color-mix(in_srgb,var(--c-warn)_70%,var(--c-ink))]">{summary.pendingImpactCount}</div>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Schedule changes requiring your risk assessment</p>
            <Link href="/responses" className="text-sm font-medium text-[color:var(--c-warn)] hover:underline inline-flex items-center gap-1">
              Respond Now <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">Project Lifecycle</h2>
        <div className="grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-5">
          {summary.stages.map((stage) => {
            const hasMilestones = stage.companyMilestoneCount > 0;
            return (
              <Card
                key={stage.stageCode}
                className={`flex flex-col text-sm border-t-4 transition-all ${hasMilestones ? 'border-t-[color:var(--c-gold)] bg-surface-2 shadow-sm' : 'border-t-muted bg-card shadow-none opacity-60 hover:opacity-100'}`}
              >
                <div className="p-3 pb-2 flex-1">
                  <div className="font-semibold text-xs text-muted-foreground mb-1">STAGE {stage.order}</div>
                  <div className="font-bold leading-tight">{stage.name}</div>
                </div>
                <div className="px-3 py-2 bg-muted/30 border-t flex justify-between text-xs mt-auto">
                  <span title="Total Milestones" className="text-muted-foreground">{stage.milestoneCount} Total</span>
                  {hasMilestones && (
                    <span title="Your Milestones" className="font-bold text-[color:var(--c-gold)]">{stage.companyMilestoneCount} Yours</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
