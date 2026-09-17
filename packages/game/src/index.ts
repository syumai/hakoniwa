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
export { doEachHex, countGrow } from "./core/turn/each-hex.ts";
export { doIslandProcess } from "./core/turn/island-process.ts";
export { islandSort } from "./core/turn/sort.ts";
export type { TurnResult, CreateTurnContextInput } from "./core/turn/index.ts";
export { runTurn, createTurnContext } from "./core/turn/index.ts";

// ----------------------------------------------------------------------
// app 層 (Phase 3a)。ports の型、ユースケース (Service)、画面向け DTO。
// ----------------------------------------------------------------------

export type {
  GameMeta,
  IslandSummary,
  ListLogsQuery,
  GameRepository,
  BackupInfo,
  BackupStore,
  Clock,
  PasswordHasher,
  Logger,
} from "./app/ports.ts";

export type { AppErrorKind } from "./app/errors.ts";
export { AppError } from "./app/errors.ts";

export type { VerifyIslandPasswordDeps } from "./app/auth.ts";
export { safeEqual, verifyIslandPassword } from "./app/auth.ts";

export {
  MAX_NAME_LEN,
  MAX_COMMENT_LEN,
  MAX_LBBS_NAME_LEN,
  MAX_LBBS_MESSAGE_LEN,
  stripControlAndComma,
  cutColumn,
  sanitizeText,
  isBadIslandName,
} from "./app/sanitize.ts";

export type {
  MoneyDisplay,
  PrizeVM,
  IslandRowVM,
  TopPageVM,
  IslandDetailVM,
  IslandPageVM,
  OwnerPageVM,
  NewIslandVM,
  IslandSelectVM,
} from "./app/view-models.ts";
export { aboutMoney, buildMoneyDisplay } from "./app/view-models.ts";

export type { GameServiceDeps, CommandInput } from "./app/game-service.ts";
export { GameService } from "./app/game-service.ts";

export type { TurnServiceDeps } from "./app/turn-service.ts";
export { TurnService } from "./app/turn-service.ts";

export type { AdminStatus, AdminServiceDeps } from "./app/admin-service.ts";
export { AdminService } from "./app/admin-service.ts";

export {
  FakeGameRepository,
  FakePasswordHasher,
  FakeClock,
  FakeBackupStore,
  FakeLogger,
} from "./app/fake-repository.ts";

// ----------------------------------------------------------------------
// storage 層 (Phase 3b)。SqlDriver、マイグレーション、実 SQLite リポジトリ。
// ----------------------------------------------------------------------

export type { SqlDriver, SqlParam } from "./storage/driver.ts";
export { schemaSql } from "./storage/schema.ts";
export { migrate } from "./storage/migrate.ts";
export type { SqliteGameRepositoryConfig } from "./storage/repository.ts";
export { SqliteGameRepository } from "./storage/repository.ts";

// ----------------------------------------------------------------------
// bootstrap 層 (Phase 3b)。env → 設定、パスワードハッシュ、Adapter 共通の組立。
// ----------------------------------------------------------------------

export { Pbkdf2PasswordHasher } from "./bootstrap/pbkdf2-hasher.ts";
export type { AppConfig } from "./bootstrap/config-from-env.ts";
export { loadConfigFromEnv } from "./bootstrap/config-from-env.ts";
export type { BuildDepsInput, BuiltDeps } from "./bootstrap/build-deps.ts";
export { buildDeps } from "./bootstrap/build-deps.ts";
