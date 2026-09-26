// tmp/14-users-auth.md 「サーバーサイドでの呼び出し」節: /auth/magic-link, /auth/dev のフォーム。
import { field } from "./common.ts";

export interface MagicLinkForm {
  email: string;
}

export function parseMagicLinkForm(body: Record<string, string>): MagicLinkForm {
  return { email: field(body, "email") };
}

export interface DevLoginForm {
  email: string;
}

export function parseDevLoginForm(body: Record<string, string>): DevLoginForm {
  return { email: field(body, "email") };
}
