import { useGetProjectCompanies } from "@workspace/api-client-react";
import { usePmProjectId } from "@/components/pm-layout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Mail, User } from "lucide-react";

function responsivenessBadge(r: string) {
  switch (r) {
    case "Responsive":
      return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Responsive</Badge>;
    case "Slow":
      return <Badge variant="outline" className="bg-secondary/10 text-secondary-foreground border-secondary/30">Slow</Badge>;
    case "NonResponding":
      return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Non-responding</Badge>;
    default:
      return <Badge variant="outline" className="bg-muted text-muted-foreground">No data</Badge>;
  }
}

export default function PmCompanies() {
  const [projectId] = usePmProjectId();
  const { data, isLoading, isError } = useGetProjectCompanies(projectId);

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }
  if (isError || !data) return <div className="p-6 text-destructive">Failed to load companies.</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Companies on this Project</h1>
        <p className="text-muted-foreground mt-1">{data.length} companies participating across the schedule.</p>
      </header>

      <Card className="overflow-hidden shadow-sm p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Company</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Primary Contact</TableHead>
              <TableHead className="text-right">Owns</TableHead>
              <TableHead className="text-right">Contributes</TableHead>
              <TableHead className="text-right">Pending / Total</TableHead>
              <TableHead>Avg Response</TableHead>
              <TableHead>Responsiveness</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center h-32 text-muted-foreground">No companies on this project.</TableCell></TableRow>
            ) : data.map((c) => (
              <TableRow key={c.projectCompanyId} className="hover:bg-muted/30 transition-colors">
                <TableCell>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.type}</div>
                </TableCell>
                <TableCell className="text-sm">{c.roleOnProject}</TableCell>
                <TableCell>
                  <div className="text-sm flex items-center gap-1.5"><User className="w-3 h-3 text-muted-foreground" />{c.primaryContactName}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5"><Mail className="w-3 h-3" />{c.primaryContactEmail}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.ownedMilestoneCount}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{c.contributorMilestoneCount}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  <span className={c.pendingImpacts > 0 ? "font-bold text-secondary-foreground" : "text-muted-foreground"}>{c.pendingImpacts}</span>
                  <span className="text-muted-foreground"> / {c.totalImpacts}</span>
                  {c.overdueImpacts > 0 && (
                    <div className="text-[10px] text-destructive font-medium">{c.overdueImpacts} overdue</div>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {c.avgResponseHours == null ? "—" : c.avgResponseHours < 24 ? `${Math.round(c.avgResponseHours)}h` : `${Math.round(c.avgResponseHours / 24)}d`}
                </TableCell>
                <TableCell>{responsivenessBadge(c.responsiveness)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
