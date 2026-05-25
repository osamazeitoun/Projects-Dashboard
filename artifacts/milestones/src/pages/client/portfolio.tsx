import { useMemo, useState } from "react";
import { useGetClientPortfolio, type ClientPortfolioProject } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "wouter";
import { format, differenceInDays } from "date-fns";
import {
  LayoutDashboard,
  Building2,
  ChevronRight,
  ChevronDown,
  Maximize2,
  Minimize2,
} from "lucide-react";

const COMPANY_PALETTE = [
  "#3a5773",
  "#a87937",
  "#4a6b3f",
  "#8a3a2c",
  "#6b5d4f",
  "#a06b8c",
  "#5b7a8a",
  "#7d6b3f",
  "#3f6b6b",
  "#7a4a6b",
];

function colorForCompany(companyId: number, registry: Map<number, string>): string {
  const existing = registry.get(companyId);
  if (existing) return existing;
  const next = COMPANY_PALETTE[registry.size % COMPANY_PALETTE.length];
  registry.set(companyId, next);
  return next;
}

function statusBadge(status: string) {
  switch (status) {
    case "Baselined":
      return <Badge variant="success">Baselined</Badge>;
    case "PendingBaseline":
      return <Badge variant="warn">Pending baseline</Badge>;
    default:
      return <Badge variant="neutral">Draft</Badge>;
  }
}

