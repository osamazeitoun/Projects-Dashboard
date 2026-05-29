import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  HardHat,
  Flag,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ShieldCheck,
} from "lucide-react";

const features = [
  {
    icon: Flag,
    title: "Upcoming milestones",
    body: "A live list of every milestone your company owns or contributes to, with the latest dates and status at a glance.",
  },
  {
    icon: AlertTriangle,
    title: "Impact responses",
    body: "When a schedule change affects your scope, log a clear risk assessment in seconds — no spreadsheets required.",
  },
  {
    icon: CalendarClock,
    title: "Schedule baselines",
    body: "Track submitted, approved, and revised baselines so everyone is working from the same source of truth.",
  },
];

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background flex flex-col">
      {/* Ambient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60rem 40rem at 50% -10%, color-mix(in oklab, var(--c-gold) 12%, transparent), transparent 70%)",
        }}
      />

      <header className="sticky top-0 z-20 border-b border-line bg-[color:color-mix(in_oklab,var(--c-bg)_80%,transparent)] backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 text-ink">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-ink text-[color:var(--c-accent-fg)]">
              <HardHat className="h-4 w-4" />
            </span>
            <span className="font-semibold tracking-tight">
              MilestoneTracker
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/sign-in">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm">Sign up</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-3 shadow-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-[color:var(--c-gold)]" />
            Built for construction teams
          </span>
          <h1 className="mt-6 t-display-1 text-ink text-balance">
            Stay on top of construction milestones
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-3 max-w-2xl mx-auto text-balance">
            Track the milestones your company owns or contributes to, see when
            schedule changes affect you, and respond with a clear risk
            assessment — all in one place.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/sign-up">
              <Button size="lg" className="gap-2">
                Get started <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button size="lg" variant="outline">
                Sign in
              </Button>
            </Link>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-6 pb-24">
          <div className="grid gap-5 md:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-xl border border-line bg-surface p-6 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-[color:var(--c-gold-soft)] text-[color:var(--c-gold)]">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 t-h2 text-ink">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-3">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between text-xs text-ink-4">
          <span>© {new Date().getFullYear()} MilestoneTracker</span>
          <span>Construction milestone & schedule tracking</span>
        </div>
      </footer>
    </div>
  );
}
