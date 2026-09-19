// 各ルートで共通に使う小さなヘルパ。
import type { Context } from "hono";
import { AppError } from "../../app/errors.ts";
import type { GameService } from "../../app/game-service.ts";
import type { IslandSelectVM } from "../../app/view-models.ts";
import type { AppEnv } from "../env.ts";

/**
 * 現在のゲーム ID を解決する。`/my-island`, `/islands/:id` 等の旧 URL のリダイレクト先や、
 * `/turn` (デバッグ) のように「常に現在のゲームを対象にする」ルートで使う。
 * ゲームが無ければ `not_initialized` (503) にする。
 */
export function requireCurrentGameId(gameService: GameService): number {
  const gameId = gameService.getCurrentGameId();
  if (gameId === undefined) {
    throw new AppError("not_initialized");
  }
  return gameId;
}

/**
 * `/games/:gameId{[0-9]+}` 配下のルートで、URL の gameId を数値として取り出す。
 * ルート側の `{[0-9]+}` 制約により常に数字のみだが、念のため検証する。
 */
export function requireGameIdParam(c: Context<AppEnv>): number {
  const raw = c.req.param("gameId");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AppError("invalid_input", "gameId must be a non-negative integer");
  }
  return value;
}

/**
 * 「目標の島」「自分の島」等のセレクト用一覧。
 * GameService に専用メソッドがないため、getTopPage().islands (id/name のみ使用) から作る。
 * tmp/19-abandon.md「対象外」節: 放棄島は目標の島セレクトから除外する。
 */
export function listIslandSelectOptions(
  gameService: GameService,
  gameId: number,
): IslandSelectVM[] {
  return gameService
    .getTopPage(undefined, gameId)
    .islands.filter((island) => !island.abandoned)
    .map((island) => ({ id: island.id, name: island.name }));
}
