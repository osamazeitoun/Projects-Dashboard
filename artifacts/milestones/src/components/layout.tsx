import { Link, useLocation } from "wouter";
import { ReactNode } from "react";
import {
  useGetMyProjectSummary,
  getGetMyProjectSummaryQueryKey,
  getGetMyUpcomingMilestonesQueryKey,
  getGetMyPendingImpactsQueryKey,
  getGetMeQueryKey,
  useGetMe,
  useSetActiveWorkspace,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useClerk, useUser } from "@clerk/react";
import {
  HardHat,
  LayoutDashboard,
  Flag,
  AlertTriangle,
  LogOut,
  Check,
  ChevronsUpDown,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PerspectiveSwitcher from "@/components/perspective-switcher";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const { data: projectSummary } = useGetMyProjectSummary({
    query: { queryKey: getGetMyProjectSummaryQueryKey() },
  });
  const setActiveWorkspace = useSetActiveWorkspace({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getGetMyProjectSummaryQueryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: getGetMyUpcomingMilestonesQueryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: getGetMyPendingImpactsQueryKey(),
        });
      },
    },
  });

  const navItems = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      count: undefined as number | undefined,
      countColor: undefined as string | undefined,
    },
    {
      name: "Upcoming Milestones",
      href: "/milestones",
      icon: Flag,
      count: projectSummary?.upcomingMilestoneCount,
      countColor: undefined,
    },
    {
      name: "Pending Responses",
      href: "/responses",
      icon: AlertTriangle,
      count: projectSummary?.pendingImpactCount,
      countColor: "bg-[color-mix(in_srgb,var(--c-warn)_18%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-warn)_70%,var(--c-ink))]",
    },
  ];

  const workspaces = me?.workspaces ?? [];
  const activeWorkspace = workspaces.find(
    (w) =>
      w.companyId === me?.activeCompanyId &&
      w.projectId === me?.activeProjectId,
  );
  const showSwitcher = workspaces.length > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-64 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-3 text-ink">
            <HardHat className="h-5 w-5" />
            <span className="font-bold tracking-tight">MilestoneTracker</span>
          </div>
          {showSwitcher ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="w-full text-left rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between gap-2"
                  disabled={setActiveWorkspace.isPending}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground truncate">
                      {activeWorkspace
                        ? `${activeWorkspace.projectCode}: ${activeWorkspace.projectName}`
                        : "Select workspace"}
                    </div>
                    {activeWorkspace && (
                      <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {activeWorkspace.companyName}
                      </div>
                    )}
                  </div>
                  <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[260px] p-1"
                sideOffset={4}
              >
                <div className="max-h-80 overflow-auto">
                  {workspaces.map((w) => {
                    const isActive =
                      w.companyId === me?.activeCompanyId &&
                      w.projectId === me?.activeProjectId;
                    return (
                      <button
                        key={`${w.companyId}-${w.projectId}`}
                        type="button"
                        className={`w-full text-left rounded-sm px-2 py-2 text-sm flex items-start gap-2 hover:bg-accent transition-colors ${
                          isActive ? "bg-accent/50" : ""
                        }`}
                        onClick={() => {
                          if (isActive) return;
                          setActiveWorkspace.mutate({
                            data: {
                              companyId: w.companyId,
                              projectId: w.projectId,
                            },
                          });
                          document.dispatchEvent(
                            new KeyboardEvent("keydown", { key: "Escape" }),
                          );
                        }}
                      >
                        <Check
                          className={`h-4 w-4 mt-0.5 shrink-0 ${
                            isActive ? "opacity-100" : "opacity-0"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-foreground truncate">
                            {w.projectCode}: {w.projectName}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {w.companyName}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          ) : activeWorkspace ? (
            <div>
              <div className="text-sm font-medium text-foreground">
                {activeWorkspace.projectCode}: {activeWorkspace.projectName}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {activeWorkspace.companyName}
              </div>
            </div>
          ) : projectSummary ? (
            <div className="text-sm font-medium text-foreground">
              {projectSummary.projectCode}: {projectSummary.projectName}
            </div>
          ) : (
            <div className="h-5 w-32 bg-muted rounded animate-pulse" />
          )}
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2 rounded-sm transition-colors text-sm border-l-2 ${
                  isActive
                    ? "bg-surface-2 text-ink font-medium border-[color:var(--c-gold)]"
                    : "text-ink-3 border-transparent hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <div className="flex items-center gap-2">
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </div>
                {item.count !== undefined && item.count > 0 && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-sm font-medium font-mono ${
                      item.countColor || "bg-ink text-[color:var(--c-accent-fg)]"
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t space-y-3">
          <PerspectiveSwitcher />
          <div className="px-2 text-xs text-muted-foreground truncate">
            {user?.primaryEmailAddress?.emailAddress ?? me?.email ?? "Signed in"}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => signOut({ redirectUrl: basePath || "/" })}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
