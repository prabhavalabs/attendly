import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Invoice,
  GenerateInvoicesInput,
  UpdateInvoiceInput,
  CreatePaymentInput,
  Payment,
  Defaulter,
} from "@tuition/shared";
import { api } from "@/lib/api";

export interface InvoiceListParams {
  period?: string;
  status?: string;
  student_id?: string;
  class_id?: string;
}

export function useInvoices(params: InvoiceListParams) {
  const qs = new URLSearchParams();
  if (params.period) qs.set("period", params.period);
  if (params.status) qs.set("status", params.status);
  if (params.student_id) qs.set("student_id", params.student_id);
  if (params.class_id) qs.set("class_id", params.class_id);
  const query = qs.toString();
  return useQuery({
    queryKey: ["invoices", params],
    queryFn: () => api.get<{ invoices: Invoice[] }>(`/api/invoices${query ? `?${query}` : ""}`).then((r) => r.invoices),
  });
}

export function useGenerateInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateInvoicesInput) => api.post<{ created: number }>("/api/invoices/generate", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["defaulters"] });
    },
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateInvoiceInput }) =>
      api.patch<Invoice>(`/api/invoices/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["defaulters"] });
    },
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePaymentInput) =>
      api.post<{ payment: Payment; invoice: Invoice }>("/api/payments", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["defaulters"] });
    },
  });
}

export function useDefaulters() {
  return useQuery({
    queryKey: ["defaulters"],
    queryFn: () => api.get<{ defaulters: Defaulter[] }>("/api/reports/defaulters").then((r) => r.defaulters),
  });
}

/** Fetch a payment receipt PDF (authenticated) and open it in a new tab. */
export async function openReceiptPdf(paymentId: string): Promise<void> {
  const blob = await api.blob(`/api/payments/${paymentId}/receipt.pdf`);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
