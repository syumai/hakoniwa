// tmp/04-database.md 「スキーマ適用 (migrate.ts)」節 + tmp/14-users-auth.md
// 「スキーマは v2 として作り直す (v1 からの移行は提供しない)」+ tmp/16-season.md
// 「migrate を『現在の version から順にステップを適用』する形にする」の移植。
import type { SqlDriver } from "./driver.ts";
import { SCHEMA_VERSION, schemaSql } from "./schema.ts";

/**
 * version N → N+1 のマイグレーションステップ。1 トランザクションで適用され、
 * 適用後に `schema_version` が自動的に N+1 へ更新される (ステップ内で更新する必要はない)。
 */
const MIGRATION_STEPS: Record<number, (driver: SqlDriver) => void> = {
  // v2 → v3: tmp/16-season.md。最終ターンと開始時刻の列を追加する (`db reset` を要求しない)。
  // start_at は既存データに historical な値が無いため、既存の last_time で近似する
  // (これまでのゲームは season 機能が無く、常に turn=1 で始まっているとは限らないため厳密な
  // 復元はできない。表示上の近似値として割り切る)。
  2: (driver) => {
    driver.exec("ALTER TABLE game ADD COLUMN final_turn INTEGER");
    driver.exec("ALTER TABLE game ADD COLUMN start_at INTEGER NOT NULL DEFAULT 0");
    driver.exec("UPDATE game SET start_at = last_time");
  },
};

/**
 * `schema_version` 表の有無を `sqlite_master` で確認する。
 * - 無ければ空 DB とみなし、DDL 全体 (現行の `SCHEMA_VERSION` 相当) を 1 トランザクションで適用し、
 *   `schema_version` に `SCHEMA_VERSION` を INSERT する。
 * - v1 (パスワード認証時代のスキーマ) を検出した場合は自動移行せず、明確な Error を throw する
 *   (`db reset` を促す)。
 * - v2 以降であれば、現在の version から `SCHEMA_VERSION` まで `MIGRATION_STEPS` を順に適用する
 *   (各ステップは 1 トランザクション)。既に最新なら何もしない。
 *
 * DO では constructor の `blockConcurrencyWhile` 内で呼ぶことを想定 (12-workers-adapter.md)。
 */
export function migrate(driver: SqlDriver): void {
  const existing = driver.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'",
  );
  if (existing === undefined) {
    driver.transaction(() => {
      driver.exec(schemaSql);
      driver.run("INSERT INTO schema_version (version) VALUES (?)", SCHEMA_VERSION);
    });
    return;
  }

  const row = driver.get<{ version: number }>("SELECT version FROM schema_version LIMIT 1");
  let version = row?.version ?? 0;

  if (version === 1) {
    throw new Error(
      `migrate: incompatible schema version ${version} (expected ${SCHEMA_VERSION}). ` +
        "v1 (パスワード認証) のデータベースは自動移行できません。" +
        "`db reset` を実行してデータベースを作り直してください。",
    );
  }

  while (version < SCHEMA_VERSION) {
    const step = MIGRATION_STEPS[version];
    if (step === undefined) {
      throw new Error(
        `migrate: incompatible schema version ${version} (expected ${SCHEMA_VERSION}). ` +
          "このバージョンからの移行ステップが定義されていません。" +
          "`db reset` を実行してデータベースを作り直してください。",
      );
    }
    const next = version + 1;
    driver.transaction(() => {
      step(driver);
      driver.run("UPDATE schema_version SET version = ?", next);
    });
    version = next;
  }
}
