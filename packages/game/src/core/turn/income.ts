// Perl 版 Turn.pm の income (収入・食料消費フェイズ) の移植。
import type { GameConfig } from "../config.ts";
import type { Island } from "../types.ts";

/**
 * 収入と食料消費を計算し、island を直接書き換える。
 * B16: farm*10 を人口と比較し、余剰人口/10 と (工場+採掘場) の小さい方を資金収入にする。
 * 食料消費は `food = int(food - pop * eatenFood)` (Perl と同じ計算順)。
 */
export function income(island: Island, config: GameConfig): void {
  const pop = island.pop;
  const farm = island.farm * 10;
  const factory = island.factory;
  const mountain = island.mountain;

  if (pop > farm) {
    // 農業だけじゃ手が余る場合: 農場フル稼働 + 工場/採掘場からの収入
    island.food += farm;
    island.money += Math.min(Math.trunc((pop - farm) / 10), factory + mountain);
  } else {
    // 農業だけで手一杯の場合: 全員野良仕事
    island.food += pop;
  }

  // 食料消費
  island.food = Math.trunc(island.food - pop * config.eatenFood);
}
