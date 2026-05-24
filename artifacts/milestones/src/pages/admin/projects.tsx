import { Link } from "wouter";
import { useAdminListProjects } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, ChevronRight } from "lucide-react";

export default function AdminProjects() {
  const { data, isLoading, isError, error } = useAdminListProjects();

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }
  if (isError) {
    const status = (error as { status?: number } | null)?.status;
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card className="p-8 text-center space-y-2">
          <h2 className="text-lg font-semibold">
            {status === 403 ? "Admin access required" : "Failed to load projects"}
          </h2>
          <p className="text-muted-foreground text-sm">
            {status === 403
              ? "You need company admin privileges to view this page."
              : "Please try again later."}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-start gap-3">
        <div className="bg-primary/10 text-primary p-2 rounded-md">
          <FolderKanban className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">
            Assign PMs, contractor companies, and per-user permissions across
            every project your company runs.
          </p>
        </div>
      </header>

      <Card className="overflow-hidden shadow-sm p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Project</TableHead>
              <TableHead className="text-right">PMs</TableHead>
              <TableHead className="text-right">Contractor companies</TableHead>
              <TableHead className="text-right">People assigned</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center h-32 text-muted-foreground"
                >
                  Your company is not on any projects yet.
                </TableCell>
              </TableRow>
            ) : (
              (data ?? []).map((p) => (
                <TableRow key={p.projectId} className="hover:bg-muted/30">
                  <TableCell>
                    <Link
                      href={`/admin/projects/${p.projectId}`}
                      className="flex flex-col"
                    >
                      <span className="text-[10px] uppercase font-mono tracking-wide text-muted-foreground">
                        {p.projectCode}
                      </span>
                      <span className="font-medium">{p.projectName}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline">{p.pmCount}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline">{p.contractorCompanyCount}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline">{p.memberCount}</Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/projects/${p.projectId}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
