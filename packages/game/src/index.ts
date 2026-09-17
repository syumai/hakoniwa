// @hakoniwa/game の公開 API。
// Phase 0 時点では core の主要な型・関数のみを re-export する。
// Adapter 向け API (buildDeps, migrate 等) は Phase 3 以降で追加する。

export type {
  GameConfig,
  GameUnits,
  DisasterConfig,
  OilConfig,
  SiteConfig,
} from "./core/config.ts";
export { defaultConfig } from "./core/config.ts";

export type { CommandSpec, MonsterSpec, MonsterSpecial } from "./core/constants.ts";
export {
  LandKind,
  CommandKind,
  commandList,
  commandSpecs,
  monsters,
  monuments,
  prizeNames,
  PrizeFlag,
} from "./core/constants.ts";

export type {
  Hex,
  Terrain,
  Command,
  Prize,
  LbbsAuthor,
  LbbsPost,
  Island,
  TurnIslandState,
  World,
  LogEntry,
  HistoryEntry,
} from "./core/types.ts";
export { doNothingCommand } from "./core/types.ts";

export type { Rng } from "./core/rng.ts";
export { createMathRandomRng, createSeededRng, randomArray } from "./core/rng.ts";

export type { Point } from "./core/geometry.ts";
export {
  AX,
  AY,
  neighbor,
  neighbors,
  inBounds,
  countAround,
  shuffledPoints,
} from "./core/geometry.ts";

export {
  createTerrain,
  terrainFromJSON,
  landName,
  monsterSpec,
  expToLevel,
  isHardened,
} from "./core/terrain.ts";

export type { NewIslandInit } from "./core/island.ts";
export { makeNewLand, makeNewIsland, estimate } from "./core/island.ts";

export type { AutoPrepareKind } from "./core/commands/queue.ts";
export {
  slideFront,
  slideBack,
  writeAt,
  insertAt,
  deleteAt,
  clearAll,
  autoPrepare,
} from "./core/commands/queue.ts";

export type { FormattedCommand, ResolveIslandName } from "./core/commands/format.ts";
export { formatCommand } from "./core/commands/format.ts";

export type { FlagPrizeView, KilledMonstersView } from "./core/prize.ts";
export {
  hasFlag,
  withFlag,
  withMonster,
  withTurnPrize,
  turnPrizes,
  flagPrizes,
  killedMonsters,
} from "./core/prize.ts";

export * as logMarkup from "./core/log/markup.ts";
export * as logMessages from "./core/log/messages.ts";
export { LogCollector } from "./core/log/collector.ts";

export type { TurnContext } from "./core/turn/context.ts";
export { getState, findIsland } from "./core/turn/context.ts";
export { income } from "./core/turn/income.ts";
export { wideDamage } from "./core/turn/wide-damage.ts";
export type { CommandOutcome } from "./core/turn/command.ts";
export { doCommand } from "./core/turn/command.ts";
export { doPrepare, doReclaim, doDestroy, doSellTree } from "./core/turn/command-land.ts";
export { doBuild, doMountain, doSbase } from "./core/turn/command-build.ts";
export { doSendMonster, doSell, doAid, doPropaganda, doGiveup } from "./core/turn/command-misc.ts";
export { doMissile } from "./core/turn/missile.ts";
