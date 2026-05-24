import { Link, useParams } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminGetProjectDetail,
  useAdminUpsertProjectAssignment,
  useAdminRemoveProjectAssignment,
  useAdminAddContractorCompany,
  useAdminRemoveContractorCompany,
  getAdminGetProjectDetailQueryKey,
  getAdminListProjectsQueryKey,
  type AdminProjectAssignmentRole,
  type AdminAddContractorInputRoleOnProject,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ROLE_LABEL: Record<AdminProjectAssignmentRole, string> = {
  admin: "Admin",
  pm: "Project Manager",
  contractor_lead: "Contractor Lead",
  contractor_member: "Contractor Member",
  viewer: "Viewer",
};

const ROLE_BADGE: Record<AdminProjectAssignmentRole, string> = {
  admin: "bg-primary/10 text-primary border-primary/30",
  pm: "bg-secondary/10 text-secondary-foreground border-secondary/30",
  contractor_lead: "bg-amber-50 text-amber-700 border-amber-200",
  contractor_member: "bg-amber-50/60 text-amber-700 border-amber-200",
  viewer: "bg-muted text-muted-foreground",
};

export default function AdminProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useAdminGetProjectDetail(projectId);

  const invalidate = () => {
    qc.invalidateQueries({
      queryKey: getAdminGetProjectDetailQueryKey(projectId),
    });
    qc.invalidateQueries({ queryKey: getAdminListProjectsQueryKey() });
  };

  const upsert = useAdminUpsertProjectAssignment({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Assignment saved" });
      },
      onError: (e: unknown) => {
        toast({
          title: "Failed to save assignment",
          description: (e as { data?: { error?: string } } | null)?.data?.error,
          variant: "destructive",
        });
      },
    },
  });
  const removeAssignment = useAdminRemoveProjectAssignment({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Assignment removed" });
      },
    },
  });
  const addContractor = useAdminAddContractorCompany({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Contractor company added" });
      },
      onError: (e: unknown) => {
        toast({
          title: "Failed to add contractor",
          description: (e as { data?: { error?: string } } | null)?.data?.error,
          variant: "destructive",
        });
      },
    },
  });
  const removeContractor = useAdminRemoveContractorCompany({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Contractor company removed" });
      },
    },
  });

  // PM-add form state
  const [pmUserId, setPmUserId] = useState<string>("");

  // Permission-row form state
  const [permUserId, setPermUserId] = useState<string>("");
  const [permRole, setPermRole] = useState<AdminProjectAssignmentRole>("viewer");
  const [permCompanyId, setPermCompanyId] = useState<string>("");

  // Add-contractor form state
  const [contractorCompanyId, setContractorCompanyId] = useState<string>("");
  const [contractorRole, setContractorRole] = useState("MainContractor");

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[200px]" />
      </div>
    );
  }
  if (isError || !data) {
    const status = (error as { status?: number } | null)?.status;
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card className="p-8 text-center space-y-2">
          <h2 className="text-lg font-semibold">
            {status === 403
              ? "Not in your scope"
              : status === 404
                ? "Project not found"
                : "Failed to load project"}
          </h2>
          <p className="text-muted-foreground text-sm">
            {status === 403
              ? "This project is not managed by your company."
              : "Please return to the project list."}
          </p>
          <Link href="/admin">
            <Button variant="outline" size="sm" className="mt-2">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to projects
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  const pms = data.assignments.filter((a) => a.role === "pm");
  const others = data.assignments.filter((a) => a.role !== "pm");

  const userOptionLabel = (u: { email: string | null; companyName: string }) =>
    `${u.email ?? "(no email)"} — ${u.companyName}`;

  // For PM add: any user in scope can be made a PM.
  const pmCandidates = data.availableUsers.filter(
    (u) => !pms.some((p) => p.userId === u.userId),
  );

  const onAddPm = () => {
    if (!pmUserId) return;
    upsert.mutate({
      projectId,
      data: { userId: Number(pmUserId), role: "pm" },
    });
    setPmUserId("");
  };

  const onAddPermission = () => {
    if (!permUserId) return;
    if (
      (permRole === "contractor_lead" || permRole === "contractor_member") &&
      !permCompanyId
    ) {
      toast({
        title: "Company required",
        description: "Contractor roles need a contractor company.",
        variant: "destructive",
      });
      return;
    }
    upsert.mutate({
      projectId,
      data: {
        userId: Number(permUserId),
        role: permRole,
        companyId: permCompanyId ? Number(permCompanyId) : null,
      },
    });
    setPermUserId("");
    setPermCompanyId("");
    setPermRole("viewer");
  };

  const onAddContractor = () => {
    if (!contractorCompanyId || !contractorRole) return;
    addContractor.mutate({
      projectId,
      data: {
        companyId: Number(contractorCompanyId),
        roleOnProject: contractorRole as AdminAddContractorInputRoleOnProject,
      },
    });
    setContractorCompanyId("");
  };

  const onContractorsCompanyIds = new Set(
    data.contractorCompanies.map((c) => c.companyId),
  );
  const addableContractors = data.availableCompanies.filter(
    (c) => !onContractorsCompanyIds.has(c.companyId),
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> All projects
        </Link>
      </div>
      <header>
        <div className="text-[11px] uppercase tracking-wide font-mono text-muted-foreground">
          {data.projectCode}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{data.projectName}</h1>
      </header>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Project Managers</h2>
          <Badge variant="outline" className="ml-1">
            {pms.length}
          </Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Company</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pms.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground h-16 text-center">
                  No PMs assigned yet.
                </TableCell>
              </TableRow>
            ) : (
              pms.map((a) => (
                <TableRow key={a.assignmentId}>
                  <TableCell>{a.email ?? `User #${a.userId}`}</TableCell>
                  <TableCell>{a.companyName ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        removeAssignment.mutate({
                          projectId,
                          assignmentId: a.assignmentId,
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end pt-2 border-t">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Add a project manager</Label>
            <Select value={pmUserId} onValueChange={setPmUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a user…" />
              </SelectTrigger>
              <SelectContent>
                {pmCandidates.map((u) => (
                  <SelectItem key={u.userId} value={String(u.userId)}>
                    {userOptionLabel(u)}
                  </SelectItem>
                ))}
                {pmCandidates.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Everyone in scope is already a PM here.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={onAddPm} disabled={!pmUserId || upsert.isPending}>
            <UserPlus className="h-4 w-4 mr-1" /> Add PM
          </Button>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Contractor Companies</h2>
          <Badge variant="outline" className="ml-1">
            {data.contractorCompanies.length}
          </Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Role on project</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.contractorCompanies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground h-16 text-center">
                  No companies on this project.
                </TableCell>
              </TableRow>
            ) : (
              data.contractorCompanies.map((c) => (
                <TableRow key={c.projectCompanyId}>
                  <TableCell className="font-medium">{c.companyName}</TableCell>
                  <TableCell>{c.roleOnProject}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        removeContractor.mutate({
                          projectId,
                          projectCompanyId: c.projectCompanyId,
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end pt-2 border-t">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Company</Label>
            <Select
              value={contractorCompanyId}
              onValueChange={setContractorCompanyId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a company…" />
              </SelectTrigger>
              <SelectContent>
                {addableContractors.map((c) => (
                  <SelectItem key={c.companyId} value={String(c.companyId)}>
                    {c.companyName} ({c.type})
                  </SelectItem>
                ))}
                {addableContractors.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No more companies available.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-56 space-y-1">
            <Label className="text-xs">Role on project</Label>
            <Select value={contractorRole} onValueChange={setContractorRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Client">Client</SelectItem>
                <SelectItem value="MainContractor">Main Contractor</SelectItem>
                <SelectItem value="ArchConsultant">Architecture Consultant</SelectItem>
                <SelectItem value="MEPConsultant">MEP Consultant</SelectItem>
                <SelectItem value="InteriorContractor">Interior Contractor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={onAddContractor}
            disabled={!contractorCompanyId || addContractor.isPending}
          >
            <Building2 className="h-4 w-4 mr-1" /> Add company
          </Button>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Permission Levels</h2>
          <Badge variant="outline" className="ml-1">
            {others.length}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Per-user permissions other than PM. Use this to grant admin, viewer, or
          contractor roles for individual users on this project.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Company</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {others.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground h-16 text-center">
                  No additional permissions assigned.
                </TableCell>
              </TableRow>
            ) : (
              others.map((a) => (
                <TableRow key={a.assignmentId}>
                  <TableCell>{a.email ?? `User #${a.userId}`}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={ROLE_BADGE[a.role as AdminProjectAssignmentRole]}
                    >
                      {ROLE_LABEL[a.role as AdminProjectAssignmentRole]}
                    </Badge>
                  </TableCell>
                  <TableCell>{a.companyName ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        removeAssignment.mutate({
                          projectId,
                          assignmentId: a.assignmentId,
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end pt-2 border-t">
          <div className="space-y-1">
            <Label className="text-xs">User</Label>
            <Select value={permUserId} onValueChange={setPermUserId}>
              <SelectTrigger>
                <SelectValue placeholder="User…" />
              </SelectTrigger>
              <SelectContent>
                {data.availableUsers.map((u) => (
                  <SelectItem key={u.userId} value={String(u.userId)}>
                    {userOptionLabel(u)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Role</Label>
            <Select
              value={permRole}
              onValueChange={(v) => setPermRole(v as AdminProjectAssignmentRole)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" /> Admin
                  </span>
                </SelectItem>
                <SelectItem value="pm">Project Manager</SelectItem>
                <SelectItem value="contractor_lead">Contractor Lead</SelectItem>
                <SelectItem value="contractor_member">
                  Contractor Member
                </SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              Company {permRole.startsWith("contractor_") ? "" : "(optional)"}
            </Label>
            <Select value={permCompanyId} onValueChange={setPermCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {data.contractorCompanies.map((c) => (
                  <SelectItem
                    key={c.projectCompanyId}
                    value={String(c.companyId)}
                  >
                    {c.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={onAddPermission} disabled={!permUserId || upsert.isPending}>
            <UserPlus className="h-4 w-4 mr-1" /> Apply
          </Button>
        </div>
      </Card>
    </div>
  );
}
