import type { UserProfile } from "@weather/shared";
import type { User } from "../generated/prisma/client";

// The only shape of a user that leaves the API (never passwordHash)
export function toUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerifiedAt !== null,
    settings: {
      units: user.units,
      language: user.language as UserProfile["settings"]["language"],
      theme: user.theme,
    },
    createdAt: user.createdAt.toISOString(),
  };
}
