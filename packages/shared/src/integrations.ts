/** Integration contracts (SRS §6.7, §7.8) — Google Calendar. */
import { z } from "zod";

export const googleStatusSchema = z.object({
  connected: z.boolean(),
  account_email: z.string().nullable(),
  calendar_id: z.string().nullable(),
});
export type GoogleStatus = z.infer<typeof googleStatusSchema>;

export const googleCalendarSchema = z.object({
  id: z.string(),
  summary: z.string(),
  primary: z.boolean().optional(),
});
export type GoogleCalendar = z.infer<typeof googleCalendarSchema>;

export const connectUrlSchema = z.object({ url: z.string() });
export type ConnectUrl = z.infer<typeof connectUrlSchema>;

export const setCalendarSchema = z.object({ calendar_id: z.string().min(1) }).strict();
export type SetCalendarInput = z.infer<typeof setCalendarSchema>;
