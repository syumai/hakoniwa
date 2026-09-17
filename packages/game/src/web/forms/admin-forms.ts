// tmp/08-turn-trigger-admin-cli.md 「Web 管理画面」節のフォームパース。
import { AppError } from "../../app/errors.ts";
import { field } from "./common.ts";

export interface AdminAuthForm {
  password: string;
}

export function parseAdminAuthForm(body: Record<string, string>): AdminAuthForm {
  return { password: field(body, "password") };
}

export interface AdminBackupForm extends AdminAuthForm {
  label: string | undefined;
}

export function parseAdminBackupForm(body: Record<string, string>): AdminBackupForm {
  const label = field(body, "label");
  return { password: field(body, "password"), label: label === "" ? undefined : label };
}

/**
 * 最終更新時刻の変更フォーム。`datetime` (datetime-local, ローカル時刻) と `unix` (秒指定) の
 * どちらか一方を受け取る。両方空なら invalid_input。
 */
export interface AdminLastTimeForm extends AdminAuthForm {
  unix: number;
}

export function parseAdminLastTimeForm(body: Record<string, string>): AdminLastTimeForm {
  const password = field(body, "password");
  const unixRaw = field(body, "unix");
  const datetimeRaw = field(body, "datetime");

  if (unixRaw !== "") {
    if (!/^\d+$/.test(unixRaw)) {
      throw new AppError("invalid_input", "unix must be a non-negative integer");
    }
    return { password, unix: Number(unixRaw) };
  }
  if (datetimeRaw !== "") {
    // datetime-local: "YYYY-MM-DDTHH:mm" (ローカル時刻扱い。タイムゾーン情報を含まない)。
    const ms = new Date(datetimeRaw).getTime();
    if (Number.isNaN(ms)) {
      throw new AppError("invalid_input", "datetime must be a valid datetime-local value");
    }
    return { password, unix: Math.floor(ms / 1000) };
  }
  throw new AppError("invalid_input", "either datetime or unix is required");
}
