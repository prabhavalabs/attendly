/**
 * Student, guardian & card contracts (Zod) — SRS §5.3, §7.2, §7.3.
 * Imported by the API (validation) and the admin/mobile clients (typed forms).
 */
import { z } from "zod";

/* ------------------------------- Enums ----------------------------------- */

export const studentStatusSchema = z.enum(["active", "inactive", "graduated", "withdrawn"]);
export type StudentStatus = z.infer<typeof studentStatusSchema>;

export const cardStatusSchema = z.enum(["active", "revoked", "lost"]);
export type CardStatus = z.infer<typeof cardStatusSchema>;

export const guardianRelationshipSchema = z.enum([
  "mother",
  "father",
  "guardian",
  "sibling",
  "other",
]);
export type GuardianRelationship = z.infer<typeof guardianRelationshipSchema>;

/* ------------------------------ Guardians -------------------------------- */

export const guardianSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  email: z.string().email().nullable(),
  relationship: guardianRelationshipSchema,
  is_primary: z.boolean(),
});
export type Guardian = z.infer<typeof guardianSchema>;

export const createGuardianSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    phone: z.string().trim().min(1, "Phone is required").max(20),
    email: z.string().trim().toLowerCase().email().nullish(),
    relationship: guardianRelationshipSchema.default("guardian"),
    is_primary: z.boolean().default(false),
  })
  .strict();
export type CreateGuardianInput = z.infer<typeof createGuardianSchema>;

export const updateGuardianSchema = createGuardianSchema.partial().strict();
export type UpdateGuardianInput = z.infer<typeof updateGuardianSchema>;

/* ------------------------------- Students -------------------------------- */

export const studentSchema = z.object({
  id: z.string(),
  reg_no: z.string(),
  full_name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  photo_url: z.string().nullable(),
  card_token: z.string(),
  card_status: cardStatusSchema,
  card_issued_at: z.string().nullable(),
  status: studentStatusSchema,
  date_of_birth: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Student = z.infer<typeof studentSchema>;

/** Student detail includes guardians (and, from M2, enrollments). */
export const studentDetailSchema = studentSchema.extend({
  guardians: z.array(guardianSchema),
});
export type StudentDetail = z.infer<typeof studentDetailSchema>;

/** Compact shape for list rows / search results / rosters. */
export const studentSummarySchema = z.object({
  id: z.string(),
  reg_no: z.string(),
  full_name: z.string(),
  phone: z.string().nullable(),
  photo_url: z.string().nullable(),
  status: studentStatusSchema,
  card_status: cardStatusSchema,
});
export type StudentSummary = z.infer<typeof studentSummarySchema>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .nullish();

export const createStudentSchema = z
  .object({
    full_name: z.string().trim().min(1, "Name is required").max(120),
    phone: z.string().trim().max(20).nullish(),
    email: z.string().trim().toLowerCase().email().nullish(),
    date_of_birth: isoDate,
    address: z.string().trim().max(300).nullish(),
    notes: z.string().trim().max(1000).nullish(),
    status: studentStatusSchema.default("active"),
    /** Optional guardians to create alongside the student. */
    guardians: z.array(createGuardianSchema).max(6).default([]),
  })
  .strict();
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = z
  .object({
    full_name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().max(20).nullish(),
    email: z.string().trim().toLowerCase().email().nullish(),
    date_of_birth: isoDate,
    address: z.string().trim().max(300).nullish(),
    notes: z.string().trim().max(1000).nullish(),
    status: studentStatusSchema.optional(),
  })
  .strict();
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

/* ------------------------------- Listing --------------------------------- */

export const studentListQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: studentStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});
export type StudentListQuery = z.infer<typeof studentListQuerySchema>;

export const studentListResponseSchema = z.object({
  students: z.array(studentSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int(),
  page_size: z.number().int(),
});
export type StudentListResponse = z.infer<typeof studentListResponseSchema>;
