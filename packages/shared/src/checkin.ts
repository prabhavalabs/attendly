/**
 * Check-in contracts (SRS §6.4). Check-in resolves a student by card_token,
 * student_id or reg_no, records attendance idempotently, and returns an
 * informational payment alert that never blocks the check-in.
 */
import { z } from "zod";

export const attendanceStatusSchema = z.enum(["present", "late", "absent", "excused"]);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

export const checkinMethodSchema = z.enum(["qr", "nfc", "search", "manual"]);
export type CheckinMethod = z.infer<typeof checkinMethodSchema>;

export const checkinSchema = z
  .object({
    session_id: z.string().min(1),
    /** Provide exactly one identifier. */
    card_token: z.string().optional(),
    student_id: z.string().optional(),
    reg_no: z.string().optional(),
    method: checkinMethodSchema.default("manual"),
    status: attendanceStatusSchema.default("present"),
    /** Client-generated UUID for offline idempotency (SRS §10). */
    client_dedup_key: z.string().max(80).optional(),
    /** ISO-8601 UTC; defaults to server time when omitted. */
    checked_in_at: z.string().datetime().optional(),
  })
  .strict()
  .refine((v) => Boolean(v.card_token || v.student_id || v.reg_no), {
    message: "One of card_token, student_id or reg_no is required",
    path: ["student_id"],
  });
export type CheckinInput = z.infer<typeof checkinSchema>;

export const paymentAlertSchema = z.object({
  has_outstanding: z.boolean(),
  overdue_periods: z.array(z.string()),
  outstanding_minor: z.number().int().nonnegative(),
});
export type PaymentAlert = z.infer<typeof paymentAlertSchema>;

export const checkinResultSchema = z.object({
  ok: z.boolean(),
  /** Echoes the client key so offline clients can clear their queue. */
  client_dedup_key: z.string().nullable(),
  student: z
    .object({
      id: z.string(),
      reg_no: z.string(),
      full_name: z.string(),
      photo_url: z.string().nullable(),
    })
    .nullable(),
  attendance: z
    .object({
      status: attendanceStatusSchema,
      method: checkinMethodSchema,
      duplicate: z.boolean(),
    })
    .nullable(),
  payment_alert: paymentAlertSchema.nullable(),
  /** Error code when a single item fails (e.g. card_not_found). */
  error: z.string().optional(),
});
export type CheckinResult = z.infer<typeof checkinResultSchema>;

export const checkinBatchSchema = z
  .object({
    items: z.array(checkinSchema).min(1).max(500),
  })
  .strict();
export type CheckinBatchInput = z.infer<typeof checkinBatchSchema>;

export const checkinBatchResultSchema = z.object({
  results: z.array(checkinResultSchema),
});
export type CheckinBatchResult = z.infer<typeof checkinBatchResultSchema>;

/** Manual mark from the admin roster (student already resolved). */
export const markAttendanceSchema = z
  .object({
    student_id: z.string().min(1),
    status: attendanceStatusSchema,
  })
  .strict();
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
