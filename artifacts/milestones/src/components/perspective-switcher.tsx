import { usePerspective } from "@/lib/role";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { HardHat, Briefcase, ShieldCheck } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";

export default function PerspectiveSwitcher() {
  const [perspective, setPerspective] = usePerspective();
  const [, navigate] = useLocation();
  const { data: me } = useGetMe();

  const canPm = me?.isCompanyAdmin || (me?.pmProjectIds?.length ?? 0) > 0;
  const canContractor =
    me?.isCompanyAdmin || (me?.contractorProjectIds?.length ?? 0) > 0;
  const canAdmin = !!me?.isCompanyAdmin;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
        {canContractor && (
          <Button
            size="sm"
            variant={perspective === "company" ? "default" : "ghost"}
            className="h-7 px-2 text-xs"
            onClick={() => {
              setPerspective("company");
              navigate("/dashboard");
            }}
          >
            <HardHat className="w-3 h-3 mr-1" /> Contractor
          </Button>
        )}
        {canPm && (
          <Button
            size="sm"
            variant={perspective === "pm" ? "default" : "ghost"}
            className="h-7 px-2 text-xs"
            onClick={() => {
              setPerspective("pm");
              navigate("/pm");
            }}
          >
            <Briefcase className="w-3 h-3 mr-1" /> Project Manager
          </Button>
        )}
      </div>
      {canAdmin && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs w-full justify-start"
          onClick={() => navigate("/admin")}
        >
          <ShieldCheck className="w-3 h-3 mr-1" /> Admin Console
        </Button>
      )}
    </div>
  );
}
