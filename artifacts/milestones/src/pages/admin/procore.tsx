import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminGetProcoreStatus,
  useAdminListProcoreProjects,
  useAdminImportProcoreProject,
  useAdminImportAllProcoreProjects,
  getAdminListProcoreProjectsQueryKey,
  getAdminGetProcoreStatusQueryKey,
  getAdminListProjectsQueryKey,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Download,
  Link2,
  RefreshCw,
} from "lucide-react";

function formatTimestamp(ts: string | Date | null | undefined): string {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function AdminProcore() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [bulkRunning, setBulkRunning] = useState(false);
  const [lastBulk, setLastBulk] = useState<{
    ok: number;
    failed: number;
  } | null>(null);

  const status = useAdminGetProcoreStatus();
  const list = useAdminListProcoreProjects({
    query: {
      queryKey: getAdminListProcoreProjectsQueryKey(),
      enabled: status.data?.connected === true,
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getAdminListProcoreProjectsQueryKey() });
    qc.invalidateQueries({ queryKey: getAdminGetProcoreStatusQueryKey() });
    qc.invalidateQueries({ queryKey: getAdminListProjectsQueryKey() });
  };

  const importOne = useAdminImportProcoreProject({
    mutation: {
      onSuccess: (r) => {
        invalidate();
        if (r.status === "ok") {
          toast({
            title: r.createdProject ? "Project imported" : "Project re-synced",
            description: `${r.companiesUpserted} companies, ${r.usersUpserted} people.`,
          });
        } else {
          toast({
            title: "Import failed",
            description: r.error ?? "Unknown error",
            variant: "destructive",
          });
        }
      },
      onError: (e: unknown) => {
        toast({
          title: "Import failed",
          description: (e as { data?: { error?: string } } | null)?.data?.error,
          variant: "destructive",
        });
      },
    },
  });

  const importAll = useAdminImportAllProcoreProjects({
    mutation: {
      onSuccess: (r) => {
        invalidate();
        const ok = r.results.filter((x) => x.status === "ok").length;
        const failed = r.results.length - ok;
        setLastBulk({ ok, failed });
        toast({
          title: "Bulk import complete",
          description: `${ok} succeeded, ${failed} failed.`,
          variant: failed > 0 ? "destructive" : undefined,
        });
      },
      onError: (e: unknown) => {
        toast({
          title: "Bulk import failed",
          description: (e as { data?: { error?: string } } | null)?.data?.error,
          variant: "destructive",
        });
      },
      onSettled: () => setBulkRunning(false),
    },
  });

  if (status.isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const s = status.data;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-start gap-3">
        <div className="bg-surface-2 text-ink p-2 rounded-md">
          <Link2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-serif text-4xl font-normal tracking-tight text-ink">
            Procore
          </h1>
          <p className="text-muted-foreground mt-1">
            Pull projects, contractor companies, and people from your Procore
            account into this admin console. Re-running an import refreshes a
            linked project without touching anything you added manually.
          </p>
        </div>
      </header>

      <Card className="p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {s?.connected ? (
            <CheckCircle2 className="h-6 w-6 text-[color:var(--c-success,green)] mt-0.5" />
          ) : (
            <CloudOff className="h-6 w-6 text-[color:var(--c-danger,red)] mt-0.5" />
          )}
          <div>
            <div className="font-semibold flex items-center gap-2">
              {s?.connected ? "Connected" : "Not connected"}
              {s?.demoMode ? (
                <Badge variant="outline">Demo data</Badge>
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {s?.connected ? (
                <>
                  Company <span className="font-mono">{s.companyId}</span> via{" "}
                  <span className="font-mono">{s.baseUrl}</span>
                  {s.resyncIntervalMinutes > 0
                    ? `. Background re-sync every ${s.resyncIntervalMinutes} min.`
                    : ". Background re-sync disabled."}
                </>
              ) : (
                <>
                  {s?.error ?? "Procore credentials are not configured."}{" "}
                  Set <span className="font-mono">PROCORE_ACCESS_TOKEN</span>{" "}
                  and <span className="font-mono">PROCORE_COMPANY_ID</span> on
                  the server (or{" "}
                  <span className="font-mono">PROCORE_DEMO_MODE=1</span> to
                  preview).
                </>
              )}
            </div>
          </div>
        </div>
        {s?.connected ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => list.refetch()}
              disabled={list.isFetching}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${list.isFetching ? "animate-spin" : ""}`}
              />
              Refresh list
            </Button>
            <Button
              onClick={() => {
                setBulkRunning(true);
                setLastBulk(null);
                importAll.mutate();
              }}
              disabled={bulkRunning || importAll.isPending}
            >
              <Download className="h-4 w-4 mr-1" />
              Import all
            </Button>
          </div>
        ) : null}
      </Card>

      {lastBulk ? (
        <div
          className="rounded-md border p-3 text-sm flex items-center gap-2"
          style={{
            background:
              lastBulk.failed > 0
                ? "color-mix(in oklab, var(--c-danger) 10%, var(--c-surface))"
                : "color-mix(in oklab, var(--c-success, green) 10%, var(--c-surface))",
          }}
        >
          {lastBulk.failed > 0 ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Bulk import: <strong>{lastBulk.ok}</strong> succeeded,{" "}
          <strong>{lastBulk.failed}</strong> failed.
        </div>
      ) : null}

      {s?.connected ? (
        <Card className="overflow-hidden shadow-sm p-0">
          {list.isLoading ? (
            <div className="p-6">
              <Skeleton className="h-48 w-full" />
            </div>
          ) : list.isError ? (
            <div className="p-6 text-sm text-muted-foreground">
              Failed to load Procore projects:{" "}
              {(list.error as { data?: { error?: string } } | null)?.data?.error ??
                "Unknown error"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Procore project</TableHead>
                  <TableHead>Procore ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last synced</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      No Procore projects visible to this account.
                    </TableCell>
                  </TableRow>
                ) : (
                  (list.data ?? []).map((p) => {
                    const linked = p.linkedProjectId != null;
                    const importing =
                      importOne.isPending &&
                      importOne.variables?.procoreProjectId ===
                        p.procoreProjectId;
                    return (
                      <TableRow key={p.procoreProjectId}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {p.procoreProjectName}
                            </span>
                            {p.procoreProjectCode ? (
                              <span className="text-[10px] uppercase font-mono tracking-wide text-muted-foreground">
                                {p.procoreProjectCode}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {p.procoreProjectId}
                        </TableCell>
                        <TableCell>
                          {linked ? (
                            <Badge variant="outline" className="gap-1">
                              <Link2 className="h-3 w-3" />
                              Linked
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Not imported
                            </Badge>
                          )}
                          {p.lastSyncError ? (
                            <div className="text-xs text-[color:var(--c-danger,red)] mt-1 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {p.lastSyncError.slice(0, 80)}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatTimestamp(p.lastSyncedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {linked && p.linkedProjectId != null ? (
                              <Link href={`/admin/projects/${p.linkedProjectId}`}>
                                <Button variant="ghost" size="sm">
                                  Open
                                </Button>
                              </Link>
                            ) : null}
                            <Button
                              size="sm"
                              variant={linked ? "outline" : "default"}
                              disabled={importing}
                              onClick={() =>
                                importOne.mutate({
                                  procoreProjectId: p.procoreProjectId,
                                })
                              }
                            >
                              {importing ? (
                                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                              ) : linked ? (
                                <RefreshCw className="h-4 w-4 mr-1" />
                              ) : (
                                <Download className="h-4 w-4 mr-1" />
                              )}
                              {linked ? "Re-sync" : "Import"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </Card>
      ) : null}
    </div>
  );
}
