import { useState } from "react";
import { Plus, MoreHorizontal, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import type { Lecturer } from "@tuition/shared";

import { ApiError } from "@/lib/api";
import { useLecturers, useDeleteLecturer } from "@/hooks/use-lecturers";
import { Can } from "@/components/auth/can";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { LecturerDialog } from "./lecturer-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LecturersTab() {
  const { data: lecturers, isLoading } = useLecturers();
  const del = useDeleteLecturer();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Lecturer | null>(null);
  const [deleting, setDeleting] = useState<Lecturer | null>(null);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {lecturers ? `${lecturers.length} ${lecturers.length === 1 ? "lecturer" : "lecturers"}` : "Instructors"}
        </p>
        <Can perm="lecturer.manage">
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Add lecturer
          </Button>
        </Can>
      </div>

      <div className="bg-card overflow-hidden rounded-2xl border" style={{ boxShadow: "var(--sh-flat)" }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Classes</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell />
                </TableRow>
              ))
            ) : lecturers && lecturers.length > 0 ? (
              lecturers.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-semibold">{l.name}</TableCell>
                  <TableCell className="tnum text-muted-foreground">{l.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{l.email ?? "—"}</TableCell>
                  <TableCell className="tnum">{l.class_count ?? 0}</TableCell>
                  <TableCell>
                    <Can perm="lecturer.manage">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon-sm" aria-label="Actions">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditing(l)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(l)}>
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Can>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5}>
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <div className="bg-accent text-primary grid size-12 place-items-center rounded-2xl">
                      <GraduationCap className="size-6" />
                    </div>
                    <div className="text-muted-foreground text-sm">No lecturers yet.</div>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <LecturerDialog open={addOpen} onOpenChange={setAddOpen} />
      <LecturerDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} lecturer={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Remove ${deleting?.name ?? "lecturer"}?`}
        description="Their classes will be left without an assigned lecturer."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await del.mutateAsync(deleting.id);
            toast.success("Lecturer removed");
          } catch (err) {
            toast.error(err instanceof ApiError ? "Could not remove lecturer." : "Could not remove lecturer.");
            throw err;
          }
        }}
      />
    </div>
  );
}
