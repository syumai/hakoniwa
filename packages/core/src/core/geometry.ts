// 六角格子座標。Perl 版 Turn.pm 冒頭の @ax/@ay と countAround、
// Main.pm の makeRandomPointArray の移植。
import { LandKind } from "./constants.ts";
import type { Rng } from "./rng.ts";
import type { Terrain } from "./types.ts";

export interface Point {
  x: number;
  y: number;
}

/** 周囲2ヘックスまでの相対座標テーブル (中心 + 1ヘックス圏6 + 2ヘックス圏12 = 19)。 */
export const AX: readonly number[] = [
  0, 1, 1, 1, 0, -1, 0, 1, 2, 2, 2, 1, 0, -1, -1, -2, -1, -1, 0,
];
export const AY: readonly number[] = [
  0, -1, 0, 1, 1, 0, -1, -2, -1, 0, 1, 2, 2, 2, 1, 0, -1, -2, -2,
];

/**
 * p から見て i 番目 (0..18) の座標。奇数行補正込み。
 * 補正: 計算後の sy が偶数、かつ元の y が奇数のとき sx-- する (Perl 版と同じ)。
 */
export function neighbor(p: Point, i: number): Point {
  const ax = AX[i];
  const ay = AY[i];
  if (ax === undefined || ay === undefined) {
    throw new RangeError(`neighbor: index out of range: ${i}`);
  }
  let sx = p.x + ax;
  const sy = p.y + ay;
  if (sy % 2 === 0 && p.y % 2 === 1) {
    sx--;
  }
  return { x: sx, y: sy };
}

/** p の周囲 (range: 7 = 1ヘックス圏まで, 19 = 2ヘックス圏まで) の座標一覧。範囲外を含む。 */
export function neighbors(p: Point, range: 7 | 19): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < range; i++) {
    result.push(neighbor(p, i));
  }
  return result;
}

export function inBounds(p: Point, size: number): boolean {
  return p.x >= 0 && p.x < size && p.y >= 0 && p.y < size;
}

/**
 * p の周囲 (range 個) にある kind の地形数を数える。
 * 範囲外は kind === LandKind.Sea のときだけ加算する (Perl 版と同じ)。
 */
export function countAround(terrain: Terrain, p: Point, kind: LandKind, range: 7 | 19): number {
  let count = 0;
  for (let i = 0; i < range; i++) {
    const s = neighbor(p, i);
    if (!inBounds(s, terrain.size)) {
      if (kind === LandKind.Sea) {
        count++;
      }
      continue;
    }
    if (terrain.get(s.x, s.y).kind === kind) {
      count++;
    }
  }
  return count;
}

/**
 * Perl 版 makeRandomPointArray の移植。
 * (0,0) から (size-1, size-1) までの座標が一回ずつ出てくるように並べ、シャッフルする。
 * 生成順は y を外側、x を内側にした行優先 (Hrpx/Hrpy と同じ)。
 */
export function shuffledPoints(size: number, rng: Rng): Point[] {
  const pointNumber = size * size;
  const points: Point[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      points.push({ x, y });
    }
  }

  // シャッフル (randomArray と同じ Fisher-Yates)。
  for (let i = pointNumber - 1; i >= 1; i--) {
    const j = rng.int(i + 1);
    if (i === j) {
      continue;
    }
    const tmp = points[i]!;
    points[i] = points[j]!;
    points[j] = tmp;
  }
  return points;
}
