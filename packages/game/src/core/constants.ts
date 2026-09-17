// Perl 版 Const.pm の「定数」部分 (地形/コマンド/怪獣/記念碑/賞) の移植。

/** 地形番号。Perl の $HlandXxx。 */
export const LandKind = {
  Sea: 0,
  Waste: 1,
  Plains: 2,
  Town: 3,
  Forest: 4,
  Farm: 5,
  Factory: 6,
  Base: 7,
  Defence: 8,
  Mountain: 9,
  Monster: 10,
  Sbase: 11,
  Oil: 12,
  Monument: 13,
  Haribote: 14,
} as const;
export type LandKind = (typeof LandKind)[keyof typeof LandKind];

/** 計画 (コマンド) 番号。Perl の $HcomXxx。 */
export const CommandKind = {
  Prepare: 1,
  Prepare2: 2,
  Reclaim: 3,
  Destroy: 4,
  SellTree: 5,
  Plant: 11,
  Farm: 12,
  Factory: 13,
  Mountain: 14,
  Base: 15,
  Dbase: 16,
  Sbase: 17,
  Monument: 18,
  Haribote: 19,
  MissileNM: 31,
  MissilePP: 32,
  MissileST: 33,
  MissileLD: 34,
  SendMonster: 35,
  DoNothing: 41,
  Sell: 42,
  Money: 43,
  Food: 44,
  Propaganda: 45,
  Giveup: 46,
  AutoPrepare: 61,
  AutoPrepare2: 62,
  AutoDelete: 63,
} as const;
export type CommandKind = (typeof CommandKind)[keyof typeof CommandKind];

/** 計画の名前と値段。cost が負の場合は食料。Perl の @HcomName / @HcomCost。 */
export interface CommandSpec {
  kind: CommandKind;
  name: string;
  cost: number;
}

/** コマンド一覧。Perl の @HcomList と同じ順序。 */
export const commandList: readonly CommandSpec[] = [
  { kind: CommandKind.Prepare, name: "整地", cost: 5 },
  { kind: CommandKind.Sell, name: "食料輸出", cost: -100 },
  { kind: CommandKind.Prepare2, name: "地ならし", cost: 100 },
  { kind: CommandKind.Reclaim, name: "埋め立て", cost: 150 },
  { kind: CommandKind.Destroy, name: "掘削", cost: 200 },
  { kind: CommandKind.SellTree, name: "伐採", cost: 0 },
  { kind: CommandKind.Plant, name: "植林", cost: 50 },
  { kind: CommandKind.Farm, name: "農場整備", cost: 20 },
  { kind: CommandKind.Factory, name: "工場建設", cost: 100 },
  { kind: CommandKind.Mountain, name: "採掘場整備", cost: 300 },
  { kind: CommandKind.Base, name: "ミサイル基地建設", cost: 300 },
  { kind: CommandKind.Dbase, name: "防衛施設建設", cost: 800 },
  { kind: CommandKind.Sbase, name: "海底基地建設", cost: 8000 },
  { kind: CommandKind.Monument, name: "記念碑建造", cost: 9999 },
  { kind: CommandKind.Haribote, name: "ハリボテ設置", cost: 1 },
  { kind: CommandKind.MissileNM, name: "ミサイル発射", cost: 20 },
  { kind: CommandKind.MissilePP, name: "PPミサイル発射", cost: 50 },
  { kind: CommandKind.MissileST, name: "STミサイル発射", cost: 50 },
  { kind: CommandKind.MissileLD, name: "陸地破壊弾発射", cost: 100 },
  { kind: CommandKind.SendMonster, name: "怪獣派遣", cost: 3000 },
  { kind: CommandKind.DoNothing, name: "資金繰り", cost: 0 },
  { kind: CommandKind.Money, name: "資金援助", cost: 100 },
  { kind: CommandKind.Food, name: "食料援助", cost: -100 },
  { kind: CommandKind.Propaganda, name: "誘致活動", cost: 1000 },
  { kind: CommandKind.Giveup, name: "島の放棄", cost: 0 },
  { kind: CommandKind.AutoPrepare, name: "整地自動入力", cost: 0 },
  { kind: CommandKind.AutoPrepare2, name: "地ならし自動入力", cost: 0 },
  { kind: CommandKind.AutoDelete, name: "全計画を白紙撤回", cost: 0 },
];

