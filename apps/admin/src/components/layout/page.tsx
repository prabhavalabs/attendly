import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type Crumb = { label: string; to?: string };

/**
 * The single, canonical page container for every admin route.
 *
 * Full available width, one padding rhythm, one header treatment — so list
 * pages and detail pages share the exact same layout and use all the
 * horizontal space (no empty side margins on wide screens). The breadcrumb
 * + title + actions live here (not duplicated in the app-shell topbar).
 */
export function Page({
  title,
  crumbs,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title?: ReactNode;
  crumbs?: Crumb[];
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const hasHeader = Boolean(title || (crumbs && crumbs.length) || actions || description);
  return (
    <div className={cn("w-full px-6 pt-6 pb-16 md:px-8", className)}>
      {hasHeader ? (
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {crumbs && crumbs.length ? (
              <nav
                aria-label="Breadcrumb"
                className="text-muted-foreground mb-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]"
              >
                {crumbs.map((c, i) => {
                  const last = i === crumbs.length - 1;
                  return (
                    <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                      {i > 0 ? <ChevronRight className="size-3.5 opacity-40" aria-hidden /> : null}
                      {c.to && !last ? (
                        <Link to={c.to} className="hover:text-foreground transition-colors">
                          {c.label}
                        </Link>
                      ) : (
                        <span className={last ? "text-foreground font-semibold" : ""}>{c.label}</span>
                      )}
                    </span>
                  );
                })}
              </nav>
            ) : null}
            {title ? (
              <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
            ) : null}
            {description ? (
              <p className="text-muted-foreground mt-1 text-sm">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={contentClassName}>{children}</div>
    </div>
  );
}
