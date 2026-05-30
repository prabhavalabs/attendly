import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ClassSession,
  GenerateSessionsInput,
  UpdateSessionInput,
  RosterEntry,
} from "@tuition/shared";
import { api } from "@/lib/api";

export interface SessionListParams {
  from?: string;
  to?: string;
  class_id?: string;
  status?: string;
}

export function useSessions(params: SessionListParams) {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.class_id) qs.set("class_id", params.class_id);
  if (params.status) qs.set("status", params.status);
  const query = qs.toString();
  return useQuery({
    queryKey: ["sessions", params],
    queryFn: () => api.get<{ sessions: ClassSession[] }>(`/api/sessions${query ? `?${query}` : ""}`).then((r) => r.sessions),
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
