// Perl 版 Turn.pm の makeNewLand / makeNewIsland / estimate の移植。
import type { GameConfig } from "./config.ts";
import { LandKind } from "./constants.ts";
import { countAround } from "./geometry.ts";
import type { Rng } from "./rng.ts";
import { createTerrain } from "./terrain.ts";
import type { Island, Terrain } from "./types.ts";
import { doNothingCommand } from "./types.ts";

/**
 * 新しい島の地形を作成する。Perl 版 makeNewLand の移植。
 *
 * 手順:
 * 1. 全面を海で初期化する。
 * 2. 中央 4x4 に荒地を配置する。
 * 3. 中央 8x8 の範囲でランダムに 120 回、陸地を増殖させる。
 *    (荒地→平地 / 浅瀬(value=1)→荒地 / 海→浅瀬)
 * 4. 中央 4x4 に森 4 箇所、町 2 箇所、山 1 箇所、基地 1 箇所を配置する。
 *
 * 乱数の呼び出し順序は Perl 版と同じ (各座標とも x → y の順) にする。
 * B7: `countAround` の二重呼び出しは 1 回にまとめている (乱数を消費しないため結果に影響しない)。
 */
export function makeNewLand(size: number, rng: Rng): Terrain {
  const terrain = createTerrain(size);
  const center = size / 2 - 1;

  // 中央の4*4に荒地を配置
  for (let y = center - 1; y < center + 3; y++) {
    for (let x = center - 1; x < center + 3; x++) {
      terrain.setKind(x, y, LandKind.Waste, 0);
    }
  }

  // 8*8範囲内に陸地を増殖
  for (let i = 0; i < 120; i++) {
    const x = rng.int(8) + center - 3;
    const y = rng.int(8) + center - 3;

    if (countAround(terrain, { x, y }, LandKind.Sea, 7) !== 7) {
      const hex = terrain.get(x, y);
      if (hex.kind === LandKind.Waste) {
        // 荒地は平地にする
        terrain.setKind(x, y, LandKind.Plains, 0);
      } else if (hex.value === 1) {
        // 浅瀬は荒地にする
        terrain.setKind(x, y, LandKind.Waste, 0);
      } else {
        // それ以外 (海) は浅瀬にする
        terrain.set(x, y, { kind: hex.kind, value: 1 });
      }
    }
  }

  // 森を作る
  let count = 0;
  while (count < 4) {
    const x = rng.int(4) + center - 1;
    const y = rng.int(4) + center - 1;
    if (terrain.get(x, y).kind !== LandKind.Forest) {
      terrain.setKind(x, y, LandKind.Forest, 5); // 最初は500本
      count++;
    }
  }

  // 町を作る
  count = 0;
  while (count < 2) {
    const x = rng.int(4) + center - 1;
    const y = rng.int(4) + center - 1;
    const kind = terrain.get(x, y).kind;
    if (kind !== LandKind.Town && kind !== LandKind.Forest) {
      terrain.setKind(x, y, LandKind.Town, 5); // 最初は500人
      count++;
    }
  }

  // 山を作る
  count = 0;
  while (count < 1) {
    const x = rng.int(4) + center - 1;
    const y = rng.int(4) + center - 1;
    const kind = terrain.get(x, y).kind;
    if (kind !== LandKind.Town && kind !== LandKind.Forest) {
      terrain.setKind(x, y, LandKind.Mountain, 0); // 最初は採掘場なし
      count++;
    }
  }

  // 基地を作る
  count = 0;
  while (count < 1) {
    const x = rng.int(4) + center - 1;
    const y = rng.int(4) + center - 1;
    const kind = terrain.get(x, y).kind;
    if (kind !== LandKind.Town && kind !== LandKind.Forest && kind !== LandKind.Mountain) {
      terrain.setKind(x, y, LandKind.Base, 0);
      count++;
    }
  }

  return terrain;
}

/** 新規島の作成時、呼び出し側 (Phase 3 の GameService) が設定する項目。 */
export interface NewIslandInit {
  id: number;
  name: string;
  ownerUserId: string;
}

/**
 * 新しい島を作成する。Perl 版 makeNewIsland の移植。
 *
 * Perl では id/name/password/absent/comment/score は newIslandMain 側で
 * 後から島ハッシュに書き込んでいるが、TS では Island が完全な形の型なので
 * その場で全部埋めて返す (`init` で呼び出し側から必要な値を受け取る)。
 * pop/area/farm/factory/mountain は 0 で返す。呼び出し側で `estimate()` を呼ぶこと。
 */
export function makeNewIsland(config: GameConfig, rng: Rng, init: NewIslandInit): Island {
  const terrain = makeNewLand(config.islandSize, rng);
  const commands = Array.from({ length: config.commandMax }, () => ({ ...doNothingCommand }));

  return {
    id: init.id,
    name: init.name,
    ownerUserId: init.ownerUserId,
    comment: "(未登録)",
    score: 0,
    // B12: 放置すると giveupTurns - 3 ターン後に自動放棄される (Perl 準拠)。
    absent: config.giveupTurns - 3,
    money: config.initialMoney,
    food: config.initialFood,
    pop: 0,
    area: 0,
    farm: 0,
    factory: 0,
    mountain: 0,
    prize: { flags: 0, monsters: 0, turns: [] },
    terrain,
    commands,
    lbbs: [],
  };
}

/**
 * 島の pop/area/farm/factory/mountain を地形から再計算し、その場で書き換える。
 * Perl 版 estimate の移植。B17: 導出値だが Island に永続フィールドとして持つ。
 */
export function estimate(island: Island): void {
  let pop = 0;
  let area = 0;
  let farm = 0;
  let factory = 0;
  let mountain = 0;

  const { terrain } = island;
  for (let y = 0; y < terrain.size; y++) {
    for (let x = 0; x < terrain.size; x++) {
      const hex = terrain.get(x, y);
      if (hex.kind === LandKind.Sea || hex.kind === LandKind.Sbase || hex.kind === LandKind.Oil) {
        continue;
      }
      area++;
      switch (hex.kind) {
        case LandKind.Town:
          pop += hex.value;
          break;
        case LandKind.Farm:
          farm += hex.value;
          break;
        case LandKind.Factory:
          factory += hex.value;
          break;
        case LandKind.Mountain:
          mountain += hex.value;
          break;
        default:
          break;
      }
    }
  }

  island.pop = pop;
  island.area = area;
  island.farm = farm;
  island.factory = factory;
  island.mountain = mountain;
}
