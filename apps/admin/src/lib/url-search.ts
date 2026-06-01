import { useCallback } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

/**
 * Read + write the current route's URL search params as a typed record.
 *
 * Every list page keeps its page / search / filter state in the URL so the
 * view is shareable, bookmarkable and survives a refresh or back/forward.
 *
 * Uses `{ strict: false }` so the same hook works from any route without
 * threading the route id through; each list route still declares a
 * `validateSearch` that defines the canonical shape + defaults.
 *
 * `setSearch` merges a patch into the existing params and drops keys that are
 * undefined / null / "" so the URL stays clean (?status=active, not
 * ?status=&q=). It uses `replace` so paging doesn't spam the history stack.
 */
export function useUrlSearch<T extends Record<string, unknown>>(): {
  search: T;
  setSearch: (patch: Partial<T>) => void;
} {
  const navigate = useNavigate();
  const search = useRouterState().location.search as T;

  const setSearch = useCallback(
    (patch: Partial<T>) => {
      void navigate({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        search: ((prev: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...prev, ...patch };
          for (const key of Object.keys(next)) {
            const v = next[key];
            if (v === undefined || v === null || v === "") delete next[key];
          }
          return next;
        }) as any,
        replace: true,
      });
    },
    [navigate],
  );

  return { search, setSearch };
}

/** Coerce an unknown search value to a positive integer page (default 1). */
export function asPage(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Coerce an unknown search value to a trimmed string (default ""). */
export function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}
