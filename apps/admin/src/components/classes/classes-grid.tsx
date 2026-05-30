import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, BookOpen, Users } from "lucide-react";
import type { Class } from "@tuition/shared";

import { useClasses } from "@/hooks/use-classes";
import { formatLKR } from "@/lib/money";
import { Can } from "@/components/auth/can";
import { BAND_VAR, ClassChip } from "@/components/classes/band";
import { ClassDialog } from "@/components/classes/class-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/common/status-badge";

function ClassCard({ cls, onOpen }: { cls: Class; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="bg-card relative overflow-hidden rounded-2xl border p-5 text-left transition-shadow hover:shadow-[var(--sh-card)]"
      style={{ boxShadow: "var(--sh-flat)" }}
    >
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: BAND_VAR[cls.band] }} aria-hidden />
      <div className="flex items-start justify-between gap-2 pl-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ClassChip band={cls.band} code={cls.code} />
            {cls.status === "archived" ? <StatusBadge tone="neutral">Archived</StatusBadge> : null}
          </div>
          <div className="font-display mt-2 truncate text-base font-semibold">{cls.name}</div>
          <div className="text-muted-foreground truncate text-xs">{cls.subject}</div>
        </div>
      </div>
      <div className="text-muted-foreground mt-4 flex items-center justify-between pl-1.5 text-sm">
        <span className="flex items-center gap-1.5">
          <Users className="size-3.5" />
          <span className="tnum">
            {cls.enrolled_count}
            {cls.capacity != null ? ` / ${cls.capacity}` : ""}
          </span>
        </span>
        <span className="tnum font-semibold text-[var(--ink-800)]">{formatLKR(cls.fee_minor)}</span>
      </div>
      <div className="text-muted-foreground mt-1 pl-1.5 text-xs">{cls.lecturer_name ?? "Unassigned"}</div>
    </button>
  );
}

export function ClassesGrid() {
  const navigate = useNavigate();
  const { data: classes, isLoading } = useClasses();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {classes ? `${classes.length} ${classes.length === 1 ? "class" : "classes"}` : "Batches"}
        </p>
        <Can perm="class.manage">
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> New class
          </Button>
        </Can>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : classes && classes.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((cls) => (
            <ClassCard key={cls.id} cls={cls} onOpen={() => void navigate({ to: "/classes/$id", params: { id: cls.id } })} />
          ))}
        </div>
      ) : (
        <div className="bg-card flex flex-col items-center gap-3 rounded-2xl border py-16 text-center" style={{ boxShadow: "var(--sh-flat)" }}>
          <div className="bg-accent text-primary grid size-12 place-items-center rounded-2xl">
            <BookOpen className="size-6" />
          </div>
          <div>
            <div className="font-display font-semibold">No classes yet</div>
            <div className="text-muted-foreground text-sm">Create your first class to start enrolling students.</div>
          </div>
        </div>
      )}

      <ClassDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
