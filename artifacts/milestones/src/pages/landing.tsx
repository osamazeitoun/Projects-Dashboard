import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { HardHat, Flag, AlertTriangle, ArrowRight } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <HardHat className="h-5 w-5" />
            <span className="font-bold tracking-tight">MilestoneTracker</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/sign-in">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link href="/sign-up">
              <Button>Sign up</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Stay on top of construction milestones
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Track the milestones your company owns or contributes to, see when
            schedule changes affect you, and respond with a clear risk assessment.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Link href="/sign-up">
              <Button size="lg" className="gap-2">
                Get started <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button size="lg" variant="outline">Sign in</Button>
            </Link>
          </div>

          <div className="grid gap-6 md:grid-cols-2 pt-12 max-w-3xl mx-auto text-left">
            <div className="border rounded-lg p-5 bg-card">
              <Flag className="h-5 w-5 text-primary mb-2" />
              <h3 className="font-semibold mb-1">Upcoming milestones</h3>
              <p className="text-sm text-muted-foreground">
                A live list of every milestone your company is responsible for,
                with the latest dates and status.
              </p>
            </div>
            <div className="border rounded-lg p-5 bg-card">
              <AlertTriangle className="h-5 w-5 text-secondary mb-2" />
              <h3 className="font-semibold mb-1">Pending impact responses</h3>
              <p className="text-sm text-muted-foreground">
                When a schedule change affects your work, log your risk
                assessment in seconds.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
