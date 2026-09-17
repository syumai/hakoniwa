// Perl 版 Turn.pm doCommand のミサイル 4 種 (通常/PP/ST/陸地破壊弾) の移植。
// Turn.pm 1009〜1579 行相当。基地探索・着弾・防衛判定・経験値・難民・平和賞を扱う。
import {
  CommandKind,
  commandSpecs,
  LandKind,
  monsters,
  PrizeFlag,
  prizeNames,
} from "../constants.ts";
import { countAround, inBounds, neighbor } from "../geometry.ts";
import { point } from "../log/markup.ts";
import * as messages from "../log/messages.ts";
import { hasFlag, withFlag, withMonster } from "../prize.ts";
import { expToLevel, isHardened, landName, monsterSpec } from "../terrain.ts";
import type { Command, Island, World } from "../types.ts";
import type { CommandOutcome } from "./command.ts";
import { findIsland } from "./context.ts";
import type { TurnContext } from "./context.ts";

/**
 * ミサイル発射コマンドの処理 (通常/PP/ST/陸地破壊弾)。
 *
 * B1 (修正): 防衛施設判定キャッシュ (`ctx.defenceCache`) は標的島 ID をキーにする
 * (Perl は攻撃側 ID をキーにしていたが、内容は標的島の地形なので混ざるバグがあった)。
 * B9 (維持): 基地内ループの資金判定は `money > cost` (外側ループは `money >= cost`)。
 * B18 (維持): 難民 (boat) は通常ミサイルで町に命中した人口の半分が攻撃側に漂着する。
 * ステルスや自島攻撃では発生しない。
 */
