/**
 * Notification contracts (SRS §7.7). v1 records & schedules messages; actual
 * delivery (push/SMS/email) is pluggable and lands with M5.
 */
import { z } from "zod";

export const notificationTypeSchema = z.enum(["announcement", "reminder"]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const notificationChannelSchema = z.enum(["in_app", "push", "sms", "email"]);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const notificationAudienceSchema = z.enum(["all_students", "all_guardians", "class", "student"]);
export type NotificationAudience = z.infer<typeof notificationAudienceSchema>;

export const notificationStatusSchema = z.enum(["queued", "sent", "failed"]);
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;

export const notificationSchema = z.object({
  id: z.string(),
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string(),
  channel: notificationChannelSchema,
  audience: notificationAudienceSchema,
  class_id: z.string().nullable(),
  student_id: z.string().nullable(),
  recipient_count: z.number().int().nonnegative(),
  status: notificationStatusSchema,
  scheduled_at: z.string().nullable(),
  sent_at: z.string().nullable(),
  created_at: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const createNotificationSchema = z
  .object({
    type: notificationTypeSchema.default("announcement"),
    title: z.string().trim().min(1, "Title is required").max(120),
    body: z.string().trim().min(1, "Message is required").max(2000),
    channel: notificationChannelSchema.default("in_app"),
    audience: notificationAudienceSchema,
    class_id: z.string().nullish(),
    student_id: z.string().nullish(),
    /** ISO-8601 UTC; if omitted the message sends immediately. */
    scheduled_at: z.string().datetime().optional(),
  })
  .strict()
  .refine((v) => v.audience !== "class" || !!v.class_id, { message: "Pick a class", path: ["class_id"] })
  .refine((v) => v.audience !== "student" || !!v.student_id, { message: "Pick a student", path: ["student_id"] });
export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
