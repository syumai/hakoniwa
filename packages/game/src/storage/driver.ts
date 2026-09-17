// tmp/04-database.md 「SqlDriver」節の移植。
// Node (node:sqlite) / Workers (Durable Object の ctx.storage.sql) いずれも同期 API のため、
// この最小インターフェースで両者を吸収する。実装は各 Adapter (packages/server-*) が持つ。

/** SQLite にバインドできる値の型。boolean は呼び出し側で 0/1 に変換してから渡す。 */
export type SqlParam = number | string | null | Uint8Array;

export interface SqlDriver {
  /** 複数文を一括実行する (スキーマ適用用)。結果は返さない。 */
  exec(sql: string): void;
  run(sql: string, ...params: SqlParam[]): void;
  get<T = Record<string, unknown>>(sql: string, ...params: SqlParam[]): T | undefined;
  all<T = Record<string, unknown>>(sql: string, ...params: SqlParam[]): T[];
  /**
   * 同期トランザクション。fn 内で await しない (02-architecture.md の同期セクション規約)。
   * ネストしない。
   */
  transaction<T>(fn: () => T): T;
}
