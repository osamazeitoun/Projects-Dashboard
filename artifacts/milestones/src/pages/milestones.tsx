import {
  useGetMyUpcomingMilestones,
  getGetMyUpcomingMilestonesQueryKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Flag, AlertCircle, CheckCircle2, Clock, PlayCircle } from "lucide-react";

export default function Milestones() {
  const { data: milestones, isLoading, isError } = useGetMyUpcomingMilestones({
    query: { queryKey: getGetMyUpcomingMilestonesQueryKey() },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Completed': return <Badge variant="success" withDot><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'OnTrack': return <Badge variant="info" withDot><PlayCircle className="w-3 h-3 mr-1" />On Track</Badge>;
      case 'AtRisk': return <Badge variant="warn" withDot><AlertCircle className="w-3 h-3 mr-1" />At Risk</Badge>;
      case 'Delayed': return <Badge variant="danger" withDot><Clock className="w-3 h-3 mr-1" />Delayed</Badge>;
      default: return <Badge variant="neutral" withDot>Planned</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (isError || !milestones) {
    return <div className="p-6 text-destructive">Failed to load milestones.</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="font-serif text-4xl font-normal tracking-tight text-ink">Upcoming Milestones</h1>
        <p className="text-muted-foreground mt-1">All upcoming milestones your company owns or contributes to.</p>
      </header>

      <div className="border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Stage</TableHead>
              <TableHead>Code & Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {milestones.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-32 text-muted-foreground">No upcoming milestones found.</TableCell>
              </TableRow>
            ) : (
              milestones.map((milestone) => (
                <TableRow key={milestone.id} className="hover:bg-muted/30 transition-colors group">
                  <TableCell className="text-xs text-muted-foreground font-medium">{milestone.stageName}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{milestone.code}</span>
                        {milestone.isKeyOutput && (
                          <Badge variant="default" className="text-[10px] h-4 px-1 py-0 uppercase bg-ink text-[color:var(--c-accent-fg)] border-transparent">Key Output</Badge>
                        )}
                        {milestone.criticalFlag && (
                          <Badge variant="destructive" className="text-[10px] h-4 px-1 py-0 uppercase border-none"><Flag className="w-3 h-3 mr-1" />Critical</Badge>
                        )}
                      </div>
                      <span className="font-medium">{milestone.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{milestone.ownerRole}</TableCell>
                  <TableCell className="text-sm tabular-nums whitespace-nowrap">
                    {format(new Date(milestone.currentDate), "MMM d, yyyy")}
                    {milestone.previousDate && (
                      <div className="text-xs text-muted-foreground line-through mt-0.5">
                        {format(new Date(milestone.previousDate), "MMM d, yyyy")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(milestone.status)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
