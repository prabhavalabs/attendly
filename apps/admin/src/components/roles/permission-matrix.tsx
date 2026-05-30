import type { PermissionGroup } from "@tuition/shared";
import { Checkbox } from "@/components/ui/checkbox";

export function PermissionMatrix({
  groups,
  value,
  onChange,
  disabled = false,
}: {
  groups: PermissionGroup[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const set = new Set(value);

  function toggle(key: string, checked: boolean) {
    const next = new Set(set);
    if (checked) next.add(key);
    else next.delete(key);
    onChange([...next]);
  }

  function toggleGroup(keys: string[], checked: boolean) {
    const next = new Set(set);
    for (const k of keys) {
      if (checked) next.add(k);
      else next.delete(k);
    }
    onChange([...next]);
  }

  return (
    <div className="grid max-h-[46vh] gap-3 overflow-y-auto pr-1">
      {groups.map((group) => {
        const keys = group.permissions.map((p) => p.key);
        const allOn = keys.every((k) => set.has(k));
        const someOn = keys.some((k) => set.has(k));
        return (
          <div key={group.resource} className="rounded-[var(--radius-md)] border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold">{group.label}</span>
              <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs font-semibold">
                <Checkbox
                  checked={allOn}
                  indeterminate={someOn && !allOn}
                  disabled={disabled}
                  onCheckedChange={(c) => toggleGroup(keys, c === true)}
                />
                Select all
              </label>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {group.permissions.map((p) => (
                <label
                  key={p.key}
                  className="hover:bg-muted/60 flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm"
                >
                  <Checkbox
                    checked={set.has(p.key)}
                    disabled={disabled}
                    onCheckedChange={(c) => toggle(p.key, c === true)}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
