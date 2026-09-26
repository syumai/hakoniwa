// Perl 版 Turn.pm の prize 文字列 ("flags,monsters,turn1,turn2,...") 操作、
// および Top.pm の賞表示ロジックの移植。
// Prize は不変オブジェクトとして扱う。with* 系は新しいオブジェクトを返す。
import { monsters, prizeNames } from "./constants.ts";
import type { PrizeFlag } from "./constants.ts";
import type { Prize } from "./types.ts";

/** flag が立っているか。 */
export function hasFlag(prize: Prize, flag: PrizeFlag): boolean {
  return (prize.flags & flag) !== 0;
}

/** flag を立てた新しい Prize を返す。 */
export function withFlag(prize: Prize, flag: PrizeFlag): Prize {
  return { ...prize, flags: prize.flags | flag };
}

/** 怪獣を倒した記録を追加した新しい Prize を返す。monsterKind は monsters 配列の添字。 */
export function withMonster(prize: Prize, monsterKind: number): Prize {
  return { ...prize, monsters: prize.monsters | (1 << monsterKind) };
}

/** ターン杯を獲得したターンを追加した新しい Prize を返す。 */
export function withTurnPrize(prize: Prize, turn: number): Prize {
  return { ...prize, turns: [...prize.turns, turn] };
}

/** 表示用: ターン杯を獲得したターン番号の一覧。 */
export function turnPrizes(prize: Prize): number[] {
  return [...prize.turns];
}

export interface FlagPrizeView {
  /** prizeNames の添字 (1..9)。 */
  index: number;
  name: string;
  image: string;
}

/**
 * 表示用: 立っている flag の一覧を賞名/画像に変換する。
 * Perl 版 Top.pm のビット i (1..9, flags & (1 << (i-1))) → prize{i}.gif の移植。
 */
export function flagPrizes(prize: Prize): FlagPrizeView[] {
  const result: FlagPrizeView[] = [];
  for (let index = 1; index <= 9; index++) {
    if (hasFlag(prize, (1 << (index - 1)) as PrizeFlag)) {
      result.push({
        index,
        name: prizeNames[index] ?? "",
        image: `prize${index}.gif`,
      });
    }
  }
  return result;
}

export interface KilledMonstersView {
  /** 倒した怪獣のうち最大種別の添字。1 体も倒していなければ -1。 */
  maxKind: number;
  names: string[];
}

/**
 * 表示用: 倒した怪獣の一覧と最大種別を求める。
 * Perl 版 Top.pm の倒した怪獣リスト表示の移植 (画像は最大種別のもの1枚だけ表示する)。
 */
export function killedMonsters(prize: Prize): KilledMonstersView {
  let maxKind = -1;
  const names: string[] = [];
  for (let kind = 0; kind < monsters.length; kind++) {
    if ((prize.monsters & (1 << kind)) !== 0) {
      names.push(monsters[kind]?.name ?? "");
      maxKind = kind;
    }
  }
  return { maxKind, names };
}
