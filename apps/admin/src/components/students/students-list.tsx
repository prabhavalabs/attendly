import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, MoreHorizontal, Printer, Trash2, Eye, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { StudentStatus, StudentSummary } from "@tuition/shared";

import { ApiError } from "@/lib/api";
import { useStudents, useDeleteStudent, openCardPdf } from "@/hooks/use-students";
import { Can } from "@/components/auth/can";
import { UserAvatar } from "@/components/common/user-avatar";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StudentStatusBadge, CardStatusBadge } from "@/components/students/student-status";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PAGE_SIZE = 12;

const FILTERS: { label: string; value?: StudentStatus }[] = [
  { label: "All" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Graduated", value: "graduated" },
  { label: "Withdrawn", value: "withdrawn" },
];

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function StudentsList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StudentStatus | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<StudentSummary | null>(null);
  const q = useDebounced(search);

  // Reset to page 1 whenever the filters change.
  useEffect(() => setPage(1), [q, status]);

  const { data, isLoading, isError } = useStudents({ q, status, page, page_size: PAGE_SIZE });
  const deleteStudent = useDeleteStudent();

  const totalPages = useMemo(() => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1), [data]);

  function open(id: string) {
    void navigate({ to: "/students/$id", params: { id } });
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteStudent.mutateAsync(deleting.id);
      toast.success(`${deleting.full_name} removed`);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "request_failed";
      toast.error(code === "forbidden" ? "You don't have permission to delete students." : "Could not remove student.");
      throw err;
    }
  }

  const rows = data?.students ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, reg no, or phone…"
            className="h-10 pl-9"
            aria-label="Search students"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => {
            const active = status === f.value;
            return (
              <Button
                key={f.label}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                className="rounded-full"
                onClick={() => setStatus(f.value)}
              >
                {f.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="bg-card overflow-hidden rounded-2xl border" style={{ boxShadow: "var(--sh-flat)" }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Reg no</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Card</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-9 rounded-full" />
                      <Skeleton className="h-3.5 w-36" />
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell />
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-10 text-center text-sm">
                  Couldn't load students.
                </TableCell>
              </TableRow>
            ) : rows.length > 0 ? (
              rows.map((s) => (
                <TableRow key={s.id} className="cursor-pointer" onClick={() => open(s.id)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <UserAvatar name={s.full_name} seed={s.id} photoUrl={s.photo_url} size={36} />
                      <span className="font-semibold">{s.full_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="tnum text-muted-foreground">{s.reg_no}</TableCell>
                  <TableCell className="tnum text-muted-foreground">{s.phone ?? "—"}</TableCell>
                  <TableCell><StudentStatusBadge status={s.status} /></TableCell>
                  <TableCell><CardStatusBadge status={s.card_status} /></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon-sm" aria-label="Actions">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => open(s.id)}>
                          <Eye className="size-4" /> View
                        </DropdownMenuItem>
                        <Can perm="card.issue">
                          <DropdownMenuItem onClick={() => void openCardPdf(s.id)}>
                            <Printer className="size-4" /> Print card
                          </DropdownMenuItem>
                        </Can>
                        <Can perm="student.delete">
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleting(s)}
                          >
                            <Trash2 className="size-4" /> Remove
                          </DropdownMenuItem>
                        </Can>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <div className="bg-accent text-primary grid size-12 place-items-center rounded-2xl">
                      <Users className="size-6" />
                    </div>
                    <div>
                      <div className="font-display font-semibold">
                        {q || status ? "No students match your filters" : "No students yet"}
                      </div>
                      <div className="text-muted-foreground text-sm">
                        {q || status ? "Try a different search or filter." : "Register your first student to get started."}
                      </div>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.total > 0 ? (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            {data.total} {data.total === 1 ? "student" : "students"}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="size-4" /> Prev
            </Button>
            <span className="text-muted-foreground tnum text-sm">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Remove ${deleting?.full_name ?? "student"}?`}
        description="The student is soft-deleted — attendance and payment history is preserved and can be restored."
        confirmLabel="Remove student"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
