// tmp/13-monorepo.md packages/server-node の compose.ts。
// driver/backup/clock を組み立てて @hakoniwajs/core の buildDeps を呼び、Adapter が使う一式を返す。
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { buildDeps, migrate } from "@hakoniwajs/core";
import type { BuiltDeps, Clock } from "@hakoniwajs/core";
import { FileBackupStore } from "./backup.ts";
import type { NodeConfig } from "./config.ts";
import { NodeSqliteDriver } from "./driver.ts";

export interface ComposedNode extends BuiltDeps {
  driver: NodeSqliteDriver;
  backupStore: FileBackupStore;
}

function createSystemClock(): Clock {
  return { now: () => Math.floor(Date.now() / 1000) };
}

/**
 * `NodeConfig` から DB ファイルを開き、マイグレーションを適用したうえで
 * `@hakoniwajs/core` の `buildDeps` を呼ぶ。`server.ts`/`dev.ts`/`cli.ts` (Phase 4/5) の入口。
 */
export function composeNode(config: NodeConfig): ComposedNode {
  if (config.dbPath !== ":memory:") {
    mkdirSync(dirname(config.dbPath), { recursive: true });
  }
  const driver = new NodeSqliteDriver(config.dbPath);
  migrate(driver, { defaultUnitTimeSec: config.game.unitTimeSec });
  const backupStore = new FileBackupStore(config.dbPath, config.backupDir, driver);
  const clock = createSystemClock();

  const deps = buildDeps({ driver, backupStore, clock, config });

  return { ...deps, driver, backupStore };
}
