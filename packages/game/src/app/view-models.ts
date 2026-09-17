// 画面向け DTO。HTML は含めない (描画は Phase 3b の web/views が行う)。
// tmp/06-web-routes-and-views.md 「画面」節、Perl 版 Top.pm / Map.pm の各 temp* 関数が
// 表示していた情報を構造化したもの。
import type { GameConfig } from "../core/config.ts";
import type { FormattedCommand } from "../core/commands/format.ts";
import type { FlagPrizeView, KilledMonstersView } from "../core/prize.ts";
import type { Command, HistoryEntry, LbbsPost, LogEntry, Terrain } from "../core/types.ts";

/**
 * 資金の表示方法。Perl 版 aboutMoney / hideMoneyMode の移植。
 * - hidden: hideMoneyMode 0 かつ観光者 (欄自体を表示しない)
 * - exact: hideMoneyMode 1、または開発画面 (島主本人)
 * - about: hideMoneyMode 2 (観光者向け概算表示)
 */
export interface MoneyDisplay {
  mode: "hidden" | "exact" | "about";
  value?: number;
  text?: string;
}

/** Perl 版 aboutMoney の移植。 */
export function aboutMoney(money: number, unit: string): string {
  if (money < 500) {
    return `推定500${unit}未満`;
  }
  const thousands = Math.floor((money + 500) / 1000);
  return `推定${thousands}000${unit}`;
}

/** hideMoneyMode と観光/開発の別から MoneyDisplay を組み立てる。 */
export function buildMoneyDisplay(
  money: number,
  config: GameConfig,
  isOwner: boolean,
): MoneyDisplay {
  if (config.hideMoneyMode === 1 || isOwner) {
    return { mode: "exact", value: money };
  }
  if (config.hideMoneyMode === 2) {
    return { mode: "about", text: aboutMoney(money, config.units.money) };
  }
  return { mode: "hidden" };
}

/** 受賞状況の表示用データ。core/prize.ts の各関数の結果をまとめたもの。 */
export interface PrizeVM {
  turnPrizes: number[];
  flagPrizes: FlagPrizeView[];
  killedMonsters: KilledMonstersView;
}

/** トップ画面の島 1 行分。Perl 版 Top.pm tempTopPage の表の 1 行に相当。 */
export interface IslandRowVM {
  id: number;
  name: string;
  /** 1 始まり。 */
  rank: number;
  absent: number;
  pop: number;
  area: number;
  food: number;
  farm: number;
  factory: number;
  mountain: number;
  moneyDisplay: MoneyDisplay;
  prize: PrizeVM;
  comment: string;
}

/** トップ画面全体。 */
export interface TopPageVM {
  turn: number;
  islands: IslandRowVM[];
  /** 島の数が上限未満か (新規作成フォームを出すかどうか)。 */
  canCreate: boolean;
  logs: LogEntry[];
  history: HistoryEntry[];
  debug: boolean;
}

/** 観光/開発/新規発見画面で共通の島情報。Perl 版 islandInfo + islandMap の情報部分。 */
export interface IslandDetailVM {
  id: number;
  name: string;
  /** 1 始まり。 */
  rank: number;
  /** 現在のターン数。IslandMap の怪獣硬化判定 (isHardened) に必要 (web 層で追加)。 */
  turn: number;
  absent: number;
  pop: number;
  area: number;
  food: number;
  farm: number;
  factory: number;
  mountain: number;
  comment: string;
  prize: PrizeVM;
  terrain: Terrain;
}

/** 観光画面。Perl 版 printIslandMain。 */
export interface IslandPageVM extends IslandDetailVM {
  moneyDisplay: MoneyDisplay;
  lbbs: LbbsPost[];
  /** mode 0 (機密除外)。 */
  logs: LogEntry[];
}

/** 開発画面。Perl 版 ownerMain。島主本人向けなので資金は実値。 */
export interface OwnerPageVM extends IslandDetailVM {
  money: number;
  commands: FormattedCommand[];
  /**
   * 整形前のコマンド一覧 (web 層で追加)。IslandMap の座標付き計画オーバーレイ (Perl 版 comStr) は
   * x/y が必要だが FormattedCommand は文字列化済みで持たないため、別途生の Command 配列を持たせる。
   */
  rawCommands: Command[];
  lbbs: LbbsPost[];
  /** mode 1 (本人の機密ログを含む)。 */
  logs: LogEntry[];
}

/** 新規発見画面。Perl 版 newIslandMain (tempNewIslandHead + islandInfo + islandMap(owner))。 */
export interface NewIslandVM extends IslandDetailVM {
  money: number;
}

/** フォームの島セレクト用。 */
export interface IslandSelectVM {
  id: number;
  name: string;
}
