/** EN / සිං segmented toggle (matches the design topbar). */
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

export function LangToggle() {
  const language = useUiStore((s) => s.language);
  const setLanguage = useUiStore((s) => s.setLanguage);

  return (
    <div className="bg-background flex rounded-[var(--radius-sm)] border p-[3px]">
      <button
        type="button"
        onClick={() => setLanguage("en")}
        className={cn(
          "rounded-md px-2.5 py-1 text-xs font-bold transition-colors",
          language === "en"
            ? "bg-card text-primary shadow-[var(--sh-flat)]"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLanguage("si")}
        className={cn(
          "font-sinhala rounded-md px-2.5 py-1 text-xs font-bold transition-colors",
          language === "si"
            ? "bg-card text-primary shadow-[var(--sh-flat)]"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        සිං
      </button>
    </div>
  );
}
