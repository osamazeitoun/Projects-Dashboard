import { Link, useLocation } from "wouter";
import { ReactNode } from "react";
import { useClerk, useUser } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
import {
  ShieldCheck,
  FolderKanban,
  LogOut,
  ArrowLeft,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { data: me } = useGetMe();

  const navItems = [
    {
      name: "Projects",
      href: "/admin",
      icon: FolderKanban,
      match: (l: string) => l === "/admin" || l.startsWith("/admin/projects"),
    },
    {
      name: "Procore",
      href: "/admin/procore",
      icon: Link2,
      match: (l: string) => l.startsWith("/admin/procore"),
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-64 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-3 text-ink">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-ink text-[color:var(--c-accent-fg)]">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="font-semibold tracking-tight">Admin Console</span>
          </div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Company administrator
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = item.match(location);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors text-sm ${
                  isActive
                    ? "bg-surface-2 text-ink font-medium"
                    : "text-ink-3 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <item.icon
                  className={`h-4 w-4 transition-colors ${isActive ? "text-[color:var(--c-gold)]" : "text-ink-4 group-hover:text-ink-3"}`}
                />
                {item.name}
              </Link>
            );
          })}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-md transition-colors text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground mt-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to app
          </Link>
        </nav>
        <div className="p-3 border-t space-y-3">
          <div className="px-2 text-xs text-muted-foreground truncate">
            {user?.primaryEmailAddress?.emailAddress ??
              me?.email ??
              "Signed in"}
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
