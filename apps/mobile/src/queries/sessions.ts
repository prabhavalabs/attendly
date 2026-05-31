/**
 * Session + roster queries. The roster is cached into SQLite on every
 * successful fetch so the door keeps working offline (SRS §10).
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cacheRoster, readRoster, cacheSession, readSession, type RosterRow } from "@/lib/db";

export interface SessionListItem {
  id: string;
  class_id: string;
  class_name: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string;
  topic: string | null;
  enrolled_count: number;
  present_count: number;
}

interface RosterEntry {
  student: {
    id: string;
    reg_no: string;
    full_name: string;
    phone: string | null;
    photo_url: string | null;
    status: string;
    card_status: string;
  };
  status: string | null;
  method: string | null;
  checked_in_at: string | null;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's sessions (any class), newest open first. */
export function useTodaySessions() {
  return useQuery({
    queryKey: ["sessions", "today"],
    queryFn: async () => {
      const today = iso(new Date());
      const res = await api.get<{ sessions: SessionListItem[] }>(`/api/sessions?from=${today}&to=${today}`);
      for (const s of res.sessions) {
        await cacheSession({
          id: s.id,
          class_name: s.class_name,
          session_date: s.session_date,
          start_time: s.start_time,
          end_time: s.end_time,
          status: s.status,
        });
      }
      return res.sessions;
    },
  });
}

export interface RosterData {
  session: { id: string; class_name: string; session_date: string; start_time: string; end_time: string; status: string } | null;
  roster: RosterRow[];
  offline: boolean;
}

/** Fetch + cache a session roster; fall back to the SQLite cache when offline. */
export function useRoster(sessionId: string) {
  return useQuery<RosterData>({
    queryKey: ["roster", sessionId],
    queryFn: async () => {
      try {
        const res = await api.get<{ session: SessionListItem | null; roster: RosterEntry[] }>(
          `/api/sessions/${sessionId}/roster`,
        );
        const rows: RosterRow[] = res.roster.map((e) => ({
          session_id: sessionId,
          student_id: e.student.id,
          reg_no: e.student.reg_no,
          full_name: e.student.full_name,
          photo_url: e.student.photo_url,
          status: e.student.status,
          card_status: e.student.card_status,
          att_status: e.status,
        }));
        await cacheRoster(sessionId, rows);
        return {
          session: res.session
            ? {
                id: res.session.id,
                class_name: res.session.class_name,
                session_date: res.session.session_date,
                start_time: res.session.start_time,
                end_time: res.session.end_time,
                status: res.session.status,
              }
            : null,
          roster: rows,
          offline: false,
        };
      } catch {
        // Offline (or transient) — serve the cached roster.
        const [roster, session] = await Promise.all([readRoster(sessionId), readSession(sessionId)]);
        return { session, roster, offline: true };
      }
    },
  });
}
