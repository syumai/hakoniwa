// Perl 版の rand() 呼び出しを抽象化する。
// core 内のすべての乱数はこの Rng 経由で取得し、Math.random を直接使わない
// (本番実装である createMathRandomRng() の内部を除く)。

/** 0 以上 1 未満の一様乱数を返すインターフェース。 */
export interface Rng {
  /** 0 以上 1 未満の乱数。 */
  next(): number;
  /** 0 以上 n 未満の整数乱数。Perl の random(n) = int(rand(1) * n) 相当。 */
  int(n: number): number;
}

function intFromNext(next: () => number, n: number): number {
  return Math.floor(next() * n);
}

/** 本番用。Math.random をそのまま使う。 */
export function createMathRandomRng(): Rng {
  return {
    next: () => Math.random(),
    int: (n: number) => intFromNext(Math.random, n),
  };
}

/**
 * テスト用の seed 固定乱数生成器 (mulberry32)。
 * 同じ seed からは常に同じ乱数列を生成する。
 */
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => intFromNext(next, n),
  };
}

/**
 * Perl 版 randomArray の移植。
 * 0..n-1 の順列をシャッフルして返す。n === 0 の場合は [0] を返す (Perl 準拠)。
 * シャッフルは Perl と同じく、i = n-1 から 1 まで j = int(rand(i+1)) で swap する。
 */
export function randomArray(n: number, rng: Rng): number[] {
  const size = n === 0 ? 1 : n;
  const list = Array.from({ length: size }, (_, i) => i);
  for (let i = size - 1; i >= 1; i--) {
    const j = rng.int(i + 1);
    if (i === j) {
      continue;
    }
    const tmp = list[i]!;
    list[i] = list[j]!;
    list[j] = tmp;
  }
  return list;
}
