// tmp/08-turn-trigger-admin-cli.md 「Web 管理画面」節、tmp/14-users-auth.md
// 「ログイン方法の設定」節のフォームパース。v2 でパスワード欄は撤去された (セッション + isAdmin で保護)。
import { AppError } from "../../app/errors.ts";
import type { AuthMethodsFlags } from "../../app/auth-methods.ts";
import { parseLocalDateTime } from "../../app/timezone.ts";
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

export function parseAdminLastTimeForm(
  body: Record<string, string>,
  timezone: string,
): AdminLastTimeForm {
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
    // tmp/16-season.md「タイムゾーン」節: HAKONIWA_TIMEZONE で解釈する (実行環境依存の
    // `new Date(datetimeRaw)` は使わない)。
    try {
      return { unix: parseLocalDateTime(datetimeRaw, timezone) };
    } catch {
      throw new AppError("invalid_input", "datetime must be a valid datetime-local value");
    }
  }
  throw new AppError("invalid_input", "either datetime or unix is required");
}

/**
 * 「新しいデータを作る」フォーム。開始日時 (省略可)、最終ターン数 (省略可)、
 * 1 ターンの長さ (秒、省略可。tmp/16-season.md「ターンの長さも DB に持つ」節) を受け取る。
 */
export interface AdminInitForm {
  startAt?: number;
  finalTurn?: number | null;
  unitTimeSec?: number;
}

export function parseAdminInitForm(body: Record<string, string>, timezone: string): AdminInitForm {
  const startAtRaw = field(body, "start-at");
  const finalTurnRaw = field(body, "final-turn");
  const unitTimeSecRaw = field(body, "unit-time");
  const form: AdminInitForm = {};

  if (startAtRaw !== "") {
    try {
      form.startAt = parseLocalDateTime(startAtRaw, timezone);
    } catch {
      throw new AppError("invalid_input", "start-at must be a valid datetime-local value");
    }
  }
  if (finalTurnRaw !== "") {
    if (!/^\d+$/.test(finalTurnRaw) || Number(finalTurnRaw) <= 0) {
      throw new AppError("invalid_input", "final-turn must be a positive integer");
    }
    form.finalTurn = Number(finalTurnRaw);
  }
  if (unitTimeSecRaw !== "") {
    if (!/^\d+$/.test(unitTimeSecRaw) || Number(unitTimeSecRaw) <= 0) {
      throw new AppError("invalid_input", "unit-time must be a positive integer");
    }
    form.unitTimeSec = Number(unitTimeSecRaw);
  }
  return form;
}

/** 「ゲーム設定」の最終ターン数変更フォーム。空欄なら無期限 (null)。 */
export function parseFinalTurnForm(body: Record<string, string>): number | null {
  const raw = field(body, "final-turn");
  if (raw === "") {
    return null;
  }
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
    throw new AppError("invalid_input", "final-turn must be a positive integer");
  }
  return Number(raw);
}

/**
 * 「ゲーム設定」の 1 ターンの長さ (秒) 変更フォーム。tmp/16-season.md「ターンの長さも DB に
 * 持つ (追加要件)」節。空欄・0 以下は invalid_input。
 */
export function parseUnitTimeForm(body: Record<string, string>): number {
  const raw = field(body, "unit-time");
  if (raw === "" || !/^\d+$/.test(raw) || Number(raw) <= 0) {
    throw new AppError("invalid_input", "unit-time must be a positive integer");
  }
  return Number(raw);
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
