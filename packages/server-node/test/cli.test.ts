// tmp/08-turn-trigger-admin-cli.md 「CLI」節、tmp/10-implementation-plan.md Phase 5 のテスト。
// 子プロセスで dist/cli.js を叩くのではなく、runCli(argv, env, io) を直接呼ぶ。
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.ts";
import type { CliIO } from "../src/cli.ts";

function createIO(): CliIO & { lines: string[]; errLines: string[] } {
  const lines: string[] = [];
  const errLines: string[] = [];
  return {
    lines,
    errLines,
    stdout: (line: string) => {
      lines.push(line);
    },
    stderr: (line: string) => {
      errLines.push(line);
    },
  };
}

describe("cli", () => {
  let dir: string;
  let env: Record<string, string | undefined>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hakoniwa-cli-test-"));
    env = {
      HAKONIWA_DB_PATH: join(dir, "hakoniwa.sqlite"),
      HAKONIWA_BACKUP_DIR: join(dir, "backups"),
    };
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("--help は使い方を表示して 0 を返す", async () => {
    const io = createIO();
    const code = await runCli(["--help"], env, io);
    expect(code).toBe(0);
    expect(io.lines.join("\n")).toContain("使い方: hakoniwa <command>");
  });

  it("引数なしは使い方を stderr に表示して 2 を返す", async () => {
    const io = createIO();
    const code = await runCli([], env, io);
    expect(code).toBe(2);
    expect(io.errLines.join("\n")).toContain("使い方: hakoniwa <command>");
  });

  it("未知のコマンドは 2 を返す", async () => {
    const io = createIO();
    const code = await runCli(["nosuch"], env, io);
    expect(code).toBe(2);
    expect(io.errLines.join("\n")).toContain("未知のコマンドです");
  });

  it("db status は未初期化なら「未初期化」を表示する", async () => {
    const io = createIO();
    const code = await runCli(["db", "status"], env, io);
    expect(code).toBe(0);
    expect(io.lines.join("\n")).toContain("未初期化");
  });

  it("db reset は --yes なしだと 2 を返す", async () => {
    const io = createIO();
    const code = await runCli(["db", "reset"], env, io);
    expect(code).toBe(2);
    expect(io.errLines.join("\n")).toContain("--yes");
  });

  it("db init → db status → turn advance → db status → backup create → backup list", async () => {
    const initIO = createIO();
    expect(await runCli(["db", "init"], env, initIO)).toBe(0);
    expect(initIO.lines.join("\n")).toContain("新しいデータを作成しました");

    const status1IO = createIO();
    expect(await runCli(["db", "status"], env, status1IO)).toBe(0);
    const status1 = status1IO.lines.join("\n");
    expect(status1).toContain("初期化済み");
    expect(status1).toContain("ターン: 1");
    expect(status1).toContain("島数: 0");

    const advanceIO = createIO();
    expect(await runCli(["turn", "advance"], env, advanceIO)).toBe(0);
    expect(advanceIO.lines.join("\n")).toContain("ターンを進めました");

    const status2IO = createIO();
    expect(await runCli(["db", "status"], env, status2IO)).toBe(0);
    expect(status2IO.lines.join("\n")).toContain("ターン: 2");

    const backupCreateIO = createIO();
    expect(await runCli(["backup", "create", "x"], env, backupCreateIO)).toBe(0);
    expect(backupCreateIO.lines.join("\n")).toContain("x");

    const backupListIO = createIO();
    expect(await runCli(["backup", "list"], env, backupListIO)).toBe(0);
    expect(backupListIO.lines.join("\n")).toContain("x");
  });

  it("turn check は期限が来ていなければ 0 ターンと表示する", async () => {
    await runCli(["db", "init"], env, createIO());
    const io = createIO();
    expect(await runCli(["turn", "check"], env, io)).toBe(0);
    expect(io.lines.join("\n")).toContain("0 ターン進めました");
  });

  it("time set は unix 秒指定で最終更新時間を変更する", async () => {
    await runCli(["db", "init"], env, createIO());
    const io = createIO();
    expect(await runCli(["time", "set", "1700000000"], env, io)).toBe(0);
    expect(io.lines.join("\n")).toContain("1700000000");
  });

  it("time set は ISO8601 指定でも最終更新時間を変更する", async () => {
    await runCli(["db", "init"], env, createIO());
    const io = createIO();
    expect(await runCli(["time", "set", "2024-01-01T00:00:00Z"], env, io)).toBe(0);
    expect(io.lines.join("\n")).toContain("1704067200");
  });

  it("time set に不正な値を渡すと 2 を返す", async () => {
    await runCli(["db", "init"], env, createIO());
    const io = createIO();
    expect(await runCli(["time", "set", "not-a-date"], env, io)).toBe(2);
  });

  it("backup restore は存在しないラベルなら 1 を返す", async () => {
    await runCli(["db", "init"], env, createIO());
    const io = createIO();
    const code = await runCli(["backup", "restore", "no-such-label"], env, io);
    expect(code).toBe(1);
    expect(io.errLines.length).toBeGreaterThan(0);
  });

  it("backup delete/restore ともにラベル省略時は 2 を返す", async () => {
    await runCli(["db", "init"], env, createIO());
    expect(await runCli(["backup", "restore"], env, createIO())).toBe(2);
    expect(await runCli(["backup", "delete"], env, createIO())).toBe(2);
  });
});
