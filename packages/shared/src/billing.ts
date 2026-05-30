/**
 * Billing contracts (Zod) — SRS §5.3, §6.6, §7.6.
 * Money is integer minor units (LKR cents). Periods are `YYYY-MM`.
 */
import { z } from "zod";
import { studentSummarySchema } from "./students";

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/; // YYYY-MM
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const invoiceStatusSchema = z.enum(["pending", "partial", "paid", "overdue", "waived"]);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const paymentMethodSchema = z.enum(["cash", "card", "bank", "online"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/* ------------------------------- Invoices -------------------------------- */

export const invoiceSchema = z.object({
  id: z.string(),
  student_id: z.string(),
  student_name: z.string(),
  reg_no: z.string(),
  class_id: z.string(),
  class_name: z.string(),
  code: z.string(),
  period: z.string(),
  amount_minor: z.number().int().nonnegative(),
  paid_minor: z.number().int().nonnegative(),
  outstanding_minor: z.number().int(),
  due_date: z.string(),
  status: invoiceStatusSchema,
  waived_reason: z.string().nullable(),
  created_at: z.string(),
});
export type Invoice = z.infer<typeof invoiceSchema>;

export const generateInvoicesSchema = z
  .object({
    period: z.string().regex(PERIOD_RE, "Use YYYY-MM"),
    /** Optional due date (defaults to the 10th of the period). */
    due_date: z.string().regex(DATE_RE).optional(),
    class_id: z.string().optional(),
  })
  .strict();
export type GenerateInvoicesInput = z.infer<typeof generateInvoicesSchema>;

export const updateInvoiceSchema = z
  .object({
    /** Adjust the billed amount (minor units). */
    amount_minor: z.number().int().nonnegative().optional(),
    due_date: z.string().regex(DATE_RE).optional(),
    /** Waive the invoice with a reason (audited). */
    waive: z.boolean().optional(),
    waived_reason: z.string().trim().max(240).optional(),
  })
  .strict();
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

export const invoiceListQuerySchema = z.object({
  period: z.string().regex(PERIOD_RE).optional(),
  status: invoiceStatusSchema.optional(),
  student_id: z.string().optional(),
  class_id: z.string().optional(),
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

/* ------------------------------- Payments -------------------------------- */

export const paymentSchema = z.object({
  id: z.string(),
  invoice_id: z.string(),
  student_id: z.string(),
  amount_minor: z.number().int().nonnegative(),
  method: paymentMethodSchema,
  receipt_no: z.string(),
  note: z.string().nullable(),
  paid_at: z.string(),
});
export type Payment = z.infer<typeof paymentSchema>;

export const createPaymentSchema = z
  .object({
    invoice_id: z.string().min(1),
    amount_minor: z.number().int().positive("Enter an amount"),
    method: paymentMethodSchema.default("cash"),
    note: z.string().trim().max(240).nullish(),
    paid_at: z.string().datetime().optional(),
  })
  .strict();
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

/* ------------------------------ Defaulters ------------------------------- */

export const defaulterSchema = z.object({
  student: studentSummarySchema,
  outstanding_minor: z.number().int().nonnegative(),
  overdue_periods: z.array(z.string()),
  invoice_count: z.number().int().nonnegative(),
});
export type Defaulter = z.infer<typeof defaulterSchema>;
