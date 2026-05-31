/** Org settings contracts (SRS §11.8 seeds org_name, currency, timezone). */
import { z } from "zod";

export const settingsSchema = z.object({
  org_name: z.string(),
  currency: z.string(),
  timezone: z.string(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const updateSettingsSchema = z
  .object({
    org_name: z.string().trim().min(1).max(120).optional(),
    currency: z.string().trim().min(1).max(8).optional(),
    timezone: z.string().trim().min(1).max(60).optional(),
  })
  .strict();
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
