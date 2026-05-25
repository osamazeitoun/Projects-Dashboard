import { useState, useMemo } from "react";
import { useGetProjectMilestones, useGetProjectCompanies } from "@workspace/api-client-react";
import { usePmProjectId } from "@/components/pm-layout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, differenceInDays } from "date-fns";
import { Link } from "wouter";
import { Flag, AlertCircle, CheckCircle2, Clock, PlayCircle, Search } from "lucide-react";

const STATUSES = ["Planned", "OnTrack", "AtRisk", "Delayed", "Completed"] as const;

function statusBadge(status: string) {
  switch (status) {
    case "Completed":
      return <Badge variant="success" withDot><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
    case "OnTrack":
      return <Badge variant="info" withDot><PlayCircle className="w-3 h-3 mr-1" />On Track</Badge>;
    case "AtRisk":
      return <Badge variant="warn" withDot><AlertCircle className="w-3 h-3 mr-1" />At Risk</Badge>;
    case "Delayed":
      return <Badge variant="danger" withDot><Clock className="w-3 h-3 mr-1" />Delayed</Badge>;
    default:
      return <Badge variant="neutral" withDot>Planned</Badge>;
  }
}

export default function PmSchedule() {
  const [projectId] = usePmProjectId();
  const { data: milestones, isLoading } = useGetProjectMilestones(projectId);
  const { data: companies } = useGetProjectCompanies(projectId);

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [riskOnly, setRiskOnly] = useState(false);

  const stageOptions = useMemo(() => {
    if (!milestones) return [];
    const seen = new Map<string, { code: string; name: string; order: number }>();
    for (const m of milestones) {
      if (!seen.has(m.stageCode)) seen.set(m.stageCode, { code: m.stageCode, name: m.stageName, order: m.stageOrder });
    }
    return [...seen.values()].sort((a, b) => a.order - b.order);
  }, [milestones]);

  const filtered = useMemo(() => {
    if (!milestones) return [];
    return milestones.filter((m) => {
      if (stageFilter !== "all" && m.stageCode !== stageFilter) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (riskOnly && m.status !== "AtRisk" && m.status !== "Delayed") return false;
      if (companyFilter !== "all") {
        const cid = Number(companyFilter);
        const hit = [...m.owningCompanies, ...m.contributorCompanies].some((c) => c.projectCompanyId === cid);
        if (!hit) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!m.name.toLowerCase().includes(q) && !m.code.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [milestones, search, stageFilter, companyFilter, statusFilter, riskOnly]);

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="font-serif text-4xl font-normal tracking-tight text-ink">Master Schedule</h1>
        <p className="text-muted-foreground mt-1">
          Every milestone in the project, across every company.
        </p>
      </header>

      <Card className="p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search milestone name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger><SelectValue placeholder="Stage" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {stageOptions.map((s) => (
                <SelectItem key={s.code} value={s.code}>S{s.order}: {s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger><SelectValue placeholder="Company" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {(companies ?? []).map((c) => (
                <SelectItem key={c.projectCompanyId} value={String(c.projectCompanyId)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs">
          <button
            onClick={() => setRiskOnly(!riskOnly)}
            className={`px-2 py-1 rounded border transition-colors ${riskOnly ? "bg-destructive/10 border-destructive/30 text-destructive" : "border-border text-muted-foreground hover:bg-muted"}`}
          >
            At-risk only
          </button>
          <span className="text-muted-foreground ml-auto">
            {filtered.length} of {milestones?.length ?? 0} milestones
          </span>
        </div>
      </Card>

      <Card className="overflow-hidden shadow-sm p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Stage</TableHead>
              <TableHead>Milestone</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Contributors</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Changes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-32 text-muted-foreground">No milestones match the filters.</TableCell>
              </TableRow>
            ) : filtered.map((m) => {
              const shift = m.previousDate ? differenceInDays(new Date(m.currentDate), new Date(m.previousDate)) : 0;
              return (
                <TableRow key={m.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="text-xs text-muted-foreground font-medium whitespace-nowrap">S{m.stageOrder}</TableCell>
                  <TableCell>
                    <Link href={`/pm/milestone/${m.id}`} className="block group">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{m.code}</span>
                        {m.isKeyOutput && (<Badge variant="default" className="text-[10px] h-4 px-1 py-0 uppercase">Key</Badge>)}
                        {m.criticalFlag && (<Badge variant="destructive" className="text-[10px] h-4 px-1 py-0 uppercase"><Flag className="w-3 h-3 mr-1" />Critical</Badge>)}
                        {m.isPaymentTrigger && (<Badge variant="outline" className="text-[10px] h-4 px-1 py-0 uppercase">$</Badge>)}
                      </div>
                      <div className="font-medium text-sm group-hover:text-ink transition-colors">{m.name}</div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">
                    {m.owningCompanies.length === 0 ? (
                      <span className="text-muted-foreground italic">{m.ownerRole}</span>
                    ) : (
                      <div className="space-y-0.5">
                        {m.owningCompanies.map((c) => (<div key={c.projectCompanyId} className="font-medium">{c.name}</div>))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.contributorCompanies.length === 0 ? "—" : m.contributorCompanies.map((c) => c.name).join(", ")}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums whitespace-nowrap">
                    {format(new Date(m.currentDate), "MMM d, yyyy")}
                    {m.previousDate && (
                      <div className="text-xs text-muted-foreground">
                        was <span className="line-through">{format(new Date(m.previousDate), "MMM d")}</span>
                        {shift !== 0 && (<span className={shift > 0 ? "text-destructive ml-1" : "text-[color:var(--c-info)] ml-1"}>({shift > 0 ? `+${shift}` : shift}d)</span>)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{statusBadge(m.status)}</TableCell>
                  <TableCell className="text-right text-xs">
                    {m.openChangeEventCount > 0 && (
                      <Badge variant="outline" className="bg-[color-mix(in_srgb,var(--c-warn)_14%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-warn)_70%,var(--c-ink))] border-[color-mix(in_srgb,var(--c-warn)_30%,var(--c-line))]">{m.openChangeEventCount} open</Badge>
                    )}
                    {m.pendingResponseCount > 0 && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">{m.pendingResponseCount} awaiting</div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
