// tmp/12-workers-adapter.md 「SqlDriver の DO 実装」節の骨子。
// 型定義のみ。各メソッドの実装は次フェーズで行う。
// @cloudflare/workers-types・cloudflare:workers は依存に追加せず、この骨子が必要とする
// 最小限の型をローカルに定義する (Durable Object の実際の型と構造互換であれば足りる)。
import type { SqlDriver, SqlParam } from "@hakoniwa/game";

/** `ctx.storage.sql.exec()` が返すカーソルのうち、この骨子が使う部分だけのローカル型。 */
export interface DurableObjectSqlCursorLike {
  toArray(): unknown[];
  readonly rowsWritten: number;
}

/** `ctx.storage.sql` のローカル型。 */
export interface DurableObjectSqlStorageLike {
  exec(query: string, ...bindings: unknown[]): DurableObjectSqlCursorLike;
}

/** `ctx.storage` のうち、この骨子が使う部分だけのローカル型。 */
export interface DurableObjectStorageLike {
  sql: DurableObjectSqlStorageLike;
  transactionSync<T>(fn: () => T): T;
}

/**
 * tmp/12-workers-adapter.md 「SqlDriver の DO 実装」の骨子。
 *
 * 実装時の注意点 (12 参照):
 * - `sql.exec` に `BEGIN`/`COMMIT` を渡せないため、`transaction` は `transactionSync` を使う
 *   (Node 版 `NodeSqliteDriver` の `BEGIN IMMEDIATE` とは異なる)。
 * - `tryBumpTurn` の更新件数は `rowsWritten` ではなく `run()` の後に
 *   `get('SELECT changes() AS n')` で取る方が両実装で確実。
 *
 * 実装は次フェーズ。各メソッドは骨子として `not implemented` を投げる。
 */
export class DurableObjectSqlDriver implements SqlDriver {
  constructor(private readonly storage: DurableObjectStorageLike) {}

  exec(_sql: string): void {
    throw new Error("not implemented");
  }

  run(_sql: string, ..._params: SqlParam[]): void {
    throw new Error("not implemented");
  }

  get<T = Record<string, unknown>>(_sql: string, ..._params: SqlParam[]): T | undefined {
    throw new Error("not implemented");
  }

  all<T = Record<string, unknown>>(_sql: string, ..._params: SqlParam[]): T[] {
    throw new Error("not implemented");
  }

  transaction<T>(_fn: () => T): T {
    throw new Error("not implemented");
  }
}
