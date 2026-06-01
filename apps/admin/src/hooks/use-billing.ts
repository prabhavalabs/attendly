import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
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
  page?: number;
  page_size?: number;
}

interface InvoiceListResult {
  invoices: Invoice[];
  total: number;
  page: number;
  page_size: number;
}

export function useInvoices(params: InvoiceListParams) {
  const qs = new URLSearchParams();
  if (params.period) qs.set("period", params.period);
  if (params.status) qs.set("status", params.status);
  if (params.student_id) qs.set("student_id", params.student_id);
  if (params.class_id) qs.set("class_id", params.class_id);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return useQuery({
    queryKey: ["invoices", params],
    queryFn: () => api.get<InvoiceListResult>(`/api/invoices${query ? `?${query}` : ""}`),
    placeholderData: keepPreviousData,
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

export interface DefaulterListParams {
  page?: number;
  page_size?: number;
}

interface DefaulterListResult {
  defaulters: Defaulter[];
  total: number;
  page: number;
  page_size: number;
}

export function useDefaulters(params: DefaulterListParams = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return useQuery({
    queryKey: ["defaulters", params],
    queryFn: () => api.get<DefaulterListResult>(`/api/reports/defaulters${query ? `?${query}` : ""}`),
    placeholderData: keepPreviousData,
  });
}

/** Fetch a payment receipt PDF (authenticated) and open it in a new tab. */
export async function openReceiptPdf(paymentId: string): Promise<void> {
  const blob = await api.blob(`/api/payments/${paymentId}/receipt.pdf`);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Fetch an invoice PDF (authenticated) and open it in a new tab. */
export async function openInvoicePdf(invoiceId: string): Promise<void> {
  const blob = await api.blob(`/api/invoices/${invoiceId}/invoice.pdf`);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
