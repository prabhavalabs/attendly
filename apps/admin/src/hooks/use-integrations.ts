import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GoogleStatus, GoogleCalendar, ConnectUrl } from "@tuition/shared";
import { api } from "@/lib/api";

export function useGoogleStatus() {
  return useQuery({
    queryKey: ["google-status"],
    queryFn: () => api.get<GoogleStatus>("/api/integrations/google"),
  });
}

export function useGoogleCalendars(enabled: boolean) {
  return useQuery({
    queryKey: ["google-calendars"],
    queryFn: () => api.get<{ calendars: GoogleCalendar[] }>("/api/integrations/google/calendars").then((r) => r.calendars),
    enabled,
  });
}

/** Fetch the consent URL and open Google's OAuth page. */
export async function connectGoogle(): Promise<void> {
  const { url } = await api.get<ConnectUrl>("/api/integrations/google/connect");
  window.open(url, "_blank", "noopener");
}

export function useSetCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (calendar_id: string) => api.patch<{ ok: true }>("/api/integrations/google", { calendar_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["google-status"] }),
  });
}

export function useDisconnectGoogle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: true }>("/api/integrations/google/disconnect"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["google-status"] });
      qc.invalidateQueries({ queryKey: ["google-calendars"] });
    },
  });
}
