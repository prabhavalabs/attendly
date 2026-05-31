import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notification, CreateNotificationInput } from "@tuition/shared";
import { api } from "@/lib/api";

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ notifications: Notification[] }>("/api/notifications").then((r) => r.notifications),
  });
}

export function useSendNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNotificationInput) => api.post<Notification>("/api/notifications", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