export function doMissile(
  ctx: TurnContext,
  world: World,
  island: Island,
  command: Command,
): CommandOutcome {
  const { kind, target, x, y } = command;
  let arg = command.arg;
  const spec = commandSpecs[kind];
  const cost = spec.cost;
  const comName = spec.name;

  const targetIsland = findIsland(world, target);
  if (targetIsland === undefined) {
    // ターゲットがすでにない
    messages.logMsNoTarget(ctx.log, island.id, island.name, comName);
    return "continue";
  }

  if (arg === 0) {
    // 0の場合は撃てるだけ
    arg = 10000;
  }

  const terrain = island.terrain; // 発射元 (基地探索・難民受け入れ先)
  const tLand = targetIsland.terrain; // 着弾先
  const err = kind === CommandKind.MissilePP ? 7 : 19;
  const p = point(x, y);

  // 防衛施設判定キャッシュ (標的島 ID キー)。
  let cache = ctx.defenceCache.get(targetIsland.id);
  if (cache === undefined) {
    cache = new Int8Array(tLand.size * tLand.size);
    ctx.defenceCache.set(targetIsland.id, cache);
  }

  let boat = 0; // 難民の数
  let flag = false; // 基地が最低ひとつ見つかったか
  let count = 0;

  outer: while (arg > 0 && island.money >= cost) {
    // 基地を見つけるまでループ
    while (count < ctx.points.length) {
      const bp = ctx.points[count]!;
      const bHex = terrain.get(bp.x, bp.y);
      if (bHex.kind === LandKind.Base || bHex.kind === LandKind.Sbase) {
        break;
      }
      count++;
    }
    if (count >= ctx.points.length) {
      // 見つからなかったらそこまで
      break outer;
    }

    // 最低一つ基地があったので、flag を立てる
    flag = true;
    const bx = ctx.points[count]!.x;
    const by = ctx.points[count]!.y;
    const baseHexInit = terrain.get(bx, by);
    let level = expToLevel(baseHexInit.kind, baseHexInit.value, ctx.config);

    // 基地内でループ (B9: 内側は money > cost の厳密比較を維持)
    while (level > 0 && arg > 0 && island.money > cost) {
      level--;
      arg--;
      island.money -= cost;

      // 着弾点算出
      const r = ctx.rng.int(err);
      const t = neighbor({ x, y }, r);

      if (!inBounds(t, tLand.size)) {
        // 範囲外
        if (kind === CommandKind.MissileST) {
          messages.logMsOutS(
            ctx.log,
            island.id,
            target,
            island.name,
            targetIsland.name,
            comName,
            p,
          );
        } else {
          messages.logMsOut(ctx.log, island.id, target, island.name, targetIsland.name, comName, p);
        }
        continue;
      }

      const { x: tx, y: ty } = t;
      const tHex = tLand.get(tx, ty);
      const tL = tHex.kind;
      const tLv = tHex.value;
      const tPoint = point(tx, ty);

      // 防衛施設判定
      const idx = ty * tLand.size + tx;
      let defence: boolean;
      const cached = cache[idx];
      if (cached === 1) {
        defence = true;
      } else if (cached === -1) {
        defence = false;
      } else if (tL === LandKind.Defence) {
        // 防衛施設に直撃。周囲19ヘックスのキャッシュをクリアする。
        for (let i = 0; i < 19; i++) {
          const s = neighbor({ x: tx, y: ty }, i);
          if (inBounds(s, tLand.size)) {
            cache[s.y * tLand.size + s.x] = 0;
          }
        }
        defence = false;
      } else if (countAround(tLand, { x: tx, y: ty }, LandKind.Defence, 19) > 0) {
        cache[idx] = 1;
        defence = true;
      } else {
        cache[idx] = -1;
        defence = false;
      }

      if (defence) {
        // 空中爆破
        if (kind === CommandKind.MissileST) {
          messages.logMsCaughtS(
            ctx.log,
            island.id,
            target,
            island.name,
            targetIsland.name,
            comName,
            p,
            tPoint,
          );
        } else {
          messages.logMsCaught(
            ctx.log,
            island.id,
            target,
            island.name,
            targetIsland.name,
            comName,
            p,
            tPoint,
          );
        }
        continue;
      }

      // 「効果なし」hex を最初に判定 (深い海。または陸破弾以外での海/海底基地/山)
      const isDeepSea = tL === LandKind.Sea && tLv === 0;
      const isSeaLikeNonLD =
        (tL === LandKind.Sea || tL === LandKind.Sbase || tL === LandKind.Mountain) &&
        kind !== CommandKind.MissileLD;
      if (isDeepSea || isSeaLikeNonLD) {
        // 海底基地の場合、海のフリ
        const effKind = tL === LandKind.Sbase ? LandKind.Sea : tL;
        const effLname = landName({ kind: effKind, value: tLv });
        if (kind === CommandKind.MissileST) {
          messages.logMsNoDamageS(
            ctx.log,
            island.id,
            target,
            island.name,
            targetIsland.name,
            comName,
            effLname,
            p,
            tPoint,
          );
        } else {
          messages.logMsNoDamage(
            ctx.log,
            island.id,
            target,
            island.name,
            targetIsland.name,
            comName,
            effLname,
            p,
            tPoint,
          );
        }
        continue;
      }

      const tLname = landName(tHex);

      if (kind === CommandKind.MissileLD) {
        // 陸地破壊弾
        if (tL === LandKind.Mountain) {
          // 山 (荒地になる)
          messages.logMsLDMountain(
            ctx.log,
            island.id,
            target,
            island.name,
            targetIsland.name,
            comName,
            tLname,
            p,
            tPoint,
          );
          tLand.setKind(tx, ty, LandKind.Waste, 0);
          continue;
        } else if (tL === LandKind.Sbase) {
          messages.logMsLDSbase(
            ctx.log,
            island.id,
            target,
            island.name,
            targetIsland.name,
            comName,
            tLname,
            p,
            tPoint,
          );
        } else if (tL === LandKind.Monster) {
          messages.logMsLDMonster(
            ctx.log,
            island.id,
            target,
            island.name,
            targetIsland.name,
            comName,
            tLname,
            p,
            tPoint,
          );
        } else if (tL === LandKind.Sea) {
          messages.logMsLDSea1(
            ctx.log,
            island.id,
            target,
            island.name,
            targetIsland.name,
            comName,
            tLname,
            p,
            tPoint,
          );
        } else {
          messages.logMsLDLand(
            ctx.log,
            island.id,
            target,
            island.name,
            targetIsland.name,
            comName,
            tLname,
            p,
            tPoint,
          );
        }

        // 経験値 (町のみ。発射元の基地がまだ基地/海底基地のときだけ)
        if (tL === LandKind.Town) {
          const baseHex = terrain.get(bx, by);
          if (baseHex.kind === LandKind.Base || baseHex.kind === LandKind.Sbase) {
            let exp = baseHex.value + Math.trunc(tLv / 20);
            if (exp > ctx.config.maxExpPoint) {
              exp = ctx.config.maxExpPoint;
            }
            terrain.set(bx, by, { kind: baseHex.kind, value: exp });
          }
        }

        // 浅瀬になる。でも油田/浅瀬/海底基地だったら海
        targetIsland.area--;
        const ldValue = tL === LandKind.Oil || tL === LandKind.Sea || tL === LandKind.Sbase ? 0 : 1;
        tLand.setKind(tx, ty, LandKind.Sea, ldValue);
      } else {
        // その他ミサイル (通常/PP/ST)
        if (tL === LandKind.Waste) {
          // 荒地 (被害なし)
          if (kind === CommandKind.MissileST) {
            messages.logMsWasteS(
              ctx.log,
              island.id,
              target,
              island.name,
              targetIsland.name,
              comName,
              tLname,
              p,
              tPoint,
            );
          } else {
            messages.logMsWaste(
              ctx.log,
              island.id,
              target,
              island.name,
              targetIsland.name,
              comName,
              tLname,
              p,
              tPoint,
            );
          }
        } else if (tL === LandKind.Monster) {
          const { kind: mKind, name: mName } = monsterSpec(tLv);
          const mHp = tLv - mKind * 10;

          if (isHardened(mKind, ctx.turn)) {
            // 硬化中
            if (kind === CommandKind.MissileST) {
              messages.logMsMonNoDamageS(
                ctx.log,
                island.id,
                target,
                island.name,
                targetIsland.name,
                comName,
                mName,
                p,
                tPoint,
              );
            } else {
              messages.logMsMonNoDamage(
                ctx.log,
                island.id,
                target,
                island.name,
                targetIsland.name,
                comName,
                mName,
                p,
                tPoint,
              );
            }
            continue;
          }

          if (mHp === 1) {
            // 怪獣しとめた (Perl と同じくこの後「荒地になる」までフォールスルーする)
            const baseHex = terrain.get(bx, by);
            if (baseHex.kind === LandKind.Base || baseHex.kind === LandKind.Sbase) {
              let exp = baseHex.value + (monsters[mKind]?.exp ?? 0);
              if (exp > ctx.config.maxExpPoint) {
                exp = ctx.config.maxExpPoint;
              }
              terrain.set(bx, by, { kind: baseHex.kind, value: exp });
            }

            if (kind === CommandKind.MissileST) {
              messages.logMsMonKillS(
                ctx.log,
                island.id,
                target,
                island.name,
                targetIsland.name,
                comName,
                mName,
                p,
                tPoint,
              );
            } else {
              messages.logMsMonKill(
                ctx.log,
                island.id,
                target,
                island.name,
                targetIsland.name,
                comName,
                mName,
                p,
                tPoint,
              );
            }

            // 残骸収入
            const value = monsters[mKind]?.value ?? 0;
            if (value > 0) {
              targetIsland.money += value;
              messages.logMsMonMoney(ctx.log, target, mName, value, ctx.config);
            }

            // 賞関係
            targetIsland.prize = withMonster(targetIsland.prize, mKind);
          } else {
            // 怪獣生きてる
            if (kind === CommandKind.MissileST) {
              messages.logMsMonsterS(
                ctx.log,
                island.id,
                target,
                island.name,
                targetIsland.name,
                comName,
                mName,
                p,
                tPoint,
              );
            } else {
              messages.logMsMonster(
                ctx.log,
                island.id,
                target,
                island.name,
                targetIsland.name,
                comName,
                mName,
                p,
                tPoint,
              );
            }
            tLand.set(tx, ty, { kind: LandKind.Monster, value: tLv - 1 });
            continue;
          }
        } else {
          // 通常地形
          if (kind === CommandKind.MissileST) {
            messages.logMsNormalS(
              ctx.log,
              island.id,
              target,
              island.name,
              targetIsland.name,
              comName,
              tLname,
              p,
              tPoint,
            );
          } else {
            messages.logMsNormal(
              ctx.log,
              island.id,
              target,
              island.name,
              targetIsland.name,
              comName,
              tLname,
              p,
              tPoint,
            );
          }
        }

        // 経験値 (町のみ。発射元の基地がまだ基地/海底基地のときだけ)。通常ミサイルなので難民にプラス。
        if (tL === LandKind.Town) {
          const baseHex = terrain.get(bx, by);
          if (baseHex.kind === LandKind.Base || baseHex.kind === LandKind.Sbase) {
            let exp = baseHex.value + Math.trunc(tLv / 20);
            boat += tLv;
            if (exp > ctx.config.maxExpPoint) {
              exp = ctx.config.maxExpPoint;
            }
            terrain.set(bx, by, { kind: baseHex.kind, value: exp });
          }
        }

        // 荒地になる (着弾点)。でも油田だったら海
        tLand.setKind(tx, ty, LandKind.Waste, 1);
        if (tL === LandKind.Oil) {
          tLand.setKind(tx, ty, LandKind.Sea, 0);
        }
      }
    }

    count++;
  }

  if (!flag) {
    // 基地が一つも無かった場合
    messages.logMsNoBase(ctx.log, island.id, island.name, comName);
    return "continue";
  }

  // 難民判定 (B18: 維持。ステルスや自島攻撃では発生しない)
  boat = Math.trunc(boat / 2);
  if (boat > 0 && island.id !== target && kind !== CommandKind.MissileST) {
    let achive = 0;
    for (let i = 0; i < ctx.points.length && boat > 0; i++) {
      const bp = ctx.points[i]!;
      const bHex = terrain.get(bp.x, bp.y);
      if (bHex.kind === LandKind.Town) {
        // 町の場合
        let lv = bHex.value;
        if (boat > 50) {
          lv += 50;
          boat -= 50;
          achive += 50;
        } else {
          lv += boat;
          achive += boat;
          boat = 0;
        }
        if (lv > 200) {
          boat += lv - 200;
          achive -= lv - 200;
          lv = 200;
        }
        terrain.set(bp.x, bp.y, { kind: LandKind.Town, value: lv });
      } else if (bHex.kind === LandKind.Plains) {
        // 平地の場合
        if (boat > 10) {
          terrain.setKind(bp.x, bp.y, LandKind.Town, 5);
          boat -= 10;
          achive += 10;
        } else if (boat > 5) {
          terrain.setKind(bp.x, bp.y, LandKind.Town, boat - 5);
          achive += boat;
          boat = 0;
        } else {
          // Perl の癖 (維持): boat が 1〜5 でも平地は町になるが、人口 (value) は変わらない。
          terrain.setKind(bp.x, bp.y, LandKind.Town, bHex.value);
        }
      }
      if (boat <= 0) {
        break;
      }
    }

    if (achive > 0) {
      // 少しでも到着した場合、ログを吐く
      messages.logMsBoatPeople(ctx.log, island.id, island.name, achive, ctx.config);

      // 難民の数が一定数以上なら、平和賞の可能性あり (elsif 連鎖のまま維持)
      if (achive >= 200) {
        if (!hasFlag(island.prize, PrizeFlag.Peace1)) {
          island.prize = withFlag(island.prize, PrizeFlag.Peace1);
          messages.logPrize(ctx.log, island.id, island.name, prizeNames[4] ?? "");
        } else if (!hasFlag(island.prize, PrizeFlag.Peace2) && achive > 500) {
          island.prize = withFlag(island.prize, PrizeFlag.Peace2);
          messages.logPrize(ctx.log, island.id, island.name, prizeNames[5] ?? "");
        } else if (!hasFlag(island.prize, PrizeFlag.Peace3) && achive > 800) {
          island.prize = withFlag(island.prize, PrizeFlag.Peace3);
          messages.logPrize(ctx.log, island.id, island.name, prizeNames[6] ?? "");
        }
      }
    }
  }

  return "consumed";
}
