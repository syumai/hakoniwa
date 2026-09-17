// tmp/04-database.md 「スキーマ適用 (migrate.ts)」節の移植。
import type { SqlDriver } from "./driver.ts";
import { schemaSql } from "./schema.ts";

/**
 * `schema_version` 表の有無を `sqlite_master` で確認し、無ければ DDL 全体を
 * 1 トランザクションで適用して version 1 を INSERT する。既に適用済みなら何もしない。
 * DO では constructor の `blockConcurrencyWhile` 内で呼ぶことを想定 (12-workers-adapter.md)。
 */
export function migrate(driver: SqlDriver): void {
  const existing = driver.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'",
  );
  if (existing !== undefined) {
    return;
  }
  driver.transaction(() => {
    driver.exec(schemaSql);
    driver.run("INSERT INTO schema_version (version) VALUES (?)", 1);
  });
}
