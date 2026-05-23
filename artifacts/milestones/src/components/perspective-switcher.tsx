import { usePerspective } from "@/lib/role";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { HardHat, Briefcase } from "lucide-react";

export default function PerspectiveSwitcher() {
  const [perspective, setPerspective] = usePerspective();
  const [, navigate] = useLocation();

  return (
    <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
      <Button
        size="sm"
        variant={perspective === "company" ? "default" : "ghost"}
        className="h-7 px-2 text-xs"
        onClick={() => {
          setPerspective("company");
          navigate("/");
        }}
      >
        <HardHat className="w-3 h-3 mr-1" /> Contractor
      </Button>
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
    </div>
  );
}
