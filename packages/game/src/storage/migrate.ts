// tmp/04-database.md 「スキーマ適用 (migrate.ts)」節 + tmp/14-users-auth.md
// 「スキーマは v2 として作り直す (v1 からの移行は提供しない)」+ tmp/16-season.md
// 「migrate を『現在の version から順にステップを適用』する形にする」の移植。
import type { SqlDriver } from "./driver.ts";
import { SCHEMA_VERSION, schemaSql } from "./schema.ts";

/** `migrate` の追加オプション。tmp/16-season.md「ターンの長さも DB に持つ (追加要件)」節。 */
export interface MigrateOptions {
  /**
   * v3 → v4 のステップで既存行の `unit_time_sec` をバックフィルする値。
   * 省略時は 21600 (6 時間。`defaultConfig.unitTimeSec` と同じ)。Adapter は
   * `config.unitTimeSec` (`HAKONIWA_UNIT_TIME_SEC`) を渡す。
   */
  defaultUnitTimeSec?: number;
}

/**
 * version N → N+1 のマイグレーションステップ。1 トランザクションで適用され、
 * 適用後に `schema_version` が自動的に N+1 へ更新される (ステップ内で更新する必要はない)。
 */
type MigrationStep = (driver: SqlDriver, opts: Required<MigrateOptions>) => void;

const MIGRATION_STEPS: Record<number, MigrationStep> = {
  // v2 → v3: tmp/16-season.md。最終ターンと開始時刻の列を追加する (`db reset` を要求しない)。
  // start_at は既存データに historical な値が無いため、既存の last_time で近似する
  // (これまでのゲームは season 機能が無く、常に turn=1 で始まっているとは限らないため厳密な
  // 復元はできない。表示上の近似値として割り切る)。
  2: (driver) => {
    driver.exec("ALTER TABLE game ADD COLUMN final_turn INTEGER");
    driver.exec("ALTER TABLE game ADD COLUMN start_at INTEGER NOT NULL DEFAULT 0");
    driver.exec("UPDATE game SET start_at = last_time");
  },
  // v3 → v4: tmp/16-season.md「ターンの長さも DB に持つ (追加要件)」節。
  // SQLite の ADD COLUMN は NOT NULL 列に DEFAULT が必須で、かつプレースホルダを使えないため、
  // 検証済みの整数をリテラルとして文字列連結で埋め込む。
  3: (driver, opts) => {
    driver.exec(
      `ALTER TABLE game ADD COLUMN unit_time_sec INTEGER NOT NULL DEFAULT ${opts.defaultUnitTimeSec}`,
    );
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
export function migrate(driver: SqlDriver, opts: MigrateOptions = {}): void {
  const defaultUnitTimeSec = opts.defaultUnitTimeSec ?? 21600;
  if (!Number.isSafeInteger(defaultUnitTimeSec) || defaultUnitTimeSec <= 0) {
    throw new Error(
      `migrate: defaultUnitTimeSec must be a positive integer (got: ${defaultUnitTimeSec})`,
    );
  }
  const stepOpts: Required<MigrateOptions> = { defaultUnitTimeSec };
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
      step(driver, stepOpts);
      driver.run("UPDATE schema_version SET version = ?", next);
    });
    version = next;
  }
}
