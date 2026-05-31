/** Outbox-backed check-in hook: enqueue, flush, and surface the recent log. */
import { useCallback, useEffect, useState } from "react";
import { enqueue, flush, recent, pendingCount, type EnqueueInput } from "@/lib/outbox";
import type { OutboxRow } from "@/lib/db";
import { useOnline } from "@/lib/net";

export function useCheckin(sessionId: string) {
  const online = useOnline();
  const [log, setLog] = useState<OutboxRow[]>([]);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const [rows, n] = await Promise.all([recent(sessionId), pendingCount(sessionId)]);
    setLog(rows);
    setPending(n);
  }, [sessionId]);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      await flush();
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [refresh]);

  const checkIn = useCallback(
    async (input: Omit<EnqueueInput, "sessionId">) => {
      await enqueue({ sessionId, ...input });
      await refresh();
      // Best-effort immediate sync; stays queued if offline.
      void sync();
    },
    [sessionId, refresh, sync],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Drain the queue whenever connectivity returns.
  useEffect(() => {
    if (online) void sync();
  }, [online, sync]);

  return { log, pending, syncing, online, checkIn, sync, refresh };
}
