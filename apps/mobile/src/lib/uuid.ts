/**
 * Client dedup-key generator (SRS §10). Not security-sensitive — it only needs
 * to be unique per queued check-in so the server can dedup offline replays.
 * Uses crypto.randomUUID when available, else a v4-shaped fallback.
 */
export function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
