/**
 * Auth & user/role contracts (Zod). Imported by the API for request validation
 * (reject unknown fields) and by the admin portal for typed forms & responses.
 */

import { z } from "zod";

/* ----------------------------- Auth requests ----------------------------- */

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, "Password is required").max(200),
}).strict();
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refresh_token: z.string().min(1),
}).strict();
export type RefreshInput = z.infer<typeof refreshSchema>;

/* ----------------------------- Auth responses ---------------------------- */

export const authTokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  /** Access-token expiry as ISO-8601 UTC. */
  expires_at: z.string().datetime(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const roleSummarySchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
});
export type RoleSummary = z.infer<typeof roleSummarySchema>;

/** The authenticated user, their roles and the flattened permission set. */
export const meSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  status: z.enum(["active", "suspended"]),
  roles: z.array(roleSummarySchema),
  /** Flattened, de-duplicated permission keys (may include `*`). */
  permissions: z.array(z.string()),
});
export type Me = z.infer<typeof meSchema>;

export const loginResponseSchema = z.object({
  tokens: authTokensSchema,
  user: meSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/* --------------------------- User management ----------------------------- */

export const userStatusSchema = z.enum(["active", "suspended"]);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  status: userStatusSchema,
  roles: z.array(roleSummarySchema),
  created_at: z.string().datetime(),
  last_login_at: z.string().datetime().nullable(),
});
export type User = z.infer<typeof userSchema>;

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8, "Use at least 8 characters").max(200),
  role_ids: z.array(z.string()).min(1, "Assign at least one role"),
}).strict();
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  status: userStatusSchema.optional(),
  role_ids: z.array(z.string()).min(1).optional(),
}).strict();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/* --------------------------- Role management ----------------------------- */

export const roleSchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
  description: z.string(),
  system: z.boolean(),
  permissions: z.array(z.string()),
  user_count: z.number().int().nonnegative().optional(),
});
export type Role = z.infer<typeof roleSchema>;

const roleKeyPattern = /^[a-z][a-z0-9_]*$/;

export const createRoleSchema = z.object({
  key: z.string().trim().regex(roleKeyPattern, "Lowercase letters, digits and underscores only").max(40),
  label: z.string().trim().min(1).max(60),
  description: z.string().trim().max(240).default(""),
  permissions: z.array(z.string()).default([]),
}).strict();
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(240).optional(),
  permissions: z.array(z.string()).optional(),
}).strict();
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

/* ------------------------------- Errors ---------------------------------- */

export const apiErrorSchema = z.object({
  error: z.string(),
  details: z.record(z.unknown()).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
