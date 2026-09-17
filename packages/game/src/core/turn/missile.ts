// Perl 版 Turn.pm doCommand のミサイル 4 種 (通常/PP/ST/陸地破壊弾) の移植。
// Phase 2b で実装する。基地探索・着弾・防衛判定・経験値・難民・平和賞など、
// Turn.pm 1009〜1579 行相当の処理はここに置く。
import type { Command, Island, World } from "../types.ts";
import type { CommandOutcome } from "./command.ts";
import type { TurnContext } from "./context.ts";

/**
 * ミサイル発射コマンドの処理。Phase 2a では未実装。
 * シグネチャは doCommand からの委譲呼び出しに合わせてある
 * (Phase 2b で実装する際もこの形を維持する想定)。
 */
export function doMissile(
  _ctx: TurnContext,
  _world: World,
  _island: Island,
  _command: Command,
): CommandOutcome {
  throw new Error("not implemented: Phase 2b");
}
