// tmp/14-users-auth.md 「複数ログイン方法の紐付け (アカウント設定 /account)」節のフォーム。
import { field } from "./common.ts";

export interface UnlinkForm {
  accountId: string;
}

export function parseUnlinkForm(body: Record<string, string>): UnlinkForm {
  return { accountId: field(body, "accountId") };
}

export interface EmailForm {
  email: string;
}

export function parseEmailForm(body: Record<string, string>): EmailForm {
  return { email: field(body, "email") };
}

export interface NameForm {
  name: string;
}

export function parseNameForm(body: Record<string, string>): NameForm {
  return { name: field(body, "name") };
}
