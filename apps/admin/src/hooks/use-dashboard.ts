import { useQuery } from "@tanstack/react-query";
import type { DashboardResponse } from "@tuition/shared";
import { api } from "@/lib/api";

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardResponse>("/api/dashboard"),
  });
}
