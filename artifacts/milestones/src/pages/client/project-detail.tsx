import { useRoute, Link } from "wouter";
import { useGetClientPortfolio } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Building2 } from "lucide-react";
import { format, differenceInDays } from "date-fns";

export default function ClientProjectDetail() {
  const [, params] = useRoute<{ id: string }>("/client/portfolio/:id");
  const id = params?.id ? Number(params.id) : NaN;
  const { data, isLoading, isError } = useGetClientPortfolio();

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }
  if (isError || !data) {
    return <div className="p-6 text-destructive">Failed to load project.</div>;
  }

  const project = data.find((p) => p.id === id);
  if (!project) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Link href="/client/portfolio" className="text-sm text-ink-3 hover:text-ink inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to portfolio
        </Link>
        <Card className="p-12 text-center text-muted-foreground border-dashed">
          Project not found, or you don't have access.
        </Card>
      </div>
    );
  }

  const start = project.startDate ? new Date(project.startDate) : null;
  const end = project.endDate ? new Date(project.endDate) : null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <Link href="/client/portfolio" className="text-sm text-ink-3 hover:text-ink inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to portfolio
      </Link>
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-ink-3 uppercase tracking-wider font-semibold">
          <span>{project.code}</span>
          <Badge variant="neutral">{project.scheduleStatus}</Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          {project.name}
        </h1>
        <p className="text-muted-foreground">
          {start && end
            ? `${format(start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")} · ${differenceInDays(end, start)} days · ${project.milestoneCount} milestones`
            : `${project.milestoneCount} milestones`}
        </p>
      </header>

      <Card className="p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <Building2 className="w-4 h-4" /> Contractor companies on this project
        </h2>
        {project.companies.length === 0 ? (
          <div className="text-sm text-ink-3 italic">No contractor companies assigned yet.</div>
        ) : (
          <div className="divide-y divide-line">
            {project.companies.map((c) => {
              const entry = new Date(c.entryDate);
              const exit = new Date(c.exitDate);
              return (
                <div key={c.projectCompanyId} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-ink">{c.name}</div>
                    <div className="text-xs text-ink-3">{c.role}</div>
                  </div>
                  <div className="text-sm text-ink-2 tabular-nums whitespace-nowrap">
                    {format(entry, "MMM d, yyyy")} <span className="text-ink-4">→</span> {format(exit, "MMM d, yyyy")}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
