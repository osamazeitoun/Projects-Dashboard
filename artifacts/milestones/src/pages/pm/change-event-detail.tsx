import { useRoute, Link } from "wouter";
import { useGetChangeEventDetail } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock } from "lucide-react";

function riskBadge(level: string | null | undefined) {
  if (!level) return null;
  const tone =
    level === "High"
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : level === "Medium"
        ? "bg-secondary/10 text-secondary-foreground border-secondary/30"
        : level === "Low"
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : "bg-muted text-muted-foreground";
  return <Badge variant="outline" className={tone}>{level} risk</Badge>;
}

export default function PmChangeEventDetail() {
  const [, params] = useRoute("/pm/change-event/:id");
  const id = Number(params?.id);
  const { data, isLoading, isError } = useGetChangeEventDetail(id);

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (isError || !data) return <div className="p-6 text-destructive">Failed to load change event.</div>;

  const shift = differenceInDays(new Date(data.proposedNewDate), new Date(data.oldDate));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <Link href="/pm/change-events" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to change events
        </Link>
      </div>

      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <Badge variant="outline">{data.stageName}</Badge>
          <Link href={`/pm/milestone/${data.milestoneId}`} className="font-mono text-muted-foreground hover:text-primary">{data.milestoneCode}</Link>
          <Badge variant="outline">{data.status}</Badge>
          <span className="text-muted-foreground">Opened {formatDistanceToNow(new Date(data.initiatedAt), { addSuffix: true })}</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{data.milestoneName}</h1>
        <p className="text-muted-foreground italic">"{data.changeReason}"</p>
      </header>

      <Card className="shadow-sm">
        <CardContent className="p-5 flex items-center gap-4 flex-wrap">
          <div className="text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Proposed shift</div>
            <div className="flex items-center gap-3">
              <span className="line-through text-muted-foreground">{format(new Date(data.oldDate), "MMM d, yyyy")}</span>
              <ArrowRight className="w-4 h-4" />
              <span className="font-bold">{format(new Date(data.proposedNewDate), "MMM d, yyyy")}</span>
              <Badge variant="outline" className={shift > 0 ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-primary/10 text-primary border-primary/20"}>
                {shift > 0 ? `+${shift}` : shift} days
              </Badge>
            </div>
          </div>
          {data.clientComment && (
            <div className="ml-auto text-sm text-muted-foreground italic max-w-md">
              <span className="font-medium not-italic text-foreground">Client:</span> "{data.clientComment}"
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Company Responses ({data.impacts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y border rounded-md">
            {data.impacts.map((i) => (
              <div key={i.id} className="p-4 flex flex-col md:flex-row gap-3 md:items-start">
                <div className="md:w-56 flex-shrink-0">
                  <div className="font-semibold">{i.companyName}</div>
                  <div className="text-xs text-muted-foreground">{i.companyRole}</div>
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  {i.responseStatus === "Pending" ? (
                    <div className="text-sm text-secondary-foreground flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Awaiting response · notified {formatDistanceToNow(new Date(i.notifiedAt), { addSuffix: true })}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        {riskBadge(i.impactRiskLevel ?? null)}
                        {i.impactRiskType && <Badge variant="outline">{i.impactRiskType}</Badge>}
                        <span className="text-muted-foreground">
                          {i.respondedAt && `responded ${formatDistanceToNow(new Date(i.respondedAt), { addSuffix: true })}`}
                        </span>
                      </div>
                      {i.mainRiskIssue && <div className="text-sm font-medium">{i.mainRiskIssue}</div>}
                      {i.detailedComment && <p className="text-sm text-muted-foreground">{i.detailedComment}</p>}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
