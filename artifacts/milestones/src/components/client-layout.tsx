import { Link, useLocation } from "wouter";
import { ReactNode } from "react";
import {
  useListClientReviews,
  useListBaselineReviews,
} from "@workspace/api-client-react";
import { Inbox, UserCheck, LayoutDashboard } from "lucide-react";
import PerspectiveSwitcher from "@/components/perspective-switcher";

export default function ClientLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: reviews } = useListClientReviews();
  const { data: baselines } = useListBaselineReviews();
  const pendingCount = (reviews?.length ?? 0) + (baselines?.length ?? 0);

  const navItems = [
    {
      name: "Portfolio",
      href: "/client/portfolio",
      icon: LayoutDashboard,
      match: (l: string) =>
        l === "/client" ||
        l === "/client/portfolio" ||
        l.startsWith("/client/portfolio/"),
      count: undefined as number | undefined,
    },
    {
      name: "Review Inbox",
      href: "/client/inbox",
      icon: Inbox,
      match: (l: string) =>
        l === "/client/inbox" ||
        l.startsWith("/client/change-event") ||
        l.startsWith("/client/baseline-review"),
      count: pendingCount,
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-72 border-r bg-card flex flex-col">
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center gap-2 text-ink">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-ink text-[color:var(--c-accent-fg)]">
              <UserCheck className="h-4 w-4" />
            </span>
            <span className="font-semibold tracking-tight">Client Review</span>
          </div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Approve or reject proposed date changes
          </div>
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
                  <span className="text-[11px] min-w-5 text-center px-1.5 py-0.5 rounded-full font-medium tabular-nums bg-[color-mix(in_srgb,var(--c-warn)_18%,var(--c-surface))] text-[color-mix(in_srgb,var(--c-warn)_70%,var(--c-ink))]">
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
