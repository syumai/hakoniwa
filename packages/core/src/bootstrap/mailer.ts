// tmp/14-users-auth.md 「メール送信 (app/ports.ts の Mailer)」節の移植。
// fetch のみに依存する (Node / Workers 共通。node:* を import しない)。
import type { Logger, Mailer } from "../app/ports.ts";

/** 開発用: ログにリンクを出すだけの Mailer。`HAKONIWA_RESEND_API_KEY` 未設定時の既定。 */
export class ConsoleMailer implements Mailer {
  readonly #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  async send(mail: { to: string; subject: string; text: string }): Promise<void> {
    this.#logger.info(`ConsoleMailer: to=${mail.to} subject=${mail.subject}\n${mail.text}`);
  }
}

export interface ResendMailerConfig {
  apiKey: string;
  from: string;
  /** テスト用に注入可能。省略時はグローバルの `fetch`。 */
  fetchImpl?: typeof fetch;
}

/** 本番用: Resend (https://resend.com) の HTTP API で送信する Mailer。 */
export class ResendMailer implements Mailer {
  readonly #apiKey: string;
  readonly #from: string;
  readonly #fetchImpl: typeof fetch;

  constructor(config: ResendMailerConfig) {
    this.#apiKey = config.apiKey;
    this.#from = config.from;
    this.#fetchImpl = config.fetchImpl ?? fetch;
  }

  async send(mail: { to: string; subject: string; text: string }): Promise<void> {
    const res = await this.#fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.#from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      }),
    });
    if (!res.ok) {
      throw new Error(`ResendMailer: failed to send mail (status ${res.status})`);
    }
  }
}
