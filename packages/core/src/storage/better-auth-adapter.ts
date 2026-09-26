// tmp/14-users-auth.md 「カスタム DB アダプタ」節の移植。
// better-auth の `createAdapterFactory` (`better-auth/adapters`) に `SqlDriver` (自前の
// run/get/all ベースの同期 SQLite 抽象) を載せる。better-auth 自体はブラウザ/Workers でも
// 動く Web 標準 API のみに依存するため、このファイルも node:* に依存しない。
//
// better-auth の内部実装 (createAdapterFactory) は各操作の呼び出し前に:
// - `model` を物理テーブル名 (デフォルトはスキーマのキーそのまま。今回は user/session/account/
//   verification のみで modelName のカスタマイズはしていないので、物理名 = 論理名)。
// - `where`/`data`/`update` の各フィールド名を物理カラム名 (デフォルトはフィールドキーそのまま。
//   すべて camelCase) に変換済みで渡してくる。
// - `config.supportsDates/supportsBooleans/supportsJSON` をすべて false にしているため、
//   日付は ISO 文字列、真偽値は 0/1 に変換済みで渡ってくる (このアダプタ側での変換は不要)。
// ため、このアダプタは「渡された model/where/data をそのまま SQL に落とす」だけでよい。
import { createAdapterFactory } from "better-auth/adapters";
import type { CleanedWhere, CustomAdapter } from "better-auth/adapters";
import type { SqlDriver, SqlParam } from "./driver.ts";

