// Perl 版 Turn.pm の wideDamage (広域被害: ミサイル/隕石/巨大ミサイル等が及ぼす周辺被害) の移植。
import { LandKind } from "../constants.ts";
import { inBounds, neighbor } from "../geometry.ts";
import { point } from "../log/markup.ts";
import * as messages from "../log/messages.ts";
import { landName } from "../terrain.ts";
import type { Island } from "../types.ts";
import type { TurnContext } from "./context.ts";

/**
 * (x, y) を中心とした 2 ヘックス圏 (19 マス) に広域被害を与える。
 * B4: Perl は範囲外判定の前に地形を読んでいた (負の添字アクセス) が、TS では先に `inBounds` を
 * 評価してから地形を読む。
 *
 * - 中心 + 1 ヘックス圏 (i < 7): 海はそのまま (浅瀬なら深海化)、海底基地/油田は跡形もなく消滅、
 *   それ以外 (山も含む) は海/浅瀬になる (怪獣がいた場合は専用ログ)。
 * - 2 ヘックス圏 (i >= 7): 海/油田/荒地/山/海底基地は無視、それ以外は荒地になる
 *   (怪獣がいた場合は専用ログ)。
 */
export function wideDamage(ctx: TurnContext, island: Island, x: number, y: number): void {
  const terrain = island.terrain;

  for (let i = 0; i < 19; i++) {
    const s = neighbor({ x, y }, i);
    if (!inBounds(s, terrain.size)) {
      continue;
    }

    const hex = terrain.get(s.x, s.y);
    const lName = landName(hex);
    const p = point(s.x, s.y);

    if (i < 7) {
      // 中心、および1ヘックス
      if (hex.kind === LandKind.Sea) {
        terrain.set(s.x, s.y, { kind: LandKind.Sea, value: 0 });
        continue;
      }
      if (hex.kind === LandKind.Sbase || hex.kind === LandKind.Oil) {
        messages.logWideDamageSea2(ctx.log, island.id, island.name, lName, p);
        terrain.setKind(s.x, s.y, LandKind.Sea, 0);
        continue;
      }
      if (hex.kind === LandKind.Monster) {
        messages.logWideDamageMonsterSea(ctx.log, island.id, island.name, lName, p);
      } else {
        messages.logWideDamageSea(ctx.log, island.id, island.name, lName, p);
      }
      // i === 0 (中心) は海、それ以外 (1ヘックス圏) は浅瀬。
      terrain.setKind(s.x, s.y, LandKind.Sea, i === 0 ? 0 : 1);
    } else {
      // 2ヘックス
      if (
        hex.kind === LandKind.Sea ||
        hex.kind === LandKind.Oil ||
        hex.kind === LandKind.Waste ||
        hex.kind === LandKind.Mountain ||
        hex.kind === LandKind.Sbase
      ) {
        continue;
      }
      if (hex.kind === LandKind.Monster) {
        messages.logWideDamageMonster(ctx.log, island.id, island.name, lName, p);
      } else {
        messages.logWideDamageWaste(ctx.log, island.id, island.name, lName, p);
      }
      terrain.setKind(s.x, s.y, LandKind.Waste, 0);
    }
  }
}