/** コマンド種別 → CommandSpec の索引。 */
export const commandSpecs: Readonly<Record<CommandKind, CommandSpec>> = Object.fromEntries(
  commandList.map((spec) => [spec.kind, spec]),
) as Readonly<Record<CommandKind, CommandSpec>>;

/** 怪獣の特殊能力。 */
export type MonsterSpecial = 0 | 1 | 2 | 3 | 4;

export interface MonsterSpec {
  name: string;
  baseHp: number;
  hpRange: number;
  special: MonsterSpecial;
  exp: number;
  value: number;
  image: string;
  hardenedImage: string | null;
}

/**
 * 怪獣 8 種。Perl の @HmonsterName / BHP / DHP / Special / Exp / Value / Image / Image2。
 * special の意味: 0 特になし / 1 足が速い(最大2歩) / 2 足がとても速い(無制限)
 *                / 3 奇数ターンは硬化 / 4 偶数ターンは硬化
 */
export const monsters: readonly MonsterSpec[] = [
  {
    name: "メカいのら",
    baseHp: 2,
    hpRange: 0,
    special: 0,
    exp: 5,
    value: 0,
    image: "monster7.gif",
    hardenedImage: null,
  },
  {
    name: "いのら",
    baseHp: 1,
    hpRange: 2,
    special: 0,
    exp: 5,
    value: 400,
    image: "monster0.gif",
    hardenedImage: null,
  },
  {
    name: "サンジラ",
    baseHp: 1,
    hpRange: 2,
    special: 3,
    exp: 7,
    value: 500,
    image: "monster5.gif",
    hardenedImage: "monster4.gif",
  },
  {
    name: "レッドいのら",
    baseHp: 3,
    hpRange: 2,
    special: 0,
    exp: 12,
    value: 1000,
    image: "monster1.gif",
    hardenedImage: null,
  },
  {
    name: "ダークいのら",
    baseHp: 2,
    hpRange: 2,
    special: 1,
    exp: 15,
    value: 800,
    image: "monster2.gif",
    hardenedImage: null,
  },
  {
    name: "いのらゴースト",
    baseHp: 1,
    hpRange: 0,
    special: 2,
    exp: 10,
    value: 300,
    image: "monster8.gif",
    hardenedImage: null,
  },
  {
    name: "クジラ",
    baseHp: 4,
    hpRange: 2,
    special: 4,
    exp: 20,
    value: 1500,
    image: "monster6.gif",
    hardenedImage: "monster4.gif",
  },
  {
    name: "キングいのら",
    baseHp: 5,
    hpRange: 2,
    special: 0,
    exp: 30,
    value: 2000,
    image: "monster3.gif",
    hardenedImage: null,
  },
];

/** 記念碑 3 種。Perl の @HmonumentName / @HmonumentImage。 */
export const monuments: readonly { name: string; image: string }[] = [
  { name: "モノリス", image: "monument0.gif" },
  { name: "平和記念碑", image: "monument0.gif" },
  { name: "戦いの碑", image: "monument0.gif" },
];

/** 賞の名前。Perl の @Hprize。 */
export const prizeNames: readonly string[] = [
  "ターン杯",
  "繁栄賞",
  "超繁栄賞",
  "究極繁栄賞",
  "平和賞",
  "超平和賞",
  "究極平和賞",
  "災難賞",
  "超災難賞",
  "究極災難賞",
];

/** 賞ビットフラグ。 */
export const PrizeFlag = {
  Prosperity1: 1,
  Prosperity2: 2,
  Prosperity3: 4,
  Peace1: 8,
  Peace2: 16,
  Peace3: 32,
  Disaster1: 64,
  Disaster2: 128,
  Disaster3: 256,
} as const;
export type PrizeFlag = (typeof PrizeFlag)[keyof typeof PrizeFlag];
