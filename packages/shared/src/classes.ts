/**
 * Classes, lecturers, enrollments, timetable & sessions contracts (Zod).
 * SRS §5.2, §6.5, §7.5. Money is integer minor units (LKR cents).
 */
import { z } from "zod";
import { studentSummarySchema } from "./students";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/; // HH:MM 24h
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD

/* ------------------------------ Lecturers -------------------------------- */

export const lecturerSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  created_at: z.string(),
  class_count: z.number().int().nonnegative().optional(),
});
export type Lecturer = z.infer<typeof lecturerSchema>;

export const createLecturerSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    phone: z.string().trim().max(20).nullish(),
    email: z.string().trim().toLowerCase().email().nullish(),
  })
  .strict();
export type CreateLecturerInput = z.infer<typeof createLecturerSchema>;

export const updateLecturerSchema = createLecturerSchema.partial().strict();
export type UpdateLecturerInput = z.infer<typeof updateLecturerSchema>;

/* -------------------------------- Classes -------------------------------- */

/** Class/batch edge-band palette (design tokens --band-*). */
export const classBandSchema = z.enum(["teal", "amber", "coral", "blue", "violet", "green"]);
export type ClassBand = z.infer<typeof classBandSchema>;

export const classStatusSchema = z.enum(["active", "archived"]);
export type ClassStatus = z.infer<typeof classStatusSchema>;

export const classSchema = z.object({
  id: z.string(),
  name: z.string(),
  subject: z.string(),
  code: z.string(),
  band: classBandSchema,
  fee_minor: z.number().int().nonnegative(),
  capacity: z.number().int().nullable(),
  room: z.string().nullable(),
  lecturer_id: z.string().nullable(),
  lecturer_name: z.string().nullable(),
  status: classStatusSchema,
  enrolled_count: z.number().int().nonnegative(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Class = z.infer<typeof classSchema>;

export const createClassSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    subject: z.string().trim().min(1, "Subject is required").max(80),
    code: z.string().trim().min(1, "Short code is required").max(12),
    band: classBandSchema.default("teal"),
    fee_minor: z.number().int("Whole number").nonnegative().default(0),
    capacity: z.number().int().min(1).nullish(),
    room: z.string().trim().max(60).nullish(),
    lecturer_id: z.string().nullish(),
  })
  .strict();
export type CreateClassInput = z.infer<typeof createClassSchema>;

export const updateClassSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    subject: z.string().trim().min(1).max(80).optional(),
    code: z.string().trim().min(1).max(12).optional(),
    band: classBandSchema.optional(),
    fee_minor: z.number().int().nonnegative().optional(),
    capacity: z.number().int().min(1).nullish(),
    room: z.string().trim().max(60).nullish(),
    lecturer_id: z.string().nullish(),
    status: classStatusSchema.optional(),
  })
  .strict();
export type UpdateClassInput = z.infer<typeof updateClassSchema>;

/* ------------------------------ Enrollments ------------------------------ */

export const enrollmentStatusSchema = z.enum(["active", "dropped"]);
export type EnrollmentStatus = z.infer<typeof enrollmentStatusSchema>;

/** Enrollment with the joined student summary (for the class roster view). */
export const enrollmentSchema = z.object({
  id: z.string(),
  class_id: z.string(),
  status: enrollmentStatusSchema,
  fee_override_minor: z.number().int().nullable(),
  /** Effective fee = override ?? class fee. */
  effective_fee_minor: z.number().int().nonnegative(),
  enrolled_at: z.string(),
  student: studentSummarySchema,
});
export type Enrollment = z.infer<typeof enrollmentSchema>;

/** A class the student is enrolled in (for the student-detail enrollments tab). */
export const studentEnrollmentSchema = z.object({
  id: z.string(),
  class_id: z.string(),
  class_name: z.string(),
  code: z.string(),
  band: classBandSchema,
  status: enrollmentStatusSchema,
  effective_fee_minor: z.number().int().nonnegative(),
});
export type StudentEnrollment = z.infer<typeof studentEnrollmentSchema>;

export const createEnrollmentSchema = z
  .object({
    student_id: z.string().min(1),
    fee_override_minor: z.number().int().nonnegative().nullish(),
  })
  .strict();
export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;

/* ------------------------------- Timetable ------------------------------- */

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const timetableSlotSchema = z.object({
  id: z.string(),
  class_id: z.string(),
  weekday: z.number().int().min(0).max(6),
  start_time: z.string(),
  end_time: z.string(),
  room: z.string().nullable(),
});
export type TimetableSlot = z.infer<typeof timetableSlotSchema>;

export const createTimetableSlotSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    start_time: z.string().regex(TIME_RE, "Use HH:MM"),
    end_time: z.string().regex(TIME_RE, "Use HH:MM"),
    room: z.string().trim().max(60).nullish(),
  })
  .strict()
  .refine((s) => s.end_time > s.start_time, {
    message: "End must be after start",
    path: ["end_time"],
  });
export type CreateTimetableSlotInput = z.infer<typeof createTimetableSlotSchema>;

/* -------------------------------- Sessions ------------------------------- */

export const sessionStatusSchema = z.enum(["scheduled", "open", "closed", "cancelled"]);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const classSessionSchema = z.object({
  id: z.string(),
  class_id: z.string(),
  class_name: z.string(),
  code: z.string(),
  band: classBandSchema,
  session_date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  status: sessionStatusSchema,
  topic: z.string().nullable(),
  substitute_lecturer_id: z.string().nullable(),
  enrolled_count: z.number().int().nonnegative(),
  present_count: z.number().int().nonnegative(),
  created_at: z.string(),
});
export type ClassSession = z.infer<typeof classSessionSchema>;

export const generateSessionsSchema = z
  .object({
    class_id: z.string().optional(),
    from: z.string().regex(DATE_RE, "Use YYYY-MM-DD"),
    to: z.string().regex(DATE_RE, "Use YYYY-MM-DD"),
  })
  .strict()
  .refine((s) => s.to >= s.from, { message: "End date must be on/after start", path: ["to"] });
export type GenerateSessionsInput = z.infer<typeof generateSessionsSchema>;

export const updateSessionSchema = z
  .object({
    status: sessionStatusSchema.optional(),
    topic: z.string().trim().max(200).nullish(),
    substitute_lecturer_id: z.string().nullish(),
  })
  .strict();
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;

export const sessionListQuerySchema = z.object({
  from: z.string().regex(DATE_RE).optional(),
  to: z.string().regex(DATE_RE).optional(),
  class_id: z.string().optional(),
  status: sessionStatusSchema.optional(),
});
export type SessionListQuery = z.infer<typeof sessionListQuerySchema>;

/** A roster row: enrolled student + their attendance status for the session. */
export const rosterEntrySchema = z.object({
  student: studentSummarySchema,
  status: z.enum(["present", "late", "absent", "excused"]).nullable(),
  method: z.string().nullable(),
  checked_in_at: z.string().nullable(),
});
export type RosterEntry = z.infer<typeof rosterEntrySchema>;
