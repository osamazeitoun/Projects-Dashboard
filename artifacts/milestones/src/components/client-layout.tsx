import { Link, useLocation } from "wouter";
import { ReactNode } from "react";
import { useListClientReviews } from "@workspace/api-client-react";
import { Inbox, UserCheck } from "lucide-react";
import PerspectiveSwitcher from "@/components/perspective-switcher";

export default function ClientLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: reviews } = useListClientReviews();
  const pendingCount = reviews?.length ?? 0;

  const navItems = [
    {
      name: "Review Inbox",
      href: "/client",
      icon: Inbox,
      match: (l: string) => l === "/client" || l.startsWith("/client/change-event"),
      count: pendingCount,
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-72 border-r bg-card flex flex-col">
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center gap-2 text-primary">
            <UserCheck className="h-5 w-5" />
            <span className="font-bold tracking-tight">Client Review</span>
          </div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Approve or reject proposed date changes
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = item.match(location);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm font-medium ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
              >
                <div className="flex items-center gap-2">
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </div>
                {item.count !== undefined && item.count > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-secondary text-secondary-foreground">
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
