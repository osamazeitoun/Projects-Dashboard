import {
  useGetMyPendingImpacts,
  getGetMyPendingImpactsQueryKey,
  useRespondToImpact,
  getGetMyProjectSummaryQueryKey,
} from "@workspace/api-client-react";
import { format, differenceInDays } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ImpactRiskLevel, ImpactRiskType } from "@workspace/api-client-react";
import { AlertTriangle, Clock, ArrowRight, XCircle } from "lucide-react";

const responseSchema = z.object({
  impactRiskLevel: z.nativeEnum(ImpactRiskLevel),
  impactRiskType: z.nativeEnum(ImpactRiskType),
  mainRiskIssue: z.string().min(1, "Main risk issue is required"),
  detailedComment: z.string().optional(),
});

type ResponseFormValues = z.infer<typeof responseSchema>;

export default function Responses() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedImpact, setSelectedImpact] = useState<number | null>(null);

  const { data: impacts, isLoading, isError } = useGetMyPendingImpacts({
    query: { queryKey: getGetMyPendingImpactsQueryKey() },
  });

  const respondMutation = useRespondToImpact({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMyPendingImpactsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMyProjectSummaryQueryKey() });
        toast({
          title: "Response submitted",
          description: "Your impact risk assessment has been recorded.",
        });
        setSelectedImpact(null);
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Submission failed",
          description: "There was an error submitting your response.",
        });
      }
    }
  });

  const form = useForm<ResponseFormValues>({
    resolver: zodResolver(responseSchema),
    defaultValues: {
      impactRiskLevel: "Low",
      impactRiskType: "Time",
      mainRiskIssue: "",
      detailedComment: "",
    },
  });

  const onSubmit = (data: ResponseFormValues) => {
    if (selectedImpact === null) return;
    respondMutation.mutate({ impactId: selectedImpact, data });
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (isError || !impacts) {
    return <div className="p-6 text-destructive">Failed to load pending impacts.</div>;
  }

  const activeImpactData = impacts.find(i => i.id === selectedImpact);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink flex items-center gap-2">
            Pending Responses
            {impacts.length > 0 && (
              <Badge className="bg-[color-mix(in_srgb,var(--c-warn)_18%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-warn)_70%,var(--c-ink))] border-transparent">{impacts.length}</Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-1">Schedule changes requiring your assessment.</p>
        </div>
      </header>

      {impacts.length === 0 ? (
        <Card className="p-12 text-center border-dashed flex flex-col items-center justify-center text-muted-foreground bg-muted/10">
          <CheckCircle2Icon className="w-12 h-12 text-muted-foreground mb-4 opacity-20" />
          <h3 className="text-lg font-medium text-foreground">All caught up</h3>
          <p className="mt-1">There are no schedule impacts pending your response.</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {impacts.map((impact) => {
            const daysShift = differenceInDays(new Date(impact.newDate), new Date(impact.oldDate));
            const isDelay = daysShift > 0;
            const isWithdrawn = impact.changeEventStatus === "Cancelled";

            return (
              <Card
                key={impact.id}
                className={
                  "p-5 flex flex-col md:flex-row gap-6 items-start md:items-center border-border transition-colors shadow-sm " +
                  (isWithdrawn
                    ? "bg-muted/30 border-dashed opacity-90"
                    : "hover:border-primary/30")
                }
              >
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <Badge variant="outline" className="font-normal">{impact.stageName}</Badge>
                    {isWithdrawn && (
                      <Badge className="bg-muted text-foreground border border-border hover:bg-muted gap-1">
                        <XCircle className="w-3 h-3" />
                        Withdrawn
                      </Badge>
                    )}
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Notified {format(new Date(impact.notifiedAt), "MMM d")}</span>
                  </div>

                  <div>
                    <div className="font-mono text-xs text-muted-foreground mb-1">{impact.milestoneCode}</div>
                    <h3 className={"text-lg font-bold leading-tight " + (isWithdrawn ? "text-muted-foreground" : "")}>{impact.milestoneName}</h3>
                  </div>

                  <div className="bg-muted/50 p-3 rounded-md text-sm border flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
                    <div className="flex items-center gap-3">
                      <div className="line-through text-muted-foreground">{format(new Date(impact.oldDate), "MMM d, yyyy")}</div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      <div className={"font-bold " + (isWithdrawn ? "line-through text-muted-foreground" : "")}>{format(new Date(impact.newDate), "MMM d, yyyy")}</div>
                    </div>

                    {!isWithdrawn && (
                      <Badge variant="outline" className={isDelay ? "bg-[color-mix(in_srgb,var(--c-danger)_14%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-danger)_70%,var(--c-ink))] border-[color-mix(in_srgb,var(--c-danger)_30%,var(--c-line))]" : "bg-[color-mix(in_srgb,var(--c-info)_14%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-info)_70%,var(--c-ink))] border-[color-mix(in_srgb,var(--c-info)_30%,var(--c-line))]"}>
                        {isDelay ? `+${daysShift} Days Delay` : `${daysShift} Days Early`}
                      </Badge>
                    )}

                    <div className="text-muted-foreground md:ml-auto italic">
                      "{impact.changeReason}"
                    </div>
                  </div>

                  {isWithdrawn && (
                    <p className="text-sm text-muted-foreground">
                      The PM withdrew this change event. No response is needed — the milestone date stays as it was.
                    </p>
                  )}
                </div>

                <div className="w-full md:w-auto flex-shrink-0">
                  {isWithdrawn ? (
                    <Badge variant="outline" className="text-muted-foreground">No action required</Badge>
                  ) : (
                    <Button
                      size="lg"
                      className="w-full md:w-auto bg-ink hover:bg-ink-2 text-[color:var(--c-accent-fg)]"
                      onClick={() => {
                        setSelectedImpact(impact.id);
                        form.reset();
                      }}
                    >
                      Assess Risk
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={selectedImpact !== null} onOpenChange={(open) => !open && setSelectedImpact(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Submit Risk Assessment</DialogTitle>
            <DialogDescription>
              Provide your assessment of how this schedule change affects your work.
            </DialogDescription>
          </DialogHeader>
          
          {activeImpactData && (
             <div className="bg-muted/40 p-3 rounded border text-sm mb-4">
               <div className="font-medium">{activeImpactData.milestoneName}</div>
               <div className="text-muted-foreground mt-1 flex items-center gap-2">
                 {format(new Date(activeImpactData.oldDate), "MMM d")} <ArrowRight className="w-3 h-3" /> {format(new Date(activeImpactData.newDate), "MMM d")}
               </div>
             </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="impactRiskLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Risk Level</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select level" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="None">None</SelectItem>
                          <SelectItem value="Low">Low</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="impactRiskType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Risk Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Time">Time</SelectItem>
                          <SelectItem value="Cost">Cost</SelectItem>
                          <SelectItem value="Quality">Quality</SelectItem>
                          <SelectItem value="Scope">Scope</SelectItem>
                          <SelectItem value="Resources">Resources</SelectItem>
                          <SelectItem value="Authority">Authority</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="mainRiskIssue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Main Issue</FormLabel>
                    <FormControl>
                      <Input placeholder="Brief description of the impact..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="detailedComment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Additional Comments (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Provide any further details, mitigations, or prerequisites..." 
                        className="resize-none h-24"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setSelectedImpact(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={respondMutation.isPending}>
                  {respondMutation.isPending ? "Submitting..." : "Submit Response"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CheckCircle2Icon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
