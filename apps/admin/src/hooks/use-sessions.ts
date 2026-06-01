import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ClassSession,
  GenerateSessionsInput,
  UpdateSessionInput,
  RosterEntry,
  AttendanceStatus,
  CheckinResult,
} from "@tuition/shared";
import { api } from "@/lib/api";

export interface SessionListParams {
  from?: string;
  to?: string;
  class_id?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

export interface SessionListResult {
  sessions: ClassSession[];
  total: number;
  page: number;
  page_size: number;
}

export function useSessions(params: SessionListParams) {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.class_id) qs.set("class_id", params.class_id);
  if (params.status) qs.set("status", params.status);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return useQuery({
    queryKey: ["sessions", params],
    queryFn: () => api.get<SessionListResult>(`/api/sessions${query ? `?${query}` : ""}`),
    placeholderData: keepPreviousData,
  });
}

export function useGenerateSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateSessionsInput) =>
      api.post<{ created: number; classes: number }>("/api/sessions/generate", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

export function useUpdateSession(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSessionInput) => api.patch<ClassSession>(`/api/sessions/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["roster", id] });
    },
  });
}

export function useRoster(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["roster", sessionId],
    queryFn: () =>
      api.get<{ session: ClassSession; roster: RosterEntry[] }>(`/api/sessions/${sessionId}/roster`),
    enabled: !!sessionId,
  });
}

/** Manually mark a student's attendance for a session (edit-prior-record). */
export function useMarkAttendance(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, status }: { studentId: string; status: AttendanceStatus }) =>
      api.post<CheckinResult>("/api/checkin", {
        session_id: sessionId,
        student_id: studentId,
        status,
        method: "manual",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roster", sessionId] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}

/** Clear a student's mark for a session. */
export function useClearAttendance(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) =>
      api.delete<{ ok: true }>(`/api/sessions/${sessionId}/attendance/${studentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roster", sessionId] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}
