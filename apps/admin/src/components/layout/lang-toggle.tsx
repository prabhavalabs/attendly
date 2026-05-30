/** EN / සිං segmented toggle (shadcn ToggleGroup; matches the design topbar). */
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUiStore } from "@/lib/ui-store";

const ITEM_CLASS =
  "px-2.5 text-xs font-bold text-muted-foreground hover:text-foreground aria-pressed:bg-card aria-pressed:text-primary aria-pressed:shadow-[var(--sh-flat)]";

export function LangToggle() {
  const language = useUiStore((s) => s.language);
  const setLanguage = useUiStore((s) => s.setLanguage);

  return (
    <ToggleGroup
      value={[language]}
      onValueChange={(value) => {
        const next = value[0];
        if (next === "en" || next === "si") setLanguage(next);
      }}
      size="sm"
      spacing={0}
      aria-label="Language"
      className="bg-background gap-0 rounded-[var(--radius-sm)] border p-[3px]"
    >
      <ToggleGroupItem value="en" aria-label="English" className={ITEM_CLASS}>
        EN
      </ToggleGroupItem>
      <ToggleGroupItem value="si" aria-label="Sinhala" className={`font-sinhala ${ITEM_CLASS}`}>
        සිං
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
