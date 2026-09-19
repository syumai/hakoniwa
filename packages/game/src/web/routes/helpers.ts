// 各ルートで共通に使う小さなヘルパ。
import { AppError } from "../../app/errors.ts";
import type { GameService } from "../../app/game-service.ts";
import type { IslandSelectVM } from "../../app/view-models.ts";

/**
 * 現在のゲーム ID を解決する。tmp/18-games.md「web 層」節 (第 1 段階): URL にゲーム ID を
 * 含めるのは第 2 段階の担当なので、既存ルートは常に現在のゲームを対象にする。
 * ゲームが無ければ従来どおり `not_initialized` (503) にする。
 */
export function requireCurrentGameId(gameService: GameService): number {
  const gameId = gameService.getCurrentGameId();
  if (gameId === undefined) {
    throw new AppError("not_initialized");
  }
  return gameId;
}

/**
 * 「目標の島」「自分の島」等のセレクト用一覧。
 * GameService に専用メソッドがないため、getTopPage().islands (id/name のみ使用) から作る。
 */
export function listIslandSelectOptions(gameService: GameService): IslandSelectVM[] {
  const gameId = requireCurrentGameId(gameService);
  return gameService
    .getTopPage(undefined, gameId)
    .islands.map((island) => ({ id: island.id, name: island.name }));
}
