import { useRoute, Link } from "wouter";
import { useGetMilestoneDetail } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  Flag,
  CheckCircle2,
  Clock,
  AlertCircle,
  GitPullRequestArrow,
  CalendarDays,
  Users,
  Plus,
} from "lucide-react";

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

export default function PmMilestoneDetail() {
  const [, params] = useRoute("/pm/milestone/:id");
  const id = Number(params?.id);
  const { toast } = useToast();
  const { data, isLoading, isError } = useGetMilestoneDetail(id);

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-8 w-96" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (isError || !data) {
    return <div className="p-6 text-destructive">Failed to load milestone.</div>;
  }

  const shift = data.previousDate ? differenceInDays(new Date(data.currentDate), new Date(data.previousDate)) : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/pm/schedule" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to master schedule
        </Link>
      </div>

      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline">S{data.stageOrder}: {data.stageName}</Badge>
            <span className="font-mono text-muted-foreground">{data.code}</span>
            {data.isKeyOutput && <Badge>Key Output</Badge>}
            {data.criticalFlag && (<Badge variant="destructive"><Flag className="w-3 h-3 mr-1" />Critical</Badge>)}
            {data.isPaymentTrigger && <Badge variant="outline">Payment Trigger</Badge>}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{data.name}</h1>
          {data.description && (<p className="text-muted-foreground">{data.description}</p>)}
        </div>
        <Button
          onClick={() => toast({ title: "Create change event", description: "This entry point launches the change-event flow built in Task #4." })}
          className="flex-shrink-0"
        >
          <Plus className="w-4 h-4 mr-1" /> Propose Date Change
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" /> Current Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{format(new Date(data.currentDate), "MMM d, yyyy")}</div>
            {data.previousDate && (
              <div className="text-xs text-muted-foreground mt-1">
                Was <span className="line-through">{format(new Date(data.previousDate), "MMM d")}</span>{" "}
                <span className={shift > 0 ? "text-destructive" : "text-primary"}>({shift > 0 ? "+" : ""}{shift}d)</span>
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-0.5">Baseline {format(new Date(data.baselineDate), "MMM d, yyyy")}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold flex items-center gap-2">
              {data.status === "Completed" && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              {data.status === "AtRisk" && <AlertCircle className="w-5 h-5 text-secondary-foreground" />}
              {data.status === "Delayed" && <Clock className="w-5 h-5 text-destructive" />}
              {data.status}
            </div>
            {data.changeReasonLatest && (
              <p className="text-xs text-muted-foreground italic mt-2">"{data.changeReasonLatest}"</p>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Outstanding Responses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{data.outstandingCompanies.length}</div>
            {data.outstandingCompanies.length > 0 ? (
              <div className="text-xs text-muted-foreground mt-1 truncate">
                {data.outstandingCompanies.map((c) => c.name).join(", ")}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground mt-1">All companies have responded.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Companies on this milestone</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Owner ({data.ownerRole})</div>
              {data.owningCompanies.length === 0 ? (
                <div className="text-sm text-muted-foreground italic">No company assigned</div>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {data.owningCompanies.map((c) => (<li key={c.projectCompanyId} className="font-medium">{c.name}</li>))}
                </ul>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Contributors</div>
              {data.contributorCompanies.length === 0 ? (
                <div className="text-sm text-muted-foreground italic">None</div>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {data.contributorCompanies.map((c) => (
                    <li key={c.projectCompanyId} className="flex justify-between">
                      <span>{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.role}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <GitPullRequestArrow className="w-5 h-5 text-primary" /> Change History
        </h2>
        {data.changeEvents.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground border-dashed">No date changes have been proposed on this milestone yet.</Card>
        ) : (
          data.changeEvents.map((ev) => {
            const evShift = differenceInDays(new Date(ev.proposedNewDate), new Date(ev.oldDate));
            return (
              <Card key={ev.id} className="shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Opened {formatDistanceToNow(new Date(ev.initiatedAt), { addSuffix: true })}</span>
                        <Badge variant="outline">{ev.status}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="line-through text-muted-foreground">{format(new Date(ev.oldDate), "MMM d, yyyy")}</span>
                        <ArrowRight className="w-4 h-4" />
                        <span className="font-bold">{format(new Date(ev.proposedNewDate), "MMM d, yyyy")}</span>
                        <Badge variant="outline" className={evShift > 0 ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-primary/10 text-primary border-primary/20"}>
                          {evShift > 0 ? `+${evShift}` : evShift} days
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground italic">"{ev.changeReason}"</p>
                    </div>
                    <Link href={`/pm/change-event/${ev.id}`} className="text-xs text-primary hover:underline whitespace-nowrap">Open full event →</Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-2">Company Responses</div>
                  <div className="border rounded-md divide-y">
                    {ev.impacts.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">No companies have been notified.</div>
                    ) : ev.impacts.map((i) => (
                      <div key={i.id} className="p-3 flex items-start gap-3 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{i.companyName}</span>
                            <span className="text-xs text-muted-foreground">{i.companyRole}</span>
                          </div>
                          {i.responseStatus === "Pending" ? (
                            <div className="text-xs text-secondary-foreground mt-0.5">
                              Awaiting response · notified {formatDistanceToNow(new Date(i.notifiedAt), { addSuffix: true })}
                            </div>
                          ) : (
                            <div className="space-y-1 mt-1">
                              <div className="flex items-center gap-2 text-xs">
                                {riskBadge(i.impactRiskLevel ?? null)}
                                {i.impactRiskType && <Badge variant="outline">{i.impactRiskType}</Badge>}
                                <span className="text-muted-foreground">
                                  responded {i.respondedAt ? formatDistanceToNow(new Date(i.respondedAt), { addSuffix: true }) : ""}
                                </span>
                              </div>
                              {i.mainRiskIssue && <div className="text-sm">{i.mainRiskIssue}</div>}
                              {i.detailedComment && <p className="text-xs text-muted-foreground">{i.detailedComment}</p>}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
