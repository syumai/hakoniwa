// tmp/10-implementation-plan.md Phase 8、tmp/12-workers-adapter.md 「SqlDriver の DO 実装」節。
// 実 DO (SQLite backend) 上で DurableObjectSqlDriver の run/get/all/transaction を確認する。
// runInDurableObject で HakoniwaGame (main worker に定義済み) のストレージへ直接アクセスし、
// アプリのスキーマとは独立したテスト用テーブルを作って検証する。
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DurableObjectSqlDriver } from "../src/driver.ts";

function getStub(name: string) {
  const id = env.GAME.idFromName(name);
  return env.GAME.get(id);
}

describe("DurableObjectSqlDriver", () => {
  it("run/get/all で読み書きできる", async () => {
    const stub = getStub("driver-test-basic");
    await runInDurableObject(stub, async (_instance, state) => {
      const driver = new DurableObjectSqlDriver(state.storage);
      driver.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT) STRICT");
      driver.run("INSERT INTO t (id, v) VALUES (?, ?)", 1, "a");
      driver.run("INSERT INTO t (id, v) VALUES (?, ?)", 2, "b");

      expect(driver.get<{ id: number; v: string }>("SELECT * FROM t WHERE id = ?", 1)).toEqual({
        id: 1,
        v: "a",
      });
      expect(driver.all<{ id: number; v: string }>("SELECT * FROM t ORDER BY id")).toEqual([
        { id: 1, v: "a" },
        { id: 2, v: "b" },
      ]);
      expect(driver.get("SELECT * FROM t WHERE id = 999")).toBeUndefined();
    });
  });

  it("transaction はコミットすると変更が残る", async () => {
    const stub = getStub("driver-test-commit");
    await runInDurableObject(stub, async (_instance, state) => {
      const driver = new DurableObjectSqlDriver(state.storage);
      driver.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT) STRICT");
      driver.transaction(() => {
        driver.run("INSERT INTO t (id, v) VALUES (?, ?)", 1, "a");
      });
      expect(driver.all("SELECT * FROM t")).toHaveLength(1);
    });
  });

  it("transaction は fn 内で throw すると ROLLBACK される (transactionSync)", async () => {
    const stub = getStub("driver-test-rollback");
    await runInDurableObject(stub, async (_instance, state) => {
      const driver = new DurableObjectSqlDriver(state.storage);
      driver.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT) STRICT");
      driver.run("INSERT INTO t (id, v) VALUES (?, ?)", 1, "a");

      expect(() =>
        driver.transaction(() => {
          driver.run("INSERT INTO t (id, v) VALUES (?, ?)", 2, "b");
          throw new Error("boom");
        }),
      ).toThrow("boom");

      // トランザクション前の 1 行だけが残り、2 は追加されていない。
      expect(driver.all<{ id: number }>("SELECT * FROM t ORDER BY id").map((r) => r.id)).toEqual([
        1,
      ]);
    });
  });

  it("SELECT changes() で直前の UPDATE/INSERT の更新件数が取れる", async () => {
    const stub = getStub("driver-test-changes");
    await runInDurableObject(stub, async (_instance, state) => {
      const driver = new DurableObjectSqlDriver(state.storage);
      driver.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT) STRICT");
      driver.run("INSERT INTO t (id, v) VALUES (?, ?)", 1, "a");
      driver.run("UPDATE t SET v = ? WHERE id = ?", "z", 1);
      expect(driver.get<{ n: number }>("SELECT changes() AS n")).toEqual({ n: 1 });

      driver.run("UPDATE t SET v = ? WHERE id = ?", "z", 999);
      expect(driver.get<{ n: number }>("SELECT changes() AS n")).toEqual({ n: 0 });
    });
  });
});
