// 各ルートで共通に使う小さなヘルパ。
import type { GameService } from "../../app/game-service.ts";
import type { IslandSelectVM } from "../../app/view-models.ts";

/**
 * 「目標の島」「自分の島」等のセレクト用一覧。
 * GameService に専用メソッドがないため、getTopPage().islands (id/name のみ使用) から作る。
 */
export function listIslandSelectOptions(gameService: GameService): IslandSelectVM[] {
  return gameService
    .getTopPage(undefined)
    .islands.map((island) => ({ id: island.id, name: island.name }));
}
