// Perl 版 Turn.pm の doEachHex / countGrow (成長および単ヘックス災害) の移植。Turn.pm 1669〜1953 行相当。
import { LandKind, monsters } from "../constants.ts";
import { countAround, inBounds, neighbor } from "../geometry.ts";
import type { Point } from "../geometry.ts";
import { point } from "../log/markup.ts";
import * as messages from "../log/messages.ts";
import { isHardened, landName, monsterSpec } from "../terrain.ts";
import type { Island, Terrain } from "../types.ts";
import { getState } from "./context.ts";
import type { TurnContext } from "./context.ts";
import { wideDamage } from "./wide-damage.ts";

/**
 * p の周囲 (1ヘックス圏、i=1..6) に町または農場 (value !== 1) があるか。Perl 版 countGrow。
 * 平地→町の成長条件に使う。
 */
export function countGrow(terrain: Terrain, p: Point): boolean {
  for (let i = 1; i < 7; i++) {
    const s = neighbor(p, i);
    if (!inBounds(s, terrain.size)) {
      continue;
    }
    const hex = terrain.get(s.x, s.y);
    if ((hex.kind === LandKind.Town || hex.kind === LandKind.Farm) && hex.value !== 1) {
      return true;
    }
  }
  return false;
}

/**
 * 島の全ヘックスに対する成長・単ヘックス災害を処理する。
 * B15 (維持): 怪獣移動フラグは通常怪獣 2、足の速い怪獣は +1 (2歩)、とても速い怪獣はフラグなし (無制限)。
 * 火災判定は怪獣移動などによる地形変化の前に取得した landKind/lv を使う (Perl と同じ順序)。
 */
