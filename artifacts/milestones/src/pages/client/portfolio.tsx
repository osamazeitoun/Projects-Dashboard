import { useMemo, useState } from "react";
import {
  useGetClientPortfolio,
  type ClientPortfolioProject,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  "#2563eb",
  "#7c3aed",
  "#059669",
  "#d97706",
  "#e11d48",
  "#0891b2",
  "#4f46e5",
  "#0d9488",
  "#c026d3",
  "#475569",
];

function colorForCompany(
  companyId: number,
  registry: Map<number, string>,
): string {
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

// Shared month/quarter tick computation so the axis labels and the row
// gridlines line up exactly.
function computeTicks(start: Date, end: Date): Date[] {
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
    if (cursor >= start) result.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + step);
  }
  return result;
}

function pct(date: Date, axisStart: Date, span: number): number {
  return ((date.getTime() - axisStart.getTime()) / span) * 100;
}

// Faint vertical gridlines (aligned to the axis ticks) plus a "Today" marker,
// drawn behind the bars so the eye can map any bar back to a date.
function TimelineGrid({
  ticks,
  axisStart,
  span,
}: {
  ticks: Date[];
  axisStart: Date;
  span: number;
}) {
  const todayLeft = pct(new Date(), axisStart, span);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {ticks.map((t, i) => {
        const left = pct(t, axisStart, span);
        if (left < 0 || left > 100) return null;
        return (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-px bg-line"
            style={{ left: `${left}%` }}
          />
        );
      })}
      {todayLeft >= 0 && todayLeft <= 100 && (
        <div
          className="absolute top-0 bottom-0 w-px"
          style={{
            left: `${todayLeft}%`,
            background: "var(--c-gold)",
            opacity: 0.7,
          }}
        />
      )}
    </div>
  );
}

