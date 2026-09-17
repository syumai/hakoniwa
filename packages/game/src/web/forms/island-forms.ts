// tmp/06-web-routes-and-views.md 「フォームのパースと検証」節。
// 各 POST ルートのフォームパース。文字列の切り詰め・禁止文字除去は app/sanitize.ts
// (GameService 内部) に任せ、ここでは数値の厳密パースのみ行う。
import type { CommandInput } from "../../app/game-service.ts";
import { AppError } from "../../app/errors.ts";
import { field, parseStrictNonNegativeInt } from "./common.ts";

export interface NewIslandForm {
  name: string;
  password: string;
  passwordConfirm: string;
}

export function parseNewIslandForm(body: Record<string, string>): NewIslandForm {
  return {
    name: field(body, "name"),
    password: field(body, "password"),
    passwordConfirm: field(body, "passwordConfirm"),
  };
}

export interface OwnerForm {
  password: string;
}

export function parseOwnerForm(body: Record<string, string>): OwnerForm {
  return { password: field(body, "password") };
}

/** トップページの「自分の島へ」フォーム用 (islandId を body で受け取る)。 */
export interface OwnerFormWithId extends OwnerForm {
  islandId: number;
}

export function parseOwnerFormWithId(body: Record<string, string>): OwnerFormWithId {
  return {
    islandId: parseStrictNonNegativeInt(body, "islandId"),
    ...parseOwnerForm(body),
  };
}

export interface CommentForm {
  password: string;
  message: string;
}

export function parseCommentForm(body: Record<string, string>): CommentForm {
  return { password: field(body, "password"), message: field(body, "message") };
}

function parseCommandMode(body: Record<string, string>): CommandInput["mode"] {
  const mode = field(body, "mode");
  if (mode === "insert" || mode === "write" || mode === "delete") {
    return mode;
  }
  throw new AppError("invalid_input", "mode must be insert, write or delete");
}

export interface CommandForm {
  password: string;
  input: CommandInput;
}

/** commandMax/islandSize 等の範囲チェックは GameService 側で行うため、ここでは形式のみ検証する。 */
export function parseCommandForm(body: Record<string, string>): CommandForm {
  return {
    password: field(body, "password"),
    input: {
      number: parseStrictNonNegativeInt(body, "number"),
      kind: parseStrictNonNegativeInt(body, "kind"),
      x: parseStrictNonNegativeInt(body, "x"),
      y: parseStrictNonNegativeInt(body, "y"),
      amount: parseStrictNonNegativeInt(body, "amount"),
      target: parseStrictNonNegativeInt(body, "target"),
      mode: parseCommandMode(body),
    },
  };
}

export interface SettingsForm {
  oldPassword: string;
  name: string;
  password: string;
  passwordConfirm: string;
}

export function parseSettingsForm(body: Record<string, string>): SettingsForm {
  return {
    oldPassword: field(body, "oldPassword"),
    name: field(body, "name"),
    password: field(body, "password"),
    passwordConfirm: field(body, "passwordConfirm"),
  };
}

/** トップページの「島の名前とパスワードの変更」フォーム用 (islandId を body で受け取る)。 */
export interface SettingsFormWithId extends SettingsForm {
  islandId: number;
}

export function parseSettingsFormWithId(body: Record<string, string>): SettingsFormWithId {
  return {
    islandId: parseStrictNonNegativeInt(body, "islandId"),
    ...parseSettingsForm(body),
  };
}

export interface LbbsVisitorForm {
  name: string;
  message: string;
}

export function parseLbbsVisitorForm(body: Record<string, string>): LbbsVisitorForm {
  return { name: field(body, "name"), message: field(body, "message") };
}

export interface LbbsOwnerForm {
  password: string;
  name: string;
  message: string;
}

export function parseLbbsOwnerForm(body: Record<string, string>): LbbsOwnerForm {
  return {
    password: field(body, "password"),
    name: field(body, "name"),
    message: field(body, "message"),
  };
}

export interface LbbsDeleteForm {
  password: string;
  number: number;
}

export function parseLbbsDeleteForm(body: Record<string, string>): LbbsDeleteForm {
  return {
    password: field(body, "password"),
    number: parseStrictNonNegativeInt(body, "number"),
  };
}
