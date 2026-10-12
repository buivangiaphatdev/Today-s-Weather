import { z } from "zod";

// Values match the Prisma enums in apps/api/prisma/schema.prisma
export const unitsSchema = z.enum(["metric", "imperial"]);
export const themeSchema = z.enum(["light", "dark", "system"]);
export const languageSchema = z.enum(["vi", "en"]);

export const settingsSchema = z.object({
  units: unitsSchema,
  language: languageSchema,
  theme: themeSchema,
});
export type Settings = z.infer<typeof settingsSchema>;

// PATCH /api/me/settings: any subset, but at least one field
export const updateSettingsSchema = settingsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  settings: Settings;
  createdAt: string; // ISO 8601
}