/** 識別子 (テーブル名・列名) を `"` で引用する。二重引用符自体は `""` にエスケープする。 */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** LIKE 用にワイルドカード文字 (`%`, `_`, `\`) をエスケープする。 */
function escapeLikeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * better-auth からは Date/boolean が渡らない設定 (supportsDates/supportsBooleans: false) だが、
 * 型上は残っているため防御的に変換する。
 */
function toParam(value: unknown): SqlParam {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (value === undefined) {
    return null;
  }
  return value as SqlParam;
}

function asScalarArray(value: CleanedWhere["value"]): SqlParam[] {
  if (!Array.isArray(value)) {
    throw new Error(`better-auth-adapter: expected an array for in/not_in, got ${typeof value}`);
  }
  return value.map(toParam);
}

/** 1 つの `CleanedWhere` を `column <op> ?` 形式の SQL 片とバインド値に変換する。 */
function buildCondition(w: CleanedWhere): { sql: string; params: SqlParam[] } {
  const col = quoteIdent(w.field);
  const insensitive = w.mode === "insensitive";
  // `CleanedWhere` (`Required<Where>`) は `operator` を必須キーにするだけで、
  // 型上の `| undefined` までは除去しない (`Where.operator?: WhereOperator | undefined`)。
  // 実際は better-auth 側で未指定時に "eq" 扱いされるため、ここでも同様に既定する。
  const operator = w.operator ?? "eq";

  switch (operator) {
    case "eq":
      if (w.value === null) {
        return { sql: `${col} IS NULL`, params: [] };
      }
      return insensitive
        ? { sql: `LOWER(${col}) = LOWER(?)`, params: [toParam(w.value)] }
        : { sql: `${col} = ?`, params: [toParam(w.value)] };
    case "ne":
      if (w.value === null) {
        return { sql: `${col} IS NOT NULL`, params: [] };
      }
      return insensitive
        ? { sql: `LOWER(${col}) <> LOWER(?)`, params: [toParam(w.value)] }
        : { sql: `${col} <> ?`, params: [toParam(w.value)] };
    case "lt":
      return { sql: `${col} < ?`, params: [toParam(w.value)] };
    case "lte":
      return { sql: `${col} <= ?`, params: [toParam(w.value)] };
    case "gt":
      return { sql: `${col} > ?`, params: [toParam(w.value)] };
    case "gte":
      return { sql: `${col} >= ?`, params: [toParam(w.value)] };
    case "in": {
      const values = asScalarArray(w.value);
      if (values.length === 0) {
        return { sql: "0 = 1", params: [] };
      }
      return { sql: `${col} IN (${values.map(() => "?").join(", ")})`, params: values };
    }
    case "not_in": {
      const values = asScalarArray(w.value);
      if (values.length === 0) {
        return { sql: "1 = 1", params: [] };
      }
      return { sql: `${col} NOT IN (${values.map(() => "?").join(", ")})`, params: values };
    }
    case "contains":
      return buildLikeCondition(col, `%${escapeLikeValue(String(w.value))}%`, insensitive);
    case "starts_with":
      return buildLikeCondition(col, `${escapeLikeValue(String(w.value))}%`, insensitive);
    case "ends_with":
      return buildLikeCondition(col, `%${escapeLikeValue(String(w.value))}`, insensitive);
    default: {
      const exhaustive: never = operator;
      throw new Error(`better-auth-adapter: unsupported operator: ${String(exhaustive)}`);
    }
  }
}

function buildLikeCondition(
  col: string,
  pattern: string,
  insensitive: boolean,
): { sql: string; params: SqlParam[] } {
  const target = insensitive ? `LOWER(${col})` : col;
  const value = insensitive ? pattern.toLowerCase() : pattern;
  return { sql: `${target} LIKE ? ESCAPE '\\'`, params: [value] };
}

/** `CleanedWhere[]` → `WHERE ...` 句 (先頭が空なら空文字列)。AND/OR は各要素の connector で連結する。 */
function buildWhereSql(where: readonly CleanedWhere[]): { sql: string; params: SqlParam[] } {
  if (where.length === 0) {
    return { sql: "", params: [] };
  }
  const clauses: string[] = [];
  const params: SqlParam[] = [];
  where.forEach((w, index) => {
    const condition = buildCondition(w);
    clauses.push(index === 0 ? condition.sql : `${w.connector} ${condition.sql}`);
    params.push(...condition.params);
  });
  return { sql: `WHERE ${clauses.join(" ")}`, params };
}

function buildSelectSql(select: readonly string[] | undefined): string {
  return select !== undefined && select.length > 0 ? select.map(quoteIdent).join(", ") : "*";
}

/**
 * `SqlDriver` に載せる better-auth 用カスタムアダプタ。Node (`node:sqlite`) / Durable Object
 * (`ctx.storage.sql`) どちらの `SqlDriver` 実装でも動く (このファイル自体は同期 API を async で
 * 包むだけで、ランタイム固有の処理を持たない)。
 */
export function betterAuthSqliteAdapter(input: { driver: SqlDriver }) {
  const { driver } = input;

  return createAdapterFactory({
    config: {
      adapterId: "hakoniwa-sqlite",
      adapterName: "Hakoniwa SQLite Adapter",
      supportsNumericIds: false,
      supportsDates: false,
      supportsBooleans: false,
      supportsJSON: false,
      transaction: false,
    },
    adapter: (): CustomAdapter => ({
      create: async ({ model, data }) => {
        const record = data as Record<string, unknown>;
        const keys = Object.keys(record);
        const columns = keys.map(quoteIdent).join(", ");
        const placeholders = keys.map(() => "?").join(", ");
        const values = keys.map((k) => toParam(record[k]));
        const row = driver.get(
          `INSERT INTO ${quoteIdent(model)} (${columns}) VALUES (${placeholders}) RETURNING *`,
          ...values,
        );
        return row as never;
      },

      findOne: async ({ model, where, select }) => {
        const { sql: whereSql, params } = buildWhereSql(where);
        const row = driver.get(
          `SELECT ${buildSelectSql(select)} FROM ${quoteIdent(model)} ${whereSql} LIMIT 1`,
          ...params,
        );
        return (row ?? null) as never;
      },

      findMany: async ({ model, where, limit, select, sortBy, offset }) => {
        const { sql: whereSql, params } = buildWhereSql(where ?? []);
        const orderSql =
          sortBy !== undefined
            ? ` ORDER BY ${quoteIdent(sortBy.field)} ${sortBy.direction === "desc" ? "DESC" : "ASC"}`
            : "";
        const offsetSql = offset !== undefined ? " OFFSET ?" : "";
        const sql = `SELECT ${buildSelectSql(select)} FROM ${quoteIdent(model)} ${whereSql}${orderSql} LIMIT ?${offsetSql}`;
        const allParams: SqlParam[] =
          offset !== undefined ? [...params, limit, offset] : [...params, limit];
        return driver.all(sql, ...allParams) as never;
      },

      update: async ({ model, where, update }) => {
        const record = update as Record<string, unknown>;
        const keys = Object.keys(record);
        const { sql: whereSql, params } = buildWhereSql(where);
        if (keys.length === 0) {
          const row = driver.get(
            `SELECT * FROM ${quoteIdent(model)} ${whereSql} LIMIT 1`,
            ...params,
          );
          return (row ?? null) as never;
        }
        const setSql = keys.map((k) => `${quoteIdent(k)} = ?`).join(", ");
        const setValues = keys.map((k) => toParam(record[k]));
        const row = driver.get(
          `UPDATE ${quoteIdent(model)} SET ${setSql} ${whereSql} RETURNING *`,
          ...setValues,
          ...params,
        );
        return (row ?? null) as never;
      },

      updateMany: async ({ model, where, update }) => {
        const record = update as Record<string, unknown>;
        const keys = Object.keys(record);
        const { sql: whereSql, params } = buildWhereSql(where);
        if (keys.length === 0) {
          const rows = driver.all(`SELECT 1 AS n FROM ${quoteIdent(model)} ${whereSql}`, ...params);
          return rows.length;
        }
        const setSql = keys.map((k) => `${quoteIdent(k)} = ?`).join(", ");
        const setValues = keys.map((k) => toParam(record[k]));
        const rows = driver.all(
          `UPDATE ${quoteIdent(model)} SET ${setSql} ${whereSql} RETURNING 1 AS n`,
          ...setValues,
          ...params,
        );
        return rows.length;
      },

      delete: async ({ model, where }) => {
        const { sql: whereSql, params } = buildWhereSql(where);
        driver.run(`DELETE FROM ${quoteIdent(model)} ${whereSql}`, ...params);
      },

      deleteMany: async ({ model, where }) => {
        const { sql: whereSql, params } = buildWhereSql(where);
        const rows = driver.all(
          `DELETE FROM ${quoteIdent(model)} ${whereSql} RETURNING 1 AS n`,
          ...params,
        );
        return rows.length;
      },

      // 単一行の原子的な consume (削除して返す)。同一プロセス内の同期 SqlDriver に対する
      // 単発の DELETE ... RETURNING なので、rowid のサブクエリで対象を 1 行に絞ってから消す。
      consumeOne: async ({ model, where }) => {
        const { sql: whereSql, params } = buildWhereSql(where);
        const row = driver.get(
          `DELETE FROM ${quoteIdent(model)}
           WHERE rowid = (SELECT rowid FROM ${quoteIdent(model)} ${whereSql} LIMIT 1)
           RETURNING *`,
          ...params,
        );
        return (row ?? null) as never;
      },

      // 単一行の原子的な増減 (where はガードも兼ねる)。
      incrementOne: async ({ model, where, increment, set }) => {
        const { sql: whereSql, params } = buildWhereSql(where);
        const incKeys = Object.keys(increment);
        const incValues = incKeys.map((k) => toParam(increment[k]));
        const setRecord = (set ?? {}) as Record<string, unknown>;
        const setKeys = Object.keys(setRecord);
        const setValues = setKeys.map((k) => toParam(setRecord[k]));
        const assignments = [
          ...incKeys.map((k) => `${quoteIdent(k)} = ${quoteIdent(k)} + ?`),
          ...setKeys.map((k) => `${quoteIdent(k)} = ?`),
        ].join(", ");
        const row = driver.get(
          `UPDATE ${quoteIdent(model)} SET ${assignments}
           WHERE rowid = (SELECT rowid FROM ${quoteIdent(model)} ${whereSql} LIMIT 1)
           RETURNING *`,
          ...incValues,
          ...setValues,
          ...params,
        );
        return (row ?? null) as never;
      },

      count: async ({ model, where }) => {
        const { sql: whereSql, params } = buildWhereSql(where ?? []);
        const row = driver.get<{ n: number }>(
          `SELECT COUNT(*) AS n FROM ${quoteIdent(model)} ${whereSql}`,
          ...params,
        );
        return row?.n ?? 0;
      },

      options: {},
    }),
  });
}
