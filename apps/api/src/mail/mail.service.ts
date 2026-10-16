import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";
import type { Env } from "../config/env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// SMTP via nodemailer: works with Gmail (app password), Brevo, or any SMTP relay.
// Without SMTP_URL nothing is sent: development logs the message (links included)
// so flows can be tried locally; production only logs that sending is disabled,
// because email links are secrets and must not end up in logs.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly logContent: boolean;

  constructor(config: ConfigService<Env, true>) {
    const url = config.get("SMTP_URL", { infer: true });
    this.transporter = url ? createTransport(url) : null;
    this.from = config.get("MAIL_FROM", { infer: true });
    this.logContent = config.get("NODE_ENV", { infer: true }) === "development";
  }

  async send(mail: Mail): Promise<void> {
    if (!this.transporter) {
      if (this.logContent) {
        this.logger.log(
          `[mail not sent: no SMTP_URL] to=${mail.to} "${mail.subject}"\n${mail.text}`,
        );
      } else {
        this.logger.warn(`Email "${mail.subject}" not sent: SMTP_URL is not configured`);
      }
      return;
    }
    await this.transporter.sendMail({ from: this.from, ...mail });
  }
}