export function doEachHex(ctx: TurnContext, island: Island): void {
  const terrain = island.terrain;
  const size = terrain.size;
  // 怪獣の移動済みフラグ (このターンの doEachHex 呼び出し内でのみ有効)。
  const monsterMove = new Int8Array(size * size);

  // 増える人口のタネ値
  let addpop = 10; // 村、町
  let addpop2 = 0; // 都市
  if (island.food < 0) {
    // 食料不足
    addpop = -30;
  } else if (getState(ctx, island.id).propaganda) {
    // 誘致活動中
    addpop = 30;
    addpop2 = 3;
  }

  for (const p of ctx.points) {
    const { x, y } = p;
    const hex0 = terrain.get(x, y);
    const landKind0 = hex0.kind;
    const lv0 = hex0.value;

    if (landKind0 === LandKind.Town) {
      // 町系
      let lv = lv0;
      if (addpop < 0) {
        // 不足
        lv -= ctx.rng.int(-addpop) + 1;
        if (lv <= 0) {
          // 平地に戻す
          terrain.setKind(x, y, LandKind.Plains, 0);
          continue;
        }
      } else {
        // 成長
        if (lv < 100) {
          lv += ctx.rng.int(addpop) + 1;
          if (lv > 100) {
            lv = 100;
          }
        } else if (addpop2 > 0) {
          // 都市になると成長遅い
          lv += ctx.rng.int(addpop2) + 1;
        }
      }
      if (lv > 200) {
        lv = 200;
      }
      terrain.set(x, y, { kind: LandKind.Town, value: lv });
    } else if (landKind0 === LandKind.Plains) {
      // 平地
      if (ctx.rng.int(5) === 0) {
        // 周りに農場、町があれば、ここも町になる
        if (countGrow(terrain, p)) {
          terrain.setKind(x, y, LandKind.Town, 1);
        }
      }
    } else if (landKind0 === LandKind.Forest) {
      // 森
      if (lv0 < 200) {
        // 木を増やす
        terrain.set(x, y, { kind: LandKind.Forest, value: lv0 + 1 });
      }
    } else if (landKind0 === LandKind.Defence) {
      if (lv0 === 1) {
        // 防衛施設自爆
        const lName = landName(hex0);
        messages.logBombFire(ctx.log, island.id, island.name, lName, point(x, y));
        wideDamage(ctx, island, x, y);
      }
    } else if (landKind0 === LandKind.Oil) {
      // 海底油田
      const lName = landName(hex0);
      const value = ctx.config.oil.money;
      island.money += value;
      const str = `${value}${ctx.config.units.money}`;
      messages.logOilMoney(ctx.log, island.id, island.name, lName, point(x, y), str);

      // 枯渇判定
      if (ctx.rng.int(1000) < ctx.config.oil.ratio) {
        // 枯渇
        messages.logOilEnd(ctx.log, island.id, island.name, lName, point(x, y));
        terrain.setKind(x, y, LandKind.Sea, 0);
      }
    } else if (landKind0 === LandKind.Monster) {
      // 怪獣
      const idx = y * size + x;
      if (monsterMove[idx] === 2) {
        // すでに動いた後
        continue;
      }

      const { kind: mKind, name: mName } = monsterSpec(lv0);
      if (isHardened(mKind, ctx.turn)) {
        // 硬化中
        continue;
      }

      // 動く方向を決定 (3回試行)
      let moved: Point | undefined;
      for (let i = 0; i < 3; i++) {
        const d = ctx.rng.int(6) + 1;
        const s = neighbor(p, d);
        if (!inBounds(s, size)) {
          continue;
        }
        const sHex = terrain.get(s.x, s.y);
        if (
          sHex.kind !== LandKind.Sea &&
          sHex.kind !== LandKind.Sbase &&
          sHex.kind !== LandKind.Oil &&
          sHex.kind !== LandKind.Mountain &&
          sHex.kind !== LandKind.Monument &&
          sHex.kind !== LandKind.Monster
        ) {
          moved = s;
          break;
        }
      }

      if (moved === undefined) {
        // 動かなかった
        continue;
      }

      const { x: sx, y: sy } = moved;
      const destHexBefore = terrain.get(sx, sy);
      const lName = landName(destHexBefore);
      const pointStr = point(sx, sy);

      // 移動
      terrain.set(sx, sy, { kind: LandKind.Monster, value: lv0 });
      // もと居た位置を荒地に
      terrain.setKind(x, y, LandKind.Waste, 0);

      // 移動済みフラグ (B15: 維持)
      const special = monsters[mKind]?.special ?? 0;
      if (special === 2) {
        // 移動済みフラグは立てない (無制限)
      } else if (special === 1) {
        // 速い怪獣
        monsterMove[sy * size + sx] = monsterMove[idx]! + 1;
      } else {
        // 普通の怪獣
        monsterMove[sy * size + sx] = 2;
      }

      if (destHexBefore.kind === LandKind.Defence && ctx.config.dBaseAuto) {
        // 防衛施設を踏んだ
        messages.logMonsMoveDefence(ctx.log, island.id, island.name, lName, pointStr, mName);
        wideDamage(ctx, island, sx, sy);
      } else {
        // 行き先が荒地になる
        messages.logMonsMove(ctx.log, island.id, island.name, lName, pointStr, mName);
      }
    }

    // 火災判定 (発生条件は怪獣移動などの前に取得した landKind0/lv0 を使う。B15 と同種の Perl の癖)
    if (
      (landKind0 === LandKind.Town && lv0 > 30) ||
      landKind0 === LandKind.Haribote ||
      landKind0 === LandKind.Factory
    ) {
      if (ctx.rng.int(1000) < ctx.config.disaster.fire) {
        // 周囲の森と記念碑を数える
        if (
          countAround(terrain, p, LandKind.Forest, 7) +
            countAround(terrain, p, LandKind.Monument, 7) ===
          0
        ) {
          // 無かった場合、火災で壊滅。ログの地形名は Perl と同じく「現在の」地形を読み直す
          // (Town は同じイテレーション内の成長処理で value が変わっている場合があるため)。
          const currentHex = terrain.get(x, y);
          const lName = landName(currentHex);
          messages.logFire(ctx.log, island.id, island.name, lName, point(x, y));
          terrain.setKind(x, y, LandKind.Waste, 0);
        }
      }
    }
  }
}
