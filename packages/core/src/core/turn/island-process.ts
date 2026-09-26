// Perl 版 Turn.pm の doIslandProcess (島全体処理: 地震〜換金・受賞) の移植。Turn.pm 1956〜2428 行相当。
import { LandKind, monsters, PrizeFlag, prizeNames } from "../constants.ts";
import { countAround, inBounds, neighbor } from "../geometry.ts";
import { estimate } from "../island.ts";
import { point } from "../log/markup.ts";
import * as messages from "../log/messages.ts";
import { hasFlag, withFlag } from "../prize.ts";
import { landName, monsterSpec } from "../terrain.ts";
import type { Island, World } from "../types.ts";
import { getState } from "./context.ts";
import type { TurnContext } from "./context.ts";
import { wideDamage } from "./wide-damage.ts";

/**
 * 島全体の処理 (地震、飢饉、津波、怪獣出現、地盤沈下、台風、巨大隕石、巨大ミサイル、隕石、噴火、
 * 換金、資金切り捨て、estimate、繁栄賞/災難賞)。Perl 版の処理順序をそのまま維持する。
 * `world` は現状使わないが、doCommand 等とシグネチャを揃えるために受け取る。
 */
export function doIslandProcess(ctx: TurnContext, _world: World, island: Island): void {
  const terrain = island.terrain;
  const size = terrain.size;
  const state = getState(ctx, island.id);

  // 地震判定 (地ならし回数 + 1 倍率)
  if (ctx.rng.int(1000) < (state.prepare2 + 1) * ctx.config.disaster.earthquake) {
    messages.logEarthquake(ctx.log, island.id, island.name);

    for (const p of ctx.points) {
      const hex = terrain.get(p.x, p.y);
      if (
        (hex.kind === LandKind.Town && hex.value >= 100) ||
        hex.kind === LandKind.Haribote ||
        hex.kind === LandKind.Factory
      ) {
        // 1/4で壊滅
        if (ctx.rng.int(4) === 0) {
          messages.logEQDamage(ctx.log, island.id, island.name, landName(hex), point(p.x, p.y));
          terrain.setKind(p.x, p.y, LandKind.Waste, 0);
        }
      }
    }
  }

  // 食料不足
  if (island.food <= 0) {
    messages.logStarve(ctx.log, island.id, island.name);
    island.food = 0;

    for (const p of ctx.points) {
      const hex = terrain.get(p.x, p.y);
      if (
        hex.kind === LandKind.Farm ||
        hex.kind === LandKind.Factory ||
        hex.kind === LandKind.Base ||
        hex.kind === LandKind.Defence
      ) {
        // 1/4で壊滅
        if (ctx.rng.int(4) === 0) {
          messages.logSvDamage(ctx.log, island.id, island.name, landName(hex), point(p.x, p.y));
          terrain.setKind(p.x, p.y, LandKind.Waste, 0);
        }
      }
    }
  }

  // 津波判定
  if (ctx.rng.int(1000) < ctx.config.disaster.tsunami) {
    messages.logTsunami(ctx.log, island.id, island.name);

    for (const p of ctx.points) {
      const hex = terrain.get(p.x, p.y);
      if (
        hex.kind === LandKind.Town ||
        hex.kind === LandKind.Farm ||
        hex.kind === LandKind.Factory ||
        hex.kind === LandKind.Base ||
        hex.kind === LandKind.Defence ||
        hex.kind === LandKind.Haribote
      ) {
        // 1d12 <= (周囲の海 - 1) で崩壊
        const threshold =
          countAround(terrain, p, LandKind.Oil, 7) +
          countAround(terrain, p, LandKind.Sbase, 7) +
          countAround(terrain, p, LandKind.Sea, 7) -
          1;
        if (ctx.rng.int(12) < threshold) {
          messages.logTsunamiDamage(
            ctx.log,
            island.id,
            island.name,
            landName(hex),
            point(p.x, p.y),
          );
          terrain.setKind(p.x, p.y, LandKind.Waste, 0);
        }
      }
    }
  }

  // 怪獣判定 (人造怪獣派遣優先。人口閾値による自然発生は do-while で monsterSend が尽きるまで)
  {
    const r = ctx.rng.int(10000);
    const pop = island.pop;
    do {
      if (
        (r < ctx.config.disaster.monster * island.area && pop >= ctx.config.disaster.monsBorder1) ||
        state.monsterSend > 0
      ) {
        let kind: number;
        if (state.monsterSend > 0) {
          // 人造
          kind = 0;
          state.monsterSend--;
        } else if (pop >= ctx.config.disaster.monsBorder3) {
          // level3まで
          kind = ctx.rng.int(ctx.config.monsterLevel[2]) + 1;
        } else if (pop >= ctx.config.disaster.monsBorder2) {
          // level2まで
          kind = ctx.rng.int(ctx.config.monsterLevel[1]) + 1;
        } else {
          // level1のみ
          kind = ctx.rng.int(ctx.config.monsterLevel[0]) + 1;
        }

        const spec = monsters[kind];
        const lv = kind * 10 + (spec?.baseHp ?? 0) + ctx.rng.int(spec?.hpRange ?? 0);

        // どこに現れるか決める (最初の町)
        for (const p of ctx.points) {
          const hex = terrain.get(p.x, p.y);
          if (hex.kind === LandKind.Town) {
            const lName = landName(hex);
            terrain.setKind(p.x, p.y, LandKind.Monster, lv);
            const { name: mName } = monsterSpec(lv);
            messages.logMonsCome(ctx.log, island.id, island.name, mName, point(p.x, p.y), lName);
            break;
          }
        }
      }
    } while (state.monsterSend > 0);
  }

  // 地盤沈下判定 (-1 マーク方式: Set で「沈む予定」を記録し、2パス目で浅瀬化/浅瀬→海)
  if (
    island.area > ctx.config.disaster.fallBorder &&
    ctx.rng.int(1000) < ctx.config.disaster.falldown
  ) {
    messages.logFalldown(ctx.log, island.id, island.name);

    const sinking = new Set<number>();
    for (const p of ctx.points) {
      const hex = terrain.get(p.x, p.y);
      if (
        hex.kind !== LandKind.Sea &&
        hex.kind !== LandKind.Sbase &&
        hex.kind !== LandKind.Oil &&
        hex.kind !== LandKind.Mountain
      ) {
        // 周囲に海があれば、沈む予定にマーク
        if (
          countAround(terrain, p, LandKind.Sea, 7) + countAround(terrain, p, LandKind.Sbase, 7) >
          0
        ) {
          messages.logFalldownLand(ctx.log, island.id, island.name, landName(hex), point(p.x, p.y));
          sinking.add(p.y * size + p.x);
        }
      }
    }

    for (const p of ctx.points) {
      const idx = p.y * size + p.x;
      if (sinking.has(idx)) {
        // 沈む予定だった所を浅瀬に
        terrain.setKind(p.x, p.y, LandKind.Sea, 1);
      } else if (terrain.get(p.x, p.y).kind === LandKind.Sea) {
        // 浅瀬は海に
        terrain.set(p.x, p.y, { kind: LandKind.Sea, value: 0 });
      }
    }
  }

  // 台風判定
  if (ctx.rng.int(1000) < ctx.config.disaster.typhoon) {
    messages.logTyphoon(ctx.log, island.id, island.name);

    for (const p of ctx.points) {
      const hex = terrain.get(p.x, p.y);
      if (hex.kind === LandKind.Farm || hex.kind === LandKind.Haribote) {
        // 1d12 <= (6 - 周囲の森) で崩壊
        const threshold =
          6 -
          countAround(terrain, p, LandKind.Forest, 7) -
          countAround(terrain, p, LandKind.Monument, 7);
        if (ctx.rng.int(12) < threshold) {
          messages.logTyphoonDamage(
            ctx.log,
            island.id,
            island.name,
            landName(hex),
            point(p.x, p.y),
          );
          terrain.setKind(p.x, p.y, LandKind.Plains, 0);
        }
      }
    }
  }

  // 巨大隕石判定
  if (ctx.rng.int(1000) < ctx.config.disaster.hugeMeteo) {
    const x = ctx.rng.int(size);
    const y = ctx.rng.int(size);
    messages.logHugeMeteo(ctx.log, island.id, island.name, point(x, y));
    wideDamage(ctx, island, x, y);
  }

  // 巨大ミサイル判定 (記念碑の再建造で予約された分)
  while (state.bigMissile > 0) {
    state.bigMissile--;
    const x = ctx.rng.int(size);
    const y = ctx.rng.int(size);
    messages.logMonDamage(ctx.log, island.id, island.name, point(x, y));
    wideDamage(ctx, island, x, y);
  }

  // 隕石判定
  if (ctx.rng.int(1000) < ctx.config.disaster.meteo) {
    let first = true;
    // Perl は || の左辺 (random(2)==0) を必ず評価するため、first のときも rng を1回消費する。
    while (ctx.rng.int(2) === 0 || first) {
      first = false;

      const x = ctx.rng.int(size);
      const y = ctx.rng.int(size);
      const hex = terrain.get(x, y);
      const p = point(x, y);

      if (hex.kind === LandKind.Sea && hex.value === 0) {
        // 海ポチャ
        messages.logMeteoSea(ctx.log, island.id, island.name, landName(hex), p);
      } else if (hex.kind === LandKind.Mountain) {
        // 山破壊
        messages.logMeteoMountain(ctx.log, island.id, island.name, landName(hex), p);
        terrain.setKind(x, y, LandKind.Waste, 0);
        continue;
      } else if (hex.kind === LandKind.Sbase) {
        messages.logMeteoSbase(ctx.log, island.id, island.name, landName(hex), p);
      } else if (hex.kind === LandKind.Monster) {
        messages.logMeteoMonster(ctx.log, island.id, island.name, landName(hex), p);
      } else if (hex.kind === LandKind.Sea) {
        // 浅瀬
        messages.logMeteoSea1(ctx.log, island.id, island.name, landName(hex), p);
      } else {
        messages.logMeteoNormal(ctx.log, island.id, island.name, landName(hex), p);
      }
      terrain.setKind(x, y, LandKind.Sea, 0);
    }
  }

  // 噴火判定
  if (ctx.rng.int(1000) < ctx.config.disaster.eruption) {
    const x = ctx.rng.int(size);
    const y = ctx.rng.int(size);
    const hex = terrain.get(x, y);
    messages.logEruption(ctx.log, island.id, island.name, landName(hex), point(x, y));
    terrain.setKind(x, y, LandKind.Mountain, 0);

    for (let i = 1; i < 7; i++) {
      // B4: 範囲外判定を先に行う
      const s = neighbor({ x, y }, i);
      if (!inBounds(s, size)) {
        continue;
      }

      const sHex = terrain.get(s.x, s.y);
      const sPoint = point(s.x, s.y);

      if (
        sHex.kind === LandKind.Sea ||
        sHex.kind === LandKind.Oil ||
        sHex.kind === LandKind.Sbase
      ) {
        if (sHex.value === 1) {
          // 浅瀬
          messages.logEruptionSea1(ctx.log, island.id, island.name, landName(sHex), sPoint);
          // フォールスルーして共通処理 (荒地化) へ
        } else {
          messages.logEruptionSea(ctx.log, island.id, island.name, landName(sHex), sPoint);
          terrain.set(s.x, s.y, { kind: LandKind.Sea, value: 1 });
          continue;
        }
      } else if (
        sHex.kind === LandKind.Mountain ||
        sHex.kind === LandKind.Monster ||
        sHex.kind === LandKind.Waste
      ) {
        continue;
      } else {
        messages.logEruptionNormal(ctx.log, island.id, island.name, landName(sHex), sPoint);
      }
      terrain.setKind(s.x, s.y, LandKind.Waste, 0);
    }
  }

  // 食料があふれてたら換金
  if (island.food > 9999) {
    island.money += Math.trunc((island.food - 9999) / 10);
    island.food = 9999;
  }

  // 金があふれてたら切り捨て
  if (island.money > 9999) {
    island.money = 9999;
  }

  // 各種の値を計算
  estimate(island);

  // 繁栄、災難賞
  const pop = island.pop;
  const damage = state.oldPop - pop;

  // 繁栄賞 (elsif 連鎖のまま)
  if (!hasFlag(island.prize, PrizeFlag.Prosperity1) && pop >= 3000) {
    island.prize = withFlag(island.prize, PrizeFlag.Prosperity1);
    messages.logPrize(ctx.log, island.id, island.name, prizeNames[1] ?? "");
  } else if (!hasFlag(island.prize, PrizeFlag.Prosperity2) && pop >= 5000) {
    island.prize = withFlag(island.prize, PrizeFlag.Prosperity2);
    messages.logPrize(ctx.log, island.id, island.name, prizeNames[2] ?? "");
  } else if (!hasFlag(island.prize, PrizeFlag.Prosperity3) && pop >= 10000) {
    island.prize = withFlag(island.prize, PrizeFlag.Prosperity3);
    messages.logPrize(ctx.log, island.id, island.name, prizeNames[3] ?? "");
  }

  // 災難賞 (elsif 連鎖のまま)
  if (!hasFlag(island.prize, PrizeFlag.Disaster1) && damage >= 500) {
    island.prize = withFlag(island.prize, PrizeFlag.Disaster1);
    messages.logPrize(ctx.log, island.id, island.name, prizeNames[7] ?? "");
  } else if (!hasFlag(island.prize, PrizeFlag.Disaster2) && damage >= 1000) {
    island.prize = withFlag(island.prize, PrizeFlag.Disaster2);
    messages.logPrize(ctx.log, island.id, island.name, prizeNames[8] ?? "");
  } else if (!hasFlag(island.prize, PrizeFlag.Disaster3) && damage >= 2000) {
    island.prize = withFlag(island.prize, PrizeFlag.Disaster3);
    messages.logPrize(ctx.log, island.id, island.name, prizeNames[9] ?? "");
  }
}
