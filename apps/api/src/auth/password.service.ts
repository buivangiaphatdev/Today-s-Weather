import { Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";

// argon2id with the library defaults, which match OWASP's minimum:
// 19 MiB memory, 2 iterations, 1 lane
@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return hash(password);
  }

  // Always runs argon2, even for unknown emails (null hash), so response time does not
  // reveal whether an account exists
  async verify(passwordHash: string | null, password: string): Promise<boolean> {
    const target = passwordHash ?? (await (this.dummyHash ??= hash("timing-equaliser")));
    const matches = await verify(target, password).catch(() => false);
    return passwordHash !== null && matches;
  }
}
