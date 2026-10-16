import { z } from "zod";
import type { UserProfile } from "./user.js";

// Emails are compared case-insensitively: always trimmed and lowercased before use
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email("Invalid email"));

// Length-based policy (NIST SP 800-63B): no composition rules; capped so argon2 input stays bounded
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(50).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

// Login does not re-check the password policy: older passwords may predate it
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthResponse {
  accessToken: string;
  // Seconds until accessToken expires
  expiresIn: number;
  user: UserProfile;
}

// Secrets from email links and the Google hand-off (base64url, 43 chars when issued)
const oneTimeToken = z.string().min(20).max(200);

export const verifyEmailSchema = z.object({ token: oneTimeToken });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({ token: oneTimeToken, password: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const oauthExchangeSchema = z.object({ code: oneTimeToken });
export type OAuthExchangeInput = z.infer<typeof oauthExchangeSchema>;

// GET /api/auth/providers: which sign-in methods the API has configured
export interface AuthProviders {
  google: boolean;
}
