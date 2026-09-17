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
