import { ReactNode } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import { ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Perspective = "contractor" | "pm" | "client";

export default function NoAccessGate({
  perspective,
  children,
}: {
  perspective: Perspective;
  children: ReactNode;
}) {
  const { data: me, isLoading } = useGetMe();
  const { signOut } = useClerk();

  if (isLoading || !me) return <>{children}</>;

  const allowed =
    me.isCompanyAdmin ||
    (perspective === "pm"
      ? (me.pmProjectIds?.length ?? 0) > 0
      : perspective === "client"
        ? (me.clientProjectIds?.length ?? 0) > 0
        : (me.contractorProjectIds?.length ?? 0) > 0);

  if (allowed) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/40">
      <Card className="max-w-md w-full p-8 space-y-4 text-center">
        <div
          className="mx-auto h-16 w-16 rounded-full flex items-center justify-center"
          style={{ background: "var(--c-cream)", color: "var(--c-gold)" }}
        >
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">No projects assigned yet</h1>
        <p className="text-sm text-ink-3">
          Your account is set up, but you haven't been added to any projects.
          Please ask your company administrator to assign you to a project.
        </p>
        <Button
          variant="outline"
          className="mt-2"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </Card>
    </div>
  );
}
