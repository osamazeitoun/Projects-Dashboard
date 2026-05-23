import { Link, useLocation } from "wouter";
import { ReactNode } from "react";
import { APP_CONFIG } from "@/lib/constants";
import { useGetProjectSummary } from "@workspace/api-client-react";
import { getGetProjectSummaryQueryKey } from "@workspace/api-client-react";
import { HardHat, LayoutDashboard, Flag, AlertTriangle } from "lucide-react";

export default function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const summaryParams = { companyId: APP_CONFIG.companyId };
  const { data: projectSummary } = useGetProjectSummary(APP_CONFIG.projectId, summaryParams, {
    query: { queryKey: getGetProjectSummaryQueryKey(APP_CONFIG.projectId, summaryParams) }
  });

  const navItems = [
    {
      name: "Dashboard",
      href: "/",
      icon: LayoutDashboard,
      count: undefined,
    },
    {
      name: "Upcoming Milestones",
      href: "/milestones",
      icon: Flag,
      count: projectSummary?.upcomingMilestoneCount,
    },
    {
      name: "Pending Responses",
      href: "/responses",
      icon: AlertTriangle,
      count: projectSummary?.pendingImpactCount,
      countColor: "bg-secondary text-secondary-foreground"
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-64 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-1 text-primary">
            <HardHat className="h-5 w-5" />
            <span className="font-bold tracking-tight">MilestoneTracker</span>
          </div>
          {projectSummary ? (
            <div className="text-sm font-medium text-foreground mt-2">
              {projectSummary.projectCode}: {projectSummary.projectName}
            </div>
          ) : (
            <div className="h-5 w-32 bg-muted rounded animate-pulse mt-2" />
          )}
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className={`flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm font-medium ${isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
                <div className="flex items-center gap-2">
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </div>
                {item.count !== undefined && item.count > 0 && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${item.countColor || 'bg-primary text-primary-foreground'}`}>
                    {item.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
