import type { AttendanceStatus } from "@tuition/shared";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const OPTIONS: { value: AttendanceStatus; label: string; pressed: string }[] = [
  { value: "present", label: "Present", pressed: "aria-pressed:bg-ok-bg aria-pressed:text-ok-ink aria-pressed:border-ok-border" },
  { value: "late", label: "Late", pressed: "aria-pressed:bg-warn-bg aria-pressed:text-warn-ink aria-pressed:border-warn-border" },
  { value: "absent", label: "Absent", pressed: "aria-pressed:bg-bad-bg aria-pressed:text-bad-ink aria-pressed:border-bad-border" },
  { value: "excused", label: "Excused", pressed: "aria-pressed:bg-status-neutral-bg aria-pressed:text-status-neutral-ink aria-pressed:border-status-neutral-border" },
];

/**
 * Segmented attendance control. Selecting a status marks it; clicking the active
 * one clears the mark.
 */
export function AttendanceMarker({
  status,
  disabled,
  onMark,
  onClear,
}: {
  status: AttendanceStatus | null;
  disabled?: boolean;
  onMark: (status: AttendanceStatus) => void;
  onClear: () => void;
}) {
  return (
    <ToggleGroup
      value={status ? [status] : []}
      onValueChange={(value) => {
        const next = value[0] as AttendanceStatus | undefined;
        if (!next) onClear();
        else onMark(next);
      }}
      size="sm"
      spacing={0}
      disabled={disabled}
      aria-label="Attendance status"
      className="bg-background rounded-[var(--radius-sm)] border p-[3px]"
    >
      {OPTIONS.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          aria-label={o.label}
          className={`text-muted-foreground hover:text-foreground border-transparent px-2.5 text-xs font-semibold ${o.pressed}`}
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
