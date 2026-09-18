// tmp/06-web-routes-and-views.md 「フォームのパースと検証」節、tmp/14-users-auth.md のルート表
// (パスワード関連フォームの撤去) の移植。数値の厳密パースのみ行い、文字列の切り詰め・禁止文字除去は
// app/sanitize.ts (GameService 内部) に任せる。
import type { CommandInput } from "../../app/game-service.ts";
import { AppError } from "../../app/errors.ts";
import { field, parseStrictNonNegativeInt } from "./common.ts";

export interface NewIslandForm {
  name: string;
}

export function parseNewIslandForm(body: Record<string, string>): NewIslandForm {
  return { name: field(body, "name") };
}

export interface CommentForm {
  message: string;
}

export function parseCommentForm(body: Record<string, string>): CommentForm {
  return { message: field(body, "message") };
}

export interface NameForm {
  name: string;
}

export function parseNameForm(body: Record<string, string>): NameForm {
  return { name: field(body, "name") };
}

function parseCommandMode(body: Record<string, string>): CommandInput["mode"] {
  const mode = field(body, "mode");
  if (mode === "insert" || mode === "write" || mode === "delete") {
    return mode;
  }
  throw new AppError("invalid_input", "mode must be insert, write or delete");
}

export interface CommandForm {
  input: CommandInput;
}

/** commandMax/islandSize 等の範囲チェックは GameService 側で行うため、ここでは形式のみ検証する。 */
export function parseCommandForm(body: Record<string, string>): CommandForm {
  return {
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

export interface LbbsMessageForm {
  message: string;
}

export function parseLbbsMessageForm(body: Record<string, string>): LbbsMessageForm {
  return { message: field(body, "message") };
}

export interface LbbsDeleteForm {
  number: number;
}

export function parseLbbsDeleteForm(body: Record<string, string>): LbbsDeleteForm {
  return { number: parseStrictNonNegativeInt(body, "number") };
}