function ProjectRow({
  project,
  axisStart,
  axisEnd,
  colorRegistry,
  expanded,
  onToggle,
  density,
}: {
  project: ClientPortfolioProject;
  axisStart: Date;
  axisEnd: Date;
  colorRegistry: Map<number, string>;
  expanded: boolean;
  onToggle: () => void;
  density: "comfortable" | "spacious";
}) {
  const totalMs = axisEnd.getTime() - axisStart.getTime();
  const span = totalMs > 0 ? totalMs : 1;
  const start = project.startDate ? new Date(project.startDate) : null;
  const end = project.endDate ? new Date(project.endDate) : null;

  const projectLeft = start
    ? ((start.getTime() - axisStart.getTime()) / span) * 100
    : 0;
  const projectWidth = start && end
    ? Math.max(((end.getTime() - start.getTime()) / span) * 100, 1)
    : 0;

  const rowHeight = density === "spacious" ? "h-16" : "h-12";
  const segHeight = density === "spacious" ? "h-8" : "h-6";

  return (
    <div className="border-t border-line">
      <div className="grid grid-cols-[280px_1fr] gap-4 items-center py-3">
        <div className="flex items-start gap-1">
          <button
            type="button"
            onClick={onToggle}
            className="mt-1 text-ink-3 hover:text-ink rounded p-0.5"
            aria-label={expanded ? "Collapse project" : "Expand project"}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <Link
            href={`/client/portfolio/${project.id}`}
            className="block group flex-1 min-w-0"
          >
            <div className="flex items-center gap-2 text-xs text-ink-3 uppercase tracking-wider font-semibold">
              <span>{project.code}</span>
              {statusBadge(project.scheduleStatus)}
            </div>
            <div className="font-serif text-lg text-ink group-hover:underline truncate">
              {project.name}
            </div>
            <div className="text-xs text-ink-3 mt-0.5">
              {start && end
                ? `${format(start, "MMM yyyy")} – ${format(end, "MMM yyyy")} · ${differenceInDays(end, start)} days · ${project.companies.length} companies`
                : `${project.milestoneCount} milestone${project.milestoneCount === 1 ? "" : "s"}`}
            </div>
          </Link>
        </div>

        <div className={`relative ${rowHeight}`}>
          {start && end && projectWidth > 0 ? (
            <>
              <div
                className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full"
                style={{
                  left: `${projectLeft}%`,
                  width: `${projectWidth}%`,
                  background: "var(--c-line-2, #d9d5c7)",
                }}
              />
              {project.companies.map((c) => {
                const entry = new Date(c.entryDate);
                const exit = new Date(c.exitDate);
                const left = ((entry.getTime() - axisStart.getTime()) / span) * 100;
                const width = Math.max(
                  ((exit.getTime() - entry.getTime()) / span) * 100,
                  0.6,
                );
                const color = colorForCompany(c.companyId, colorRegistry);
                return (
                  <Tooltip key={c.projectCompanyId}>
                    <TooltipTrigger asChild>
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 ${segHeight} rounded-sm flex items-center px-1.5 text-[10px] font-semibold text-white truncate cursor-default shadow-sm`}
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          background: color,
                          minWidth: "8px",
                        }}
                      >
                        <span className="truncate">{c.name}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.role}</div>
                      <div className="text-xs mt-1">
                        {format(entry, "MMM d, yyyy")} → {format(exit, "MMM d, yyyy")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {differenceInDays(exit, entry)} days on project
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center text-xs text-ink-4 italic">
              No milestones scheduled yet
            </div>
          )}
        </div>
      </div>

      {expanded && start && end && projectWidth > 0 && project.companies.length > 0 && (
        <div className="pb-4 pl-7 pr-0">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-2 pl-1">
            Per-company involvement
          </div>
          <div className="space-y-1.5">
            {project.companies.map((c) => {
              const entry = new Date(c.entryDate);
              const exit = new Date(c.exitDate);
              const left = ((entry.getTime() - axisStart.getTime()) / span) * 100;
              const width = Math.max(
                ((exit.getTime() - entry.getTime()) / span) * 100,
                0.6,
              );
              const color = colorForCompany(c.companyId, colorRegistry);
              const days = differenceInDays(exit, entry);
              return (
                <div
                  key={c.projectCompanyId}
                  className="grid grid-cols-[280px_1fr] gap-4 items-center"
                >
                  <div className="flex items-center gap-2 min-w-0 pl-1">
                    <span
                      className="h-3 w-3 rounded-sm shrink-0"
                      style={{ background: color }}
                    />
                    <div className="min-w-0">
                      <div className="text-sm text-ink truncate">{c.name}</div>
                      <div className="text-[11px] text-ink-3 truncate">
                        {c.role} · {days} days
                      </div>
                    </div>
                  </div>
                  <div className="relative h-12">
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-0.5"
                      style={{
                        left: `${projectLeft}%`,
                        width: `${projectWidth}%`,
                        background: "var(--c-line-2, #d9d5c7)",
                      }}
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-5 rounded-sm shadow-sm"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        background: color,
                        minWidth: "6px",
                      }}
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow"
                      style={{
                        left: `calc(${left}% - 6px)`,
                        background: color,
                      }}
                      title={`Entry: ${format(entry, "MMM d, yyyy")}`}
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow"
                      style={{
                        left: `calc(${left + width}% - 6px)`,
                        background: color,
                      }}
                      title={`Exit: ${format(exit, "MMM d, yyyy")}`}
                    />
                    <div
                      className="absolute top-0 text-[11px] font-semibold text-ink whitespace-nowrap px-1.5 py-0.5 rounded bg-background/95 border border-line shadow-sm"
                      style={{ left: `calc(${left}% - 4px)`, transform: "translateX(-100%)" }}
                    >
                      <span className="text-ink-3 mr-1">In</span>
                      {format(entry, "MMM d, yyyy")}
                    </div>
                    <div
                      className="absolute bottom-0 text-[11px] font-semibold text-ink whitespace-nowrap px-1.5 py-0.5 rounded bg-background/95 border border-line shadow-sm"
                      style={{ left: `calc(${left + width}% + 4px)` }}
                    >
                      <span className="text-ink-3 mr-1">Out</span>
                      {format(exit, "MMM d, yyyy")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TimeAxis({ start, end }: { start: Date; end: Date }) {
  const ticks = useMemo(() => {
    const result: Date[] = [];
    const totalMs = end.getTime() - start.getTime();
    if (totalMs <= 0) return result;
    const months = Math.max(
      1,
      (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth()),
    );
    const step = months <= 12 ? 1 : months <= 36 ? 3 : 6;
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      result.push(new Date(cursor));
      cursor.setMonth(cursor.getMonth() + step);
    }
    return result;
  }, [start, end]);

  const span = end.getTime() - start.getTime() || 1;

  return (
    <div className="grid grid-cols-[280px_1fr] gap-4 sticky top-0 bg-background z-10 pt-2 pb-2 border-b border-line">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-3">
        Project
      </div>
      <div className="relative h-5">
        {ticks.map((t, i) => {
          const left = ((t.getTime() - start.getTime()) / span) * 100;
          return (
            <div
              key={i}
              className="absolute top-0 -translate-x-1/2 text-[10px] uppercase tracking-wider text-ink-3 font-semibold"
              style={{ left: `${Math.max(0, Math.min(left, 100))}%` }}
            >
              {format(t, "MMM ''yy")}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ClientPortfolio() {
  const { data, isLoading, isError } = useGetClientPortfolio();

  const colorRegistry = useMemo(() => new Map<number, string>(), []);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [wide, setWide] = useState(false);

  const toggleRow = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (!data) return;
    setExpandedIds(new Set(data.map((p) => p.id)));
  };
  const collapseAll = () => setExpandedIds(new Set());

  const { axisStart, axisEnd, legend } = useMemo(() => {
    if (!data || data.length === 0) {
      const now = new Date();
      return {
        axisStart: now,
        axisEnd: new Date(now.getFullYear() + 1, now.getMonth(), 1),
        legend: [] as { id: number; name: string; color: string }[],
      };
    }
    let min: number | null = null;
    let max: number | null = null;
    const companies = new Map<number, string>();
    for (const p of data) {
      if (p.startDate) {
        const t = new Date(p.startDate).getTime();
        if (min === null || t < min) min = t;
      }
      if (p.endDate) {
        const t = new Date(p.endDate).getTime();
        if (max === null || t > max) max = t;
      }
      for (const c of p.companies) {
        if (!companies.has(c.companyId)) companies.set(c.companyId, c.name);
      }
    }
    const now = Date.now();
    const start = new Date(min ?? now);
    const end = new Date(max ?? now);
    const pad = Math.max((end.getTime() - start.getTime()) * 0.03, 1000 * 60 * 60 * 24 * 7);
    const legendList = Array.from(companies.entries()).map(([id, name]) => ({
      id,
      name,
      color: colorForCompany(id, colorRegistry),
    }));
    return {
      axisStart: new Date(start.getTime() - pad),
      axisEnd: new Date(end.getTime() + pad),
      legend: legendList,
    };
  }, [data, colorRegistry]);

  const containerClass = wide ? "p-6 w-full space-y-6" : "p-6 max-w-7xl mx-auto space-y-6";
  const density: "comfortable" | "spacious" = wide ? "spacious" : "comfortable";

  if (isLoading) {
    return (
      <div className={containerClass}>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }
  if (isError || !data) {
    return <div className="p-6 text-destructive">Failed to load portfolio.</div>;
  }

  const anyExpanded = expandedIds.size > 0;
  const allExpanded = data.length > 0 && expandedIds.size === data.length;

  return (
    <div className={containerClass}>
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-4xl font-normal tracking-tight text-ink flex items-center gap-2">
            <LayoutDashboard className="w-7 h-7 text-[color:var(--c-gold)]" />
            Portfolio
          </h1>
          <p className="text-muted-foreground mt-1">
            Every project across your portfolio on one timeline — who's on each project, when they came in, and when they wrap.
          </p>
        </div>
        {data.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={allExpanded ? collapseAll : expandAll}
            >
              {allExpanded ? (
                <>
                  <ChevronRight className="w-4 h-4 mr-1" /> Collapse all
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 mr-1" />
                  {anyExpanded ? "Expand all" : "Expand all"}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWide((w) => !w)}
              aria-label={wide ? "Exit wide view" : "Expand to wide view"}
            >
              {wide ? (
                <>
                  <Minimize2 className="w-4 h-4 mr-1" /> Compact view
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4 mr-1" /> Wide view
                </>
              )}
            </Button>
          </div>
        )}
      </header>

      {data.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground border-dashed">
          You don't have any projects assigned yet.
        </Card>
      ) : (
        <Card className="p-4 shadow-sm overflow-x-auto">
          <TimeAxis start={axisStart} end={axisEnd} />
          <div>
            {data.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                axisStart={axisStart}
                axisEnd={axisEnd}
                colorRegistry={colorRegistry}
                expanded={expandedIds.has(p.id)}
                onToggle={() => toggleRow(p.id)}
                density={density}
              />
            ))}
          </div>
          {legend.length > 0 && (
            <div className="pt-4 mt-4 border-t border-line">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-2 flex items-center gap-1">
                <Building2 className="w-3 h-3" /> Contractor companies
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {legend.map((c) => (
                  <div key={c.id} className="flex items-center gap-1.5 text-xs">
                    <span
                      className="h-3 w-3 rounded-sm"
                      style={{ background: c.color }}
                    />
                    <span className="text-ink-2">{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
