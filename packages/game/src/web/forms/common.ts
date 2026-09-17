// tmp/06-web-routes-and-views.md 「フォームのパースと検証」節の共通ヘルパ。
// 外部ライブラリを使わず、各ルート用の小さなパーサをここに集約する。
import type { Context } from "hono";
import { AppError } from "../../app/errors.ts";

/** `c.req.parseBody()` の結果 (string | File) から文字列だけを取り出す。File は空文字扱い。 */
export async function parseStringBody(c: Context): Promise<Record<string, string>> {
  const raw = await c.req.parseBody();
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}

/** フォームの文字列フィールドを取り出す (未指定なら空文字)。 */
export function field(body: Record<string, string>, name: string): string {
  return body[name] ?? "";
}

/**
 * `/^\d+$/` に厳密一致する非負整数のみ受け付ける。
 * 不一致・範囲外なら `AppError('invalid_input')` を throw する。
 */
export function parseStrictNonNegativeInt(
  body: Record<string, string>,
  name: string,
  opts: { min?: number; max?: number } = {},
): number {
  const raw = body[name];
  if (raw === undefined || !/^\d+$/.test(raw)) {
    throw new AppError("invalid_input", `${name} must be a non-negative integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new AppError("invalid_input", `${name} out of range`);
  }
  if (opts.min !== undefined && value < opts.min) {
    throw new AppError("invalid_input", `${name} out of range`);
  }
  if (opts.max !== undefined && value > opts.max) {
    throw new AppError("invalid_input", `${name} out of range`);
  }
  return value;
}

/** `:id{[0-9]+}` ルートパラメータを数値に変換する。ルート側で数字のみに絞っているので変換のみ。 */
export function parseIdParam(c: Context): number {
  const raw = c.req.param("id");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AppError("invalid_input", "id must be a non-negative integer");
  }
  return value;
}
