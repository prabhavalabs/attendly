import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Build a compact page-number window with ellipses, e.g.
 * [1, "…", 4, 5, 6, "…", 20]. Always shows first + last and a window
 * around the current page.
 */
function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push("…");
  for (let p = start; p <= end; p++) out.push(p);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}

/**
 * Shared list pager: "Showing X–Y of T" on the left, numbered page buttons
 * (with prev/next) on the right. Server-side — the parent owns the data; this
 * just renders controls and reports the next page via onPageChange.
 */
export function Pager({
  page,
  pageSize,
  total,
  onPageChange,
  noun = "result",
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Singular noun for the summary; pluralized with a trailing "s". */
  noun?: string;
  className?: string;
}) {
  if (total <= 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const go = (p: number) => {
    const clamped = Math.min(totalPages, Math.max(1, p));
    if (clamped !== page) onPageChange(clamped);
  };

  return (
    <div className={cn("mt-4 flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="text-muted-foreground text-sm">
        Showing <span className="tnum font-medium">{from}</span>–
        <span className="tnum font-medium">{to}</span> of{" "}
        <span className="tnum font-medium">{total}</span> {total === 1 ? noun : `${noun}s`}
      </p>
      {totalPages > 1 ? (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => go(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          {pageWindow(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="text-muted-foreground px-1 text-sm" aria-hidden>
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? "default" : "outline"}
                size="icon-sm"
                className="tnum min-w-8"
                aria-current={p === page ? "page" : undefined}
                onClick={() => go(p)}
              >
                {p}
              </Button>
            ),
          )}
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= totalPages}
            onClick={() => go(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
