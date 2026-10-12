import { Body, Controller, Get, Patch } from "@nestjs/common";
import {
  type Settings,
  type UpdateSettingsInput,
  updateSettingsSchema,
  type UserProfile,
} from "@weather/shared";
import { type AuthenticatedUser, CurrentUser } from "../auth/guards";
import { UserData } from "../common/user-data";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { toUserProfile } from "../users/user-profile";

@Controller("me")
@UserData()
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /api/me -> the signed-in user's profile
  @Get()
  async profile(@CurrentUser() user: AuthenticatedUser): Promise<UserProfile> {
    return toUserProfile(await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } }));
  }

  // GET /api/me/settings
  @Get("settings")
  async settings(@CurrentUser() user: AuthenticatedUser): Promise<Settings> {
    return (await this.profile(user)).settings;
  }

  // PATCH /api/me/settings { units?, language?, theme? } -> full settings
  @Patch("settings")
  async updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateSettingsSchema)) body: UpdateSettingsInput,
  ): Promise<Settings> {
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: body });
    return toUserProfile(updated).settings;
  }
}
