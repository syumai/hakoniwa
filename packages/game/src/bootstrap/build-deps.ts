// tmp/13-monorepo.md 「@hakoniwa/game の公開 API」、tmp/08 の buildDeps に対応する組立関数。
// 設計書との差異: 13 は `BuiltApp` という型名を挙げているが、Hono app は Phase 4 で追加するため、
// 本 Phase (3b) では app を含まない `BuiltDeps` を返す (Phase 4 で `app` フィールドを追加する)。
import { AdminService } from "../app/admin-service.ts";
import { GameService } from "../app/game-service.ts";
import type { BackupStore, Clock, Logger } from "../app/ports.ts";
import { TurnService } from "../app/turn-service.ts";
import { createMathRandomRng } from "../core/rng.ts";
import type { Rng } from "../core/rng.ts";
import type { SqlDriver } from "../storage/driver.ts";
import { SqliteGameRepository } from "../storage/repository.ts";
import type { AppConfig } from "./config-from-env.ts";
import { Pbkdf2PasswordHasher } from "./pbkdf2-hasher.ts";

export interface BuildDepsInput {
  driver: SqlDriver;
  backupStore: BackupStore;
  clock: Clock;
  config: AppConfig;
  /** 省略時は `createMathRandomRng()`。 */
  rng?: Rng;
  /** 省略時は console ベースの実装 (bootstrap 内でのみ console の使用を許容する)。 */
  logger?: Logger;
}

export interface BuiltDeps {
  repo: SqliteGameRepository;
  hasher: Pbkdf2PasswordHasher;
  gameService: GameService;
  turnService: TurnService;
  adminService: AdminService;
  config: AppConfig;
}

/** console ベースの既定ロガー。bootstrap 層 (Adapter 組立コード) でのみ console を直接使う。 */
function createConsoleLogger(): Logger {
  return {
    info: (msg: string) => {
      console.info(msg);
    },
    warn: (msg: string) => {
      console.warn(msg);
    },
    error: (msg: string, err?: unknown) => {
      console.error(msg, err);
    },
  };
}

/** `SqlDriver`/`BackupStore`/`Clock`/`AppConfig` から Service 一式を組み立てる。Adapter 共通の入口。 */
export function buildDeps(input: BuildDepsInput): BuiltDeps {
  const { driver, backupStore, clock, config } = input;
  const rng = input.rng ?? createMathRandomRng();
  const logger = input.logger ?? createConsoleLogger();

  const repo = new SqliteGameRepository(driver, {
    islandSize: config.game.islandSize,
    commandMax: config.game.commandMax,
  });
  const hasher = new Pbkdf2PasswordHasher();

  const gameService = new GameService({
    repo,
    hasher,
    clock,
    config: config.game,
    rng,
    ...(config.masterPassword !== undefined ? { masterPassword: config.masterPassword } : {}),
    ...(config.specialPassword !== undefined ? { specialPassword: config.specialPassword } : {}),
  });

  const turnService = new TurnService({
    repo,
    config: config.game,
    rng,
    backupStore,
    logger,
  });

  const adminService = new AdminService({
    repo,
    clock,
    config: config.game,
    backupStore,
    turnService,
  });

  return { repo, hasher, gameService, turnService, adminService, config };
}
