// tmp/04-database.md 「SqlDriver」表の Node 実装。node:sqlite の DatabaseSync を使う。
import { DatabaseSync } from "node:sqlite";
import type { SqlDriver, SqlParam } from "@hakoniwa/game";

/** `node:sqlite` の `DatabaseSync` による `SqlDriver` 実装。 */
export class NodeSqliteDriver implements SqlDriver {
  readonly #path: string;
  #db: DatabaseSync;
  #closed = false;

  constructor(path: string) {
    this.#path = path;
    this.#db = new DatabaseSync(path);
  }

  exec(sql: string): void {
    this.#db.exec(sql);
  }

  run(sql: string, ...params: SqlParam[]): void {
    this.#db.prepare(sql).run(...params);
  }

  get<T = Record<string, unknown>>(sql: string, ...params: SqlParam[]): T | undefined {
    return this.#db.prepare(sql).get(...params) as T | undefined;
  }

  all<T = Record<string, unknown>>(sql: string, ...params: SqlParam[]): T[] {
    return this.#db.prepare(sql).all(...params) as T[];
  }

  transaction<T>(fn: () => T): T {
    this.#db.exec("BEGIN IMMEDIATE");
    let result: T;
    try {
      result = fn();
    } catch (err) {
      this.#db.exec("ROLLBACK");
      throw err;
    }
    this.#db.exec("COMMIT");
    return result;
  }

  /**
   * バックアップ復元用: 現在の接続を閉じ、同じパスで開き直す (FileBackupStore.restore から呼ばれる)。
   * `close()` 済み (restore がファイル置換前に閉じている場合) でも安全に呼べる。
   */
  reopen(): void {
    if (!this.#closed) {
      this.#db.close();
    }
    this.#db = new DatabaseSync(this.#path);
    this.#closed = false;
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    this.#db.close();
    this.#closed = true;
  }
}
