/** Dashboard & report contracts (SRS §6.7, §7.9). */
import { z } from "zod";
import { classBandSchema } from "./classes";
import { defaulterSchema } from "./billing";

/* ------------------------------ Dashboard -------------------------------- */

export const dashboardSummarySchema = z.object({
  active_students: z.number().int().nonnegative(),
  today_sessions: z.number().int().nonnegative(),
  outstanding_minor: z.number().int().nonnegative(),
  /** Rolling 30-day attendance rate (0..1), or null if no data. */
  attendance_rate: z.number().nullable(),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;

export const dashboardSessionSchema = z.object({
  id: z.string(),
  class_name: z.string(),
  code: z.string(),
  band: classBandSchema,
  start_time: z.string(),
  end_time: z.string(),
  status: z.string(),
  enrolled_count: z.number().int(),
  present_count: z.number().int(),
});

export const activityEntrySchema = z.object({
  id: z.string(),
  action: z.string(),
  entity_type: z.string().nullable(),
  actor_name: z.string().nullable(),
  created_at: z.string(),
});
export type ActivityEntry = z.infer<typeof activityEntrySchema>;

export const dashboardResponseSchema = z.object({
  summary: dashboardSummarySchema,
  today: z.array(dashboardSessionSchema),
  defaulters_top: z.array(defaulterSchema),
  activity: z.array(activityEntrySchema),
});
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;

/* -------------------------------- Reports -------------------------------- */

export const attendanceReportRowSchema = z.object({
  class_id: z.string(),
  class_name: z.string(),
  code: z.string(),
  band: classBandSchema,
  sessions: z.number().int(),
  present: z.number().int(),
  expected: z.number().int(),
  rate: z.number().nullable(),
});
export type AttendanceReportRow = z.infer<typeof attendanceReportRowSchema>;

export const revenueReportRowSchema = z.object({
  period: z.string(),
  billed_minor: z.number().int(),
  collected_minor: z.number().int(),
});
export type RevenueReportRow = z.infer<typeof revenueReportRowSchema>;

export const reportRangeQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  format: z.enum(["json", "csv"]).optional(),
});
export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>;
