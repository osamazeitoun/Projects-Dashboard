import { Link, useLocation } from "wouter";
import { ReactNode } from "react";
import { PM_CONFIG } from "@/lib/role";
import {
  useGetPmProjectSummary,
  useListProjects,
} from "@workspace/api-client-react";
import {
  Briefcase,
  LayoutDashboard,
  CalendarRange,
  Building2,
  GitPullRequestArrow,
  ChevronDown,
} from "lucide-react";
import PerspectiveSwitcher from "@/components/perspective-switcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect } from "react";

const PROJECT_KEY = "milestones.pmProjectId";

export function usePmProjectId(): [number, (id: number) => void] {
  const [id, setIdState] = useState<number>(() => {
    if (typeof window === "undefined") return PM_CONFIG.defaultProjectId;
    const v = window.localStorage.getItem(PROJECT_KEY);
    return v ? Number(v) : PM_CONFIG.defaultProjectId;
  });
  useEffect(() => {
    window.localStorage.setItem(PROJECT_KEY, String(id));
  }, [id]);
  return [id, setIdState];
}

export default function PmLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [projectId, setProjectId] = usePmProjectId();

  const { data: summary } = useGetPmProjectSummary(projectId);
  const { data: projects } = useListProjects();

  const navItems = [
    {
      name: "Dashboard",
      href: "/pm",
      icon: LayoutDashboard,
      match: (l: string) => l === "/pm",
    },
    {
      name: "Master Schedule",
      href: "/pm/schedule",
      icon: CalendarRange,
      match: (l: string) =>
        l.startsWith("/pm/schedule") || l.startsWith("/pm/milestone"),
    },
    {
      name: "Companies",
      href: "/pm/companies",
      icon: Building2,
      match: (l: string) => l.startsWith("/pm/companies"),
    },
    {
      name: "Change Events",
      href: "/pm/change-events",
      icon: GitPullRequestArrow,
      match: (l: string) =>
        l.startsWith("/pm/change-events") || l.startsWith("/pm/change-event"),
      count: summary?.openChangeEventCount,
      countColor:
        "bg-[color-mix(in_srgb,var(--c-warn)_18%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-warn)_70%,var(--c-ink))]",
    },
  ];

  const otherProjects = (projects ?? []).filter((p) => p.id !== projectId);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-72 border-r bg-card flex flex-col">
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center gap-2 text-ink">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-ink text-[color:var(--c-accent-fg)]">
              <Briefcase className="h-4 w-4" />
            </span>
            <span className="font-semibold tracking-tight">Command Center</span>
          </div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Project Manager · {summary?.gcCompanyName ?? ""}
          </div>
          {summary ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full text-left bg-muted/60 hover:bg-muted rounded-md px-3 py-2 flex items-start justify-between gap-2 transition-colors">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                      {summary.projectCode}
                    </div>
                    <div className="text-sm font-bold leading-tight truncate">
                      {summary.projectName}
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64">
                {(projects ?? []).map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => setProjectId(p.id)}
                    className="flex flex-col items-start gap-0.5"
                  >
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {p.code}
                    </span>
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.milestoneCount} milestones · {p.companyCount} companies
                    </span>
                  </DropdownMenuItem>
                ))}
                {otherProjects.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No other projects
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="h-12 bg-muted rounded animate-pulse" />
          )}
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => {
            const active = item.match(location);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center justify-between px-2.5 py-2 rounded-md transition-colors text-sm ${active ? "bg-surface-2 text-ink font-medium" : "text-ink-3 hover:bg-surface-2 hover:text-ink"}`}
              >
                <div className="flex items-center gap-2.5">
                  <item.icon
                    className={`h-4 w-4 transition-colors ${active ? "text-[color:var(--c-gold)]" : "text-ink-4 group-hover:text-ink-3"}`}
                  />
                  {item.name}
                </div>
                {item.count !== undefined && item.count > 0 && (
                  <span
                    className={`text-[11px] min-w-5 text-center px-1.5 py-0.5 rounded-full font-medium tabular-nums ${item.countColor ?? "bg-surface-3 text-ink-2"}`}
                  >
                    {item.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t">
          <PerspectiveSwitcher />
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
