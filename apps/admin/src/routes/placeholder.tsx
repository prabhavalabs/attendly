import { Settings } from "lucide-react";

/** Generic "coming soon" page for nav modules not yet built. */
export function Placeholder({ name }: { name: string }) {
  return (
    <div className="p-6 md:p-8">
      <div
        className="bg-card mx-auto mt-10 max-w-xl rounded-2xl border p-12 text-center"
        style={{ boxShadow: "var(--sh-flat)" }}
      >
        <div className="bg-accent text-primary border-brand-100 mx-auto mb-4 grid size-14 place-items-center rounded-2xl border">
          <Settings className="size-6" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">{name}</h2>
        <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm leading-relaxed">
          This module follows the same shell, table, card-motif and status language
          shown across the portal. Ready to build next.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {["Loading skeletons", "Empty states", "Permission-gated", "Bilingual EN / සිං"].map(
            (tag) => (
              <span
                key={tag}
                className="bg-secondary text-muted-foreground rounded-full px-3 py-1 text-xs font-semibold"
              >
                {tag}
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