function ProjectRow({
  project,
  axisStart,
  axisEnd,
  ticks,
  colorRegistry,
  expanded,
  onToggle,
  density,
}: {
  project: ClientPortfolioProject;
  axisStart: Date;
  axisEnd: Date;
  ticks: Date[];
  colorRegistry: Map<number, string>;
  expanded: boolean;
  onToggle: () => void;
  density: "comfortable" | "spacious";
}) {
  const totalMs = axisEnd.getTime() - axisStart.getTime();
  const span = totalMs > 0 ? totalMs : 1;
  const start = project.startDate ? new Date(project.startDate) : null;
  const end = project.endDate ? new Date(project.endDate) : null;
  const hasTimeline = !!(start && end && end > start);

  const projectLeft = start ? pct(start, axisStart, span) : 0;
  const projectWidth =
    start && end ? Math.max(pct(end, axisStart, span) - projectLeft, 0.5) : 0;

  // One lane per company so bars never overlap or occlude each other.
  const laneH = density === "spacious" ? 26 : 20;
  const laneGap = 6;
  const companies = project.companies;
  const trackHeight = Math.max(
    companies.length * (laneH + laneGap),
    laneH + laneGap,
  );

  return (
    <div className="border-t border-line">
      <div className="grid grid-cols-[260px_1fr] gap-4 py-3">
        <div className="flex items-start gap-1.5">
          <button
            type="button"
            onClick={onToggle}
            className="mt-0.5 text-ink-3 hover:text-ink rounded p-0.5"
            aria-label={expanded ? "Collapse project" : "Expand project"}
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          <Link
            href={`/client/portfolio/${project.id}`}
            className="block group flex-1 min-w-0"
          >
            <div className="flex items-center gap-2 text-[11px] text-ink-3 uppercase tracking-wide font-semibold">
              <span>{project.code}</span>
              {statusBadge(project.scheduleStatus)}
            </div>
            <div className="font-semibold text-[15px] text-ink group-hover:underline truncate">
              {project.name}
            </div>
            <div className="text-xs text-ink-3 mt-0.5">
              {hasTimeline
                ? `${format(start!, "MMM yyyy")} – ${format(end!, "MMM yyyy")} · ${project.companies.length} ${project.companies.length === 1 ? "company" : "companies"}`
                : `${project.milestoneCount} milestone${project.milestoneCount === 1 ? "" : "s"}`}
            </div>
          </Link>
        </div>

        <div
          className="relative"
          style={{ height: hasTimeline ? trackHeight : laneH + laneGap }}
        >
          <TimelineGrid ticks={ticks} axisStart={axisStart} span={span} />
          {hasTimeline ? (
            companies.length > 0 ? (
              companies.map((c, idx) => {
                const entry = new Date(c.entryDate);
                const exit = new Date(c.exitDate);
                const left = pct(entry, axisStart, span);
                const width = Math.max(pct(exit, axisStart, span) - left, 0.6);
                const color = colorForCompany(c.companyId, colorRegistry);
                return (
                  <Tooltip key={c.projectCompanyId}>
                    <TooltipTrigger asChild>
                      <div
                        className="absolute rounded-md flex items-center px-2 text-[11px] font-medium text-white truncate cursor-default"
                        style={{
                          top: idx * (laneH + laneGap) + laneGap / 2,
                          height: laneH,
                          left: `${left}%`,
                          width: `${width}%`,
                          background: color,
                          minWidth: "10px",
                        }}
                      >
                        <span className="truncate">{c.name}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.role}
                      </div>
                      <div className="text-xs mt-1">
                        {format(entry, "MMM d, yyyy")} →{" "}
                        {format(exit, "MMM d, yyyy")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {differenceInDays(exit, entry)} days on project
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })
            ) : (
              <div
                className="absolute rounded-md bg-surface-3"
                style={{
                  top: laneGap / 2,
                  height: laneH,
                  left: `${projectLeft}%`,
                  width: `${projectWidth}%`,
                  minWidth: "10px",
                }}
              />
            )
          ) : (
            <div className="absolute inset-0 flex items-center text-xs text-ink-4 italic">
              No timeline scheduled yet
            </div>
          )}
        </div>
      </div>

      {expanded && hasTimeline && companies.length > 0 && (
        <div className="pb-4 pl-7">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-ink-3 mb-2">
            Contractor involvement
          </div>
          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {companies.map((c) => {
              const entry = new Date(c.entryDate);
              const exit = new Date(c.exitDate);
              const color = colorForCompany(c.companyId, colorRegistry);
              const days = differenceInDays(exit, entry);
              return (
                <div
                  key={c.projectCompanyId}
                  className="flex items-center gap-2.5 min-w-0 rounded-md px-2 py-1.5 hover:bg-surface-2"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ background: color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-ink truncate">
                      {c.name}
                    </div>
                    <div className="text-[11px] text-ink-3">{c.role}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[12px] text-ink-2 tabular-nums">
                      {format(entry, "MMM d")} – {format(exit, "MMM d, yyyy")}
                    </div>
                    <div className="text-[11px] text-ink-4 tabular-nums">
                      {days} days
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

function TimeAxis({
  start,
  end,
  ticks,
}: {
  start: Date;
  end: Date;
  ticks: Date[];
}) {
  const span = end.getTime() - start.getTime() || 1;
  const todayLeft = pct(new Date(), start, span);

  return (
    <div className="grid grid-cols-[260px_1fr] gap-4 sticky top-0 bg-surface z-10 pt-1 pb-2 border-b border-line">
      <div className="text-[10px] uppercase tracking-wide font-semibold text-ink-3 self-end">
        Project
      </div>
      <div className="relative h-5">
        {ticks.map((t, i) => {
          const left = pct(t, start, span);
          return (
            <div
              key={i}
              className="absolute bottom-0 -translate-x-1/2 text-[10px] uppercase tracking-wide text-ink-4 font-semibold tabular-nums"
              style={{ left: `${Math.max(0, Math.min(left, 100))}%` }}
            >
              {format(t, "MMM ''yy")}
            </div>
          );
        })}
        {todayLeft >= 0 && todayLeft <= 100 && (
          <div
            className="absolute -top-1 -translate-x-1/2 text-[9px] font-semibold uppercase tracking-wide"
            style={{ left: `${todayLeft}%`, color: "var(--c-gold)" }}
          >
            Today
          </div>
        )}
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
    const pad = Math.max(
      (end.getTime() - start.getTime()) * 0.03,
      1000 * 60 * 60 * 24 * 7,
    );
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

  const ticks = useMemo(
    () => computeTicks(axisStart, axisEnd),
    [axisStart, axisEnd],
  );

  const containerClass = wide
    ? "p-6 w-full space-y-6"
    : "p-6 max-w-7xl mx-auto space-y-6";
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
    return (
      <div className="p-6 text-destructive">Failed to load portfolio.</div>
    );
  }

  const anyExpanded = expandedIds.size > 0;
  const allExpanded = data.length > 0 && expandedIds.size === data.length;

  return (
    <div className={containerClass}>
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink flex items-center gap-2">
            <LayoutDashboard className="w-7 h-7 text-[color:var(--c-gold)]" />
            Portfolio
          </h1>
          <p className="text-muted-foreground mt-1">
            Every project across your portfolio on one timeline — who's on each
            project, when they came in, and when they wrap.
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
          <TimeAxis start={axisStart} end={axisEnd} ticks={ticks} />
          <div>
            {data.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                axisStart={axisStart}
                axisEnd={axisEnd}
                ticks={ticks}
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
