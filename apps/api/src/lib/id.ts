/** Prefixed, URL-safe unique IDs generated in the Worker (SRS §5.1). */
import { nanoid } from "nanoid";

export function newId(prefix: string): string {
  return `${prefix}_${nanoid(21)}`;
}

/** Current time as ISO-8601 UTC (the storage convention for all timestamps). */
export function nowIso(): string {
  return new Date().toISOString();
}

/** ISO-8601 UTC `seconds` into the future. */
export function isoIn(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}
