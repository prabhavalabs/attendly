import { useState } from "react";
import { Link, useParams, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Pencil, Trash2, Plus, MoreHorizontal, Users } from "lucide-react";
import { toast } from "sonner";
import type { Enrollment } from "@tuition/shared";

import { useClass, useEnrollments, useUnenroll, useDeleteClass } from "@/hooks/use-classes";
import { formatLKR } from "@/lib/money";
import { Can } from "@/components/auth/can";
import { UserAvatar } from "@/components/common/user-avatar";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { BAND_VAR, ClassChip } from "@/components/classes/band";
import { ClassDialog } from "@/components/classes/class-dialog";
import { EnrollDialog } from "@/components/classes/enroll-dialog";
import { TimetableEditor } from "@/components/classes/timetable-editor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ClassDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();
  const { data: cls, isLoading, isError } = useClass(id);
  const { data: enrollments } = useEnrollments(id);
  const unenroll = useUnenroll(id);
  const deleteClass = useDeleteClass();

  const [editOpen, setEditOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [removing, setRemoving] = useState<Enrollment | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="p-6 md:p-8">
        <Skeleton className="mb-4 h-4 w-20" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }
  if (isError || !cls) {
    return (
      <div className="p-6 md:p-8">
        <Link to="/classes" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ChevronLeft className="size-4" /> Classes
        </Link>
        <div className="text-muted-foreground mt-10 text-center text-sm">Class not found.</div>
      </div>
    );
  }

  const enrolledIds = new Set((enrollments ?? []).map((e) => e.student.id));

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-8">
      <Link to="/classes" className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm">
        <ChevronLeft className="size-4" /> Classes
      </Link>

      <div className="bg-card relative mb-5 overflow-hidden rounded-2xl border p-6" style={{ boxShadow: "var(--sh-card)" }}>
        <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: BAND_VAR[cls.band] }} aria-hidden />
        <div className="flex flex-wrap items-start justify-between gap-4 pl-2">
          <div>
            <div className="flex items-center gap-2">
              <ClassChip band={cls.band} code={cls.code} />
              <span className="text-muted-foreground text-sm">{cls.subject}</span>
            </div>
            <h2 className="font-display mt-2 text-2xl font-bold tracking-tight">{cls.name}</h2>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="tnum font-semibold text-[var(--ink-800)]">{formatLKR(cls.fee_minor)}/mo</span>
              <span className="tnum flex items-center gap-1.5">
                <Users className="size-3.5" />
                {cls.enrolled_count}
                {cls.capacity != null ? ` / ${cls.capacity}` : ""} enrolled
              </span>
              <span>{cls.lecturer_name ?? "Unassigned"}</span>
              {cls.room ? <span>Room {cls.room}</span> : null}
            </div>
          </div>
          <Can perm="class.manage">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" /> Edit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="outline" size="icon-sm" aria-label="Class actions">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="size-4" /> Delete class
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Can>
        </div>
      </div>

      <Tabs defaultValue="enrollments">
        <TabsList>
          <TabsTrigger value="enrollments">Enrollments ({cls.enrolled_count})</TabsTrigger>
          <TabsTrigger value="timetable">Timetable ({cls.timetable.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="enrollments" className="mt-5">
          <div className="mb-3 flex justify-end">
            <Can perm="class.manage">
              <Button size="sm" onClick={() => setEnrollOpen(true)}>
                <Plus className="size-4" /> Enroll student
              </Button>
            </Can>
          </div>
          {(enrollments ?? []).length === 0 ? (
            <div className="bg-card text-muted-foreground rounded-2xl border py-12 text-center text-sm" style={{ boxShadow: "var(--sh-flat)" }}>
              No students enrolled yet.
            </div>
          ) : (
            <div className="bg-card overflow-hidden rounded-2xl border" style={{ boxShadow: "var(--sh-flat)" }}>
              <ul className="divide-y">
                {(enrollments ?? []).map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                    <UserAvatar name={e.student.full_name} seed={e.student.id} photoUrl={e.student.photo_url} size={34} />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => void navigate({ to: "/students/$id", params: { id: e.student.id } })}
                    >
                      <div className="truncate text-sm font-semibold">{e.student.full_name}</div>
                      <div className="text-muted-foreground tnum text-xs">{e.student.reg_no}</div>
                    </button>
                    <span className="tnum text-muted-foreground text-sm">{formatLKR(e.effective_fee_minor)}</span>
                    <Can perm="class.manage">
                      <Button variant="ghost" size="icon-sm" aria-label="Unenroll" onClick={() => setRemoving(e)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </Can>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>

        <TabsContent value="timetable" className="mt-5">
          <TimetableEditor classId={id} slots={cls.timetable} />
        </TabsContent>
      </Tabs>

      <ClassDialog open={editOpen} onOpenChange={setEditOpen} cls={cls} />
      <EnrollDialog classId={id} enrolledIds={enrolledIds} open={enrollOpen} onOpenChange={setEnrollOpen} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Unenroll ${removing?.student.full_name ?? "student"}?`}
        description="They will be removed from this class roster."
        confirmLabel="Unenroll"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          await unenroll.mutateAsync(removing.id);
          toast.success("Student unenrolled");
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${cls.name}?`}
        description="The class is removed along with its enrollments and timetable. Past sessions are kept."
        confirmLabel="Delete class"
        destructive
        onConfirm={async () => {
          await deleteClass.mutateAsync(id);
          toast.success("Class deleted");
          void navigate({ to: "/classes" });
        }}
      />
    </div>
  );
}
