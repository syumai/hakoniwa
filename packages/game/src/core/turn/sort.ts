// Perl 版 Turn.pm の islandSort (人口順ソート) の移植。
import type { Island } from "../types.ts";

/**
 * 人口降順に並べ替えた新しい配列を返す。人口が同じときは元の順序を保つ (安定ソート)。
 * 元の配列は変更しない。
 */
export function islandSort(islands: Island[]): Island[] {
  return islands
    .map((island, index) => ({ island, index }))
    .sort((a, b) => b.island.pop - a.island.pop || a.index - b.index)
    .map((entry) => entry.island);
}
