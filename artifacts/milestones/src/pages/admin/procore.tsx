import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminGetProcoreStatus,
  useAdminListProcoreProjects,
  useAdminImportProcoreProject,
  useAdminImportAllProcoreProjects,
  useAdminStartProcoreOAuth,
  useAdminDisconnectProcore,
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
  LogIn,
  LogOut,
  RefreshCw,
} from "lucide-react";

function formatTimestamp(ts: string | Date | null | undefined): string {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function sourceBadge(source: string | undefined) {
  switch (source) {
    case "oauth":
      return <Badge variant="outline">OAuth connection</Badge>;
    case "env":
      return <Badge variant="outline">Server env token</Badge>;
    case "demo":
      return <Badge variant="outline">Demo data</Badge>;
    default:
      return null;
  }
}

export default function AdminProcore() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [bulkRunning, setBulkRunning] = useState(false);
  const [lastBulk, setLastBulk] = useState<{
    ok: number;
    failed: number;
  } | null>(null);

  // Surface ?procoreConnected=1 / ?procoreError=... from the OAuth callback
  // redirect, then strip those params from the URL so they don't re-fire.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("procoreConnected");
    const err = params.get("procoreError");
    if (!connected && !err) return;
    if (connected) {
      toast({
        title: "Procore connected",
        description: "Your account is linked. You can now import projects.",
      });
    }
    if (err) {
      toast({
        title: "Procore connection failed",
        description: err,
        variant: "destructive",
      });
    }
    params.delete("procoreConnected");
    params.delete("procoreError");
    // wouter's setLocation works in the app's router base, so pass a path
    // relative to the router root. We're already on the procore page, so
    // staying on "/admin/procore" is correct regardless of the base URL.
    const qs = params.toString();
    setLocation(qs ? `/admin/procore?${qs}` : "/admin/procore", {
      replace: true,
    });
    qc.invalidateQueries({ queryKey: getAdminGetProcoreStatusQueryKey() });
    qc.invalidateQueries({ queryKey: getAdminListProcoreProjectsQueryKey() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const startOAuth = useAdminStartProcoreOAuth({
    mutation: {
      onSuccess: (r) => {
        if (typeof window === "undefined") return;
        // Procore's login page sets X-Frame-Options: DENY, so we have to
        // break out of any iframe (e.g. the Replit canvas preview).
        try {
          if (window.top && window.top !== window.self) {
            window.top.location.href = r.authorizeUrl;
            return;
          }
        } catch {
          // Cross-origin top frame — fall through to opening a new tab.
        }
        const popup = window.open(r.authorizeUrl, "_blank", "noopener");
        if (!popup) window.location.href = r.authorizeUrl;
      },
      onError: (e: unknown) => {
        toast({
          title: "Couldn't start Procore connect flow",
          description:
            (e as { data?: { error?: string } } | null)?.data?.error ??
            "Make sure PROCORE_CLIENT_ID, PROCORE_CLIENT_SECRET, PROCORE_OAUTH_REDIRECT_URI and PROCORE_TOKEN_ENCRYPTION_KEY are set.",
          variant: "destructive",
        });
      },
    },
  });

  const disconnect = useAdminDisconnectProcore({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Procore disconnected" });
      },
      onError: (e: unknown) => {
        toast({
          title: "Couldn't disconnect",
          description: (e as { data?: { error?: string } } | null)?.data?.error,
          variant: "destructive",
        });
      },
    },
  });

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

      <Card className="p-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          {s?.connected ? (
            <CheckCircle2 className="h-6 w-6 text-[color:var(--c-success,green)] mt-0.5" />
          ) : (
            <CloudOff className="h-6 w-6 text-[color:var(--c-danger,red)] mt-0.5" />
          )}
          <div className="space-y-1">
            <div className="font-semibold flex items-center gap-2 flex-wrap">
              {s?.connected ? "Connected" : "Not connected"}
              {sourceBadge(s?.source)}
            </div>
            <div className="text-xs text-muted-foreground">
              {s?.connected ? (
                <>
                  Procore company{" "}
                  <span className="font-mono">{s.companyId ?? "—"}</span> via{" "}
                  <span className="font-mono">{s.baseUrl}</span>
                  {s.resyncIntervalMinutes > 0
                    ? `. Background re-sync every ${s.resyncIntervalMinutes} min.`
                    : ". Background re-sync disabled."}
                </>
              ) : (
                <>{s?.error ?? "Procore credentials are not configured."}</>
              )}
            </div>
            {s?.source === "oauth" ? (
              <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
                <div>
                  Connected by{" "}
                  <span className="font-medium text-ink">
                    {s.connectedByEmail ?? "unknown user"}
                  </span>
                  {s.connectedProcoreUser ? (
                    <>
                      {" "}as Procore user{" "}
                      <span className="font-medium text-ink">
                        {s.connectedProcoreUser}
                      </span>
                    </>
                  ) : null}
                  {" "}on {formatTimestamp(s.connectedAt)}.
                </div>
                {s.lastRefreshedAt ? (
                  <div>
                    Last token refresh: {formatTimestamp(s.lastRefreshedAt)}.
                  </div>
                ) : null}
              </div>
            ) : null}
            {s?.source === "env" ? (
              <div className="text-xs text-muted-foreground pt-1">
                Using the legacy{" "}
                <span className="font-mono">PROCORE_ACCESS_TOKEN</span>{" "}
                environment variable. Connect via OAuth below to use a
                per-user refresh token instead.
              </div>
            ) : null}
            {s && !s.connected ? (
              s.oauthConfigured ? (
                <div className="text-xs text-muted-foreground pt-1">
                  Click <strong>Connect Procore</strong> to authorise an
                  account, or set{" "}
                  <span className="font-mono">PROCORE_ACCESS_TOKEN</span> and{" "}
                  <span className="font-mono">PROCORE_COMPANY_ID</span> on the
                  server for a shared credential.
                </div>
              ) : (
                <div className="text-xs text-muted-foreground pt-1">
                  OAuth is not configured. Set these env vars to enable the
                  Connect button:{" "}
                  <span className="font-mono">
                    {(s.oauthMissingEnv ?? []).join(", ") ||
                      "PROCORE_CLIENT_ID, PROCORE_CLIENT_SECRET, PROCORE_OAUTH_REDIRECT_URI, PROCORE_TOKEN_ENCRYPTION_KEY"}
                  </span>
                  .
                </div>
              )
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {s?.source === "oauth" ? (
            <Button
              variant="outline"
              onClick={() => {
                if (
                  window.confirm(
                    "Disconnect Procore? This deletes the stored refresh token. Existing imported data is kept.",
                  )
                ) {
                  disconnect.mutate();
                }
              }}
              disabled={disconnect.isPending}
            >
              <LogOut className="h-4 w-4 mr-1" />
              Disconnect
            </Button>
          ) : null}
          {s?.oauthConfigured && s?.source !== "demo" ? (
            <Button
              variant={s?.source === "oauth" ? "outline" : "default"}
              onClick={() => startOAuth.mutate()}
              disabled={startOAuth.isPending}
            >
              <LogIn className="h-4 w-4 mr-1" />
              {s?.source === "oauth" ? "Reconnect Procore" : "Connect Procore"}
            </Button>
          ) : null}
          {s?.connected ? (
            <>
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
            </>
          ) : null}
        </div>
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
