// tmp/08-turn-trigger-admin-cli.md 「Web 管理画面」節、tmp/14-users-auth.md
// 「ログイン方法の設定」節のフォームパース。v2 でパスワード欄は撤去された (セッション + isAdmin で保護)。
import { AppError } from "../../app/errors.ts";
import type { AuthMethodsFlags } from "../../app/auth-methods.ts";
import { field } from "./common.ts";

export interface AdminBackupForm {
  label: string | undefined;
}

export function parseAdminBackupForm(body: Record<string, string>): AdminBackupForm {
  const label = field(body, "label");
  return { label: label === "" ? undefined : label };
}

/**
 * 最終更新時刻の変更フォーム。`datetime` (datetime-local, ローカル時刻) と `unix` (秒指定) の
 * どちらか一方を受け取る。両方空なら invalid_input。
 */
export interface AdminLastTimeForm {
  unix: number;
}

export function parseAdminLastTimeForm(body: Record<string, string>): AdminLastTimeForm {
  const unixRaw = field(body, "unix");
  const datetimeRaw = field(body, "datetime");

  if (unixRaw !== "") {
    if (!/^\d+$/.test(unixRaw)) {
      throw new AppError("invalid_input", "unix must be a non-negative integer");
    }
    return { unix: Number(unixRaw) };
  }
  if (datetimeRaw !== "") {
    // datetime-local: "YYYY-MM-DDTHH:mm" (ローカル時刻扱い。タイムゾーン情報を含まない)。
    const ms = new Date(datetimeRaw).getTime();
    if (Number.isNaN(ms)) {
      throw new AppError("invalid_input", "datetime must be a valid datetime-local value");
    }
    return { unix: Math.floor(ms / 1000) };
  }
  throw new AppError("invalid_input", "either datetime or unix is required");
}

/** チェックボックスの有無 (存在すれば "on" 等の非空文字列) を真偽値に変換する。 */
function parseCheckbox(body: Record<string, string>, name: string): boolean {
  return field(body, name) !== "";
}

/** 管理画面のログイン方法トグルフォーム。 */
export function parseAuthMethodsForm(body: Record<string, string>): AuthMethodsFlags {
  return {
    x: parseCheckbox(body, "x"),
    discord: parseCheckbox(body, "discord"),
    email: parseCheckbox(body, "email"),
  };
}
