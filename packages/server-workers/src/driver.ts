// tmp/12-workers-adapter.md 「SqlDriver の DO 実装」節の実装。
// Durable Object (SQLite backend) の同期 SQL API (`ctx.storage.sql`) を `SqlDriver` に載せる。
import type { SqlDriver, SqlParam } from "@hakoniwa/game";

/**
 * `ctx.storage` (DurableObjectStorage) による `SqlDriver` 実装。
 *
 * 実装時の注意点 (tmp/12-workers-adapter.md 参照):
 * - `sql.exec` に `BEGIN`/`COMMIT` を渡せないため、`transaction` は `transactionSync` を使う
 *   (Node 版 `NodeSqliteDriver` の `BEGIN IMMEDIATE` とは異なる)。
 * - `run()` の戻り値は使わない (`GameRepository` 側は `SELECT changes()` で更新件数を取る)。
 * - `exec()` は複数文をまとめて実行できる (スキーマ適用用)。
 */
export class DurableObjectSqlDriver implements SqlDriver {
  readonly #storage: DurableObjectStorage;

  constructor(storage: DurableObjectStorage) {
    this.#storage = storage;
  }

  exec(sql: string): void {
    // 複数文を渡せるのはこの exec() のみ。戻り値 (カーソル) は使わないので捨ててよい。
    this.#storage.sql.exec(sql);
  }

  run(sql: string, ...params: SqlParam[]): void {
    // カーソルを最後まで読み切らないと実行が完了しない場合があるため toArray() で消費する。
    this.#storage.sql.exec(sql, ...params).toArray();
  }

  get<T = Record<string, unknown>>(sql: string, ...params: SqlParam[]): T | undefined {
    const rows = this.#storage.sql.exec(sql, ...params).toArray();
    return rows[0] as T | undefined;
  }

  all<T = Record<string, unknown>>(sql: string, ...params: SqlParam[]): T[] {
    return this.#storage.sql.exec(sql, ...params).toArray() as T[];
  }

  transaction<T>(fn: () => T): T {
    return this.#storage.transactionSync(fn);
  }
}
