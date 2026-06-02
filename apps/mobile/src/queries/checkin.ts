/** Outbox-backed check-in hook: enqueue, flush, and surface the recent log. */
import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { enqueue, flush, recent, pendingCount, type EnqueueInput } from "@/lib/outbox";
import { useOnline } from "@/lib/net";

export function useCheckin(sessionId: string) {
  const online = useOnline();
  const qc = useQueryClient();

  // The recent log + pending count are read from the local SQLite outbox.
  const outbox = useQuery({
    queryKey: ["outbox", sessionId],
    queryFn: async () => {
      const [log, pending] = await Promise.all([recent(sessionId), pendingCount(sessionId)]);
      return { log, pending };
    },
  });
  const data = outbox.data ?? { log: [], pending: 0 };

  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: ["outbox", sessionId] }),
    [qc, sessionId],
  );

  const { mutate: runSync, isPending: syncing } = useMutation({
    mutationFn: () => flush(),
    onSuccess: (result) => {
      // When the server actually accepted check-ins, refresh the server-derived
      // views so counts update live: the roster's per-student marks and the
      // sessions list's present_count. Without this the app only refreshed the
      // local outbox and the counts looked stale until a manual reload.
      if (result.synced > 0) {
        void qc.invalidateQueries({ queryKey: ["roster", sessionId] });
        void qc.invalidateQueries({ queryKey: ["sessions", "today"] });
      }
    },
    onSettled: () => refresh(),
  });
  const sync = useCallback(() => runSync(), [runSync]);

  const checkIn = useCallback(
    async (input: Omit<EnqueueInput, "sessionId">) => {
      await enqueue({ sessionId, ...input });
      await refresh();
      runSync(); // best-effort immediate sync; stays queued if offline
    },
    [sessionId, refresh, runSync],
  );

  // Drain the queue whenever connectivity returns.
  useEffect(() => {
    if (online) runSync();
  }, [online, runSync]);

  return { log: data.log, pending: data.pending, syncing, online, checkIn, sync, refresh };
}
