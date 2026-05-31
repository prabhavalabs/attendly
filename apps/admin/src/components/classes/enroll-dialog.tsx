import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus } from "lucide-react";
import { toast } from "sonner";
import type { StudentSummary } from "@tuition/shared";

import { api, ApiError } from "@/lib/api";
import { useEnroll } from "@/hooks/use-classes";
import { UserAvatar } from "@/components/common/user-avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function EnrollDialog({
  classId,
  enrolledIds,
  open,
  onOpenChange,
}: {
  classId: string;
  enrolledIds: Set<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const enroll = useEnroll(classId);

  const { data: results, isFetching } = useQuery({
    queryKey: ["student-search", dq],
    queryFn: () =>
      dq.trim()
        ? api.get<{ students: StudentSummary[] }>(`/api/students/search?q=${encodeURIComponent(dq)}`).then((r) => r.students)
        : Promise.resolve([]),
  });

  async function add(s: StudentSummary) {
    try {
      await enroll.mutateAsync({ student_id: s.id });
      toast.success(`${s.full_name} enrolled`);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      toast.error(
        code === "class_full" ? "This class is full." : code === "already_enrolled" ? "Already enrolled." : "Could not enroll.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enroll a student</DialogTitle>
          <DialogDescription>Search by name, reg no or phone.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students…" className="h-10 pl-9" autoFocus />
        </div>
        <ScrollArea className="max-h-[44vh]">
          <div className="grid gap-1.5 pr-3">
            {(results ?? []).map((s) => {
              const enrolled = enrolledIds.has(s.id);
              return (
                <div key={s.id} className="hover:bg-muted/60 flex items-center gap-3 rounded-[var(--radius-md)] p-2">
                  <UserAvatar name={s.full_name} seed={s.id} photoUrl={s.photo_url} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{s.full_name}</div>
                    <div className="text-muted-foreground tnum text-xs">{s.reg_no}</div>
                  </div>
                  {enrolled ? (
                    <span className="text-muted-foreground text-xs font-semibold">Enrolled</span>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => void add(s)}>
                      <Plus className="size-4" /> Add
                    </Button>
                  )}
                </div>
              );
            })}
            {dq.trim() && !isFetching && (results ?? []).length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">No students match “{dq}”.</p>
            ) : null}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
