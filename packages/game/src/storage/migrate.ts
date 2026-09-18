// tmp/04-database.md 「スキーマ適用 (migrate.ts)」節 + tmp/14-users-auth.md
// 「スキーマは v2 として作り直す (v1 からの移行は提供しない)」の移植。
import type { SqlDriver } from "./driver.ts";
import { SCHEMA_VERSION, schemaSql } from "./schema.ts";

/**
 * `schema_version` 表の有無を `sqlite_master` で確認する。
 * - 無ければ空 DB とみなし、DDL 全体を 1 トランザクションで適用して
 *   `schema_version` に `SCHEMA_VERSION` (2) を INSERT する。
 * - あれば version を読み、`SCHEMA_VERSION` と異なる (= v1 の DB を開いた) 場合は
 *   自動移行せず、明確な Error を throw する (`db reset` を促す)。
 * - 一致していれば何もしない。
 *
 * DO では constructor の `blockConcurrencyWhile` 内で呼ぶことを想定 (12-workers-adapter.md)。
 */
export function migrate(driver: SqlDriver): void {
  const existing = driver.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'",
  );
  if (existing !== undefined) {
    const row = driver.get<{ version: number }>("SELECT version FROM schema_version LIMIT 1");
    const version = row?.version ?? 0;
    if (version !== SCHEMA_VERSION) {
      throw new Error(
        `migrate: incompatible schema version ${version} (expected ${SCHEMA_VERSION}). ` +
          "v1 (パスワード認証) のデータベースは v2 に自動移行できません。" +
          "`db reset` を実行してデータベースを作り直してください。",
      );
    }
    return;
  }
  driver.transaction(() => {
    driver.exec(schemaSql);
    driver.run("INSERT INTO schema_version (version) VALUES (?)", SCHEMA_VERSION);
  });
}
