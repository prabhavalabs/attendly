import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { StudentSummary } from "@tuition/shared";

import { api } from "@/lib/api";
import { checkPermission } from "@/lib/auth-store";
import { useT } from "@/lib/i18n";
import { NAV_GROUPS } from "@/components/layout/nav-config";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const t = useT();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);

  const { data: students } = useQuery({
    queryKey: ["cmd-students", dq],
    queryFn: () =>
      dq.trim()
        ? api.get<{ students: StudentSummary[] }>(`/api/students/search?q=${encodeURIComponent(dq)}`).then((r) => r.students)
        : Promise.resolve([]),
    enabled: open,
  });

  const navItems = NAV_GROUPS.flatMap((g) => g.items).filter((i) => !i.perm || checkPermission(i.perm));
  const ql = q.trim().toLowerCase();
  const filteredNav =
    ql === ""
      ? navItems
      : navItems.filter((i) => i.label.toLowerCase().includes(ql) || t(i.key).toLowerCase().includes(ql));

  function close() {
    onOpenChange(false);
    setQ("");
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Search students and pages">
      <Command shouldFilter={false}>
        <CommandInput placeholder="Search students, pages…" value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {(students?.length ?? 0) > 0 ? (
            <CommandGroup heading="Students">
              {students!.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`stu-${s.id}`}
                  onSelect={() => {
                    close();
                    void navigate({ to: "/students/$id", params: { id: s.id } });
                  }}
                >
                  {s.full_name}
                  <span className="text-muted-foreground tnum ml-2 text-xs">{s.reg_no}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {filteredNav.length > 0 ? (
            <CommandGroup heading="Pages">
              {filteredNav.map((i) => (
                <CommandItem
                  key={i.to}
                  value={`nav-${i.label}`}
                  onSelect={() => {
                    close();
                    void navigate({ to: i.to } as never);
                  }}
                >
                  <i.icon className="size-4" />
                  {t(i.key)}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
