import { useQuery } from "@tanstack/react-query";
import type { AttendanceReportRow, RevenueReportRow } from "@tuition/shared";
import { api } from "@/lib/api";

export function useAttendanceReport(range: { from: string; to: string }) {
  const qs = `from=${range.from}&to=${range.to}`;
  return useQuery({
    queryKey: ["report-attendance", range],
    queryFn: () => api.get<{ rows: AttendanceReportRow[] }>(`/api/reports/attendance?${qs}`).then((r) => r.rows),
  });
}

export function useRevenueReport() {
  return useQuery({
    queryKey: ["report-revenue"],
    queryFn: () => api.get<{ rows: RevenueReportRow[] }>("/api/reports/revenue").then((r) => r.rows),
  });
}

/** Download a report CSV (authenticated). */
export async function downloadReportCsv(path: string, filename: string): Promise<void> {
  const blob = await api.blob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
