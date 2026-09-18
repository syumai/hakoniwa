#!/usr/bin/env node
// tmp/08-turn-trigger-admin-cli.md 「CLI」節の移植。
// Perl 版 Maintenance.pm の各モードを CLI から叩けるようにする。
// `node dist/cli.js <command>` または root で `vp run --filter ./packages/server-node cli -- <command>`。
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { composeNode } from "./compose.ts";
import type { ComposedNode } from "./compose.ts";
import { loadNodeConfig } from "./config.ts";

/** テストから差し込める最小限の出力口。既定は console。 */
export interface CliIO {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

const defaultIO: CliIO = {
  // eslint 的には console 直呼びだが、CLI エントリポイントなので許容する。
  stdout: (line: string) => {
    console.log(line);
  },
  stderr: (line: string) => {
    console.error(line);
  },
};

/** 使い方に反する呼び出し (未知のコマンド、引数不足等)。終了コード 2。 */
class UsageError extends Error {}

const HELP_TEXT = `hakoniwa CLI

使い方: hakoniwa <command> [options]

コマンド:
  db init                新しいデータを作る
  db reset --yes         現役データを削除する (要 --yes)
                          ※ v1 (パスワード認証) の DB は v2 (better-auth) のスキーマと
                            互換性が無いため、v1 の DB ファイルを使い続けている場合は
                            このコマンドで一度リセットしてから db init してください。
  db status              現役データの状態を表示する
  turn check             期限が来ていればターンを進める
  turn advance           期限に関係なく強制的に 1 ターン進める
  time set <unix|ISO8601> 最終更新時間を変更する
  backup list            バックアップ一覧を表示する
  backup create [label]  バックアップを作成する (label 省略可)
  backup restore <label> バックアップを現役データへ復元する
  backup delete <label>  バックアップを削除する

  -h, --help             このヘルプを表示する

環境変数は @hakoniwa/game の loadConfigFromEnv と config.ts (HAKONIWA_DB_PATH 等) を参照する。
`;

/** unix 秒 (整数文字列) または ISO8601 文字列を unix 秒に変換する。 */
function parseUnixOrIso8601(raw: string): number {
  if (/^-?\d+$/.test(raw)) {
    return Number(raw);
  }
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) {
    throw new UsageError(`time set: unix 秒または ISO8601 形式で指定してください (got: ${raw})`);
  }
  return Math.floor(ms / 1000);
}

function requirePositional(positionals: string[], index: number, label: string): string {
  const value = positionals[index];
  if (value === undefined) {
    throw new UsageError(`${label} が指定されていません。`);
  }
  return value;
}

function formatTimestamp(unixSeconds: number): string {
  return `${new Date(unixSeconds * 1000).toISOString()} (${unixSeconds})`;
}

async function runDb(
  positionals: string[],
  values: { yes?: boolean },
  node: ComposedNode,
  io: CliIO,
): Promise<void> {
  const sub = requirePositional(positionals, 0, "db サブコマンド");
  switch (sub) {
    case "init": {
      node.adminService.initialize(Math.floor(Date.now() / 1000));
      io.stdout("新しいデータを作成しました。");
      return;
    }
    case "reset": {
      if (values.yes !== true) {
        throw new UsageError(
          "db reset は --yes を付けて実行してください (現役データを削除します)。",
        );
      }
      node.adminService.reset();
      io.stdout("現役データを削除しました。");
      return;
    }
    case "status": {
      const status = await node.adminService.status();
      if (!status.initialized) {
        io.stdout("状態: 未初期化");
      } else {
        const islandCount = node.repo.listIslandSummaries().length;
        io.stdout(`状態: 初期化済み`);
        io.stdout(`ターン: ${status.turn}`);
        io.stdout(`最終更新時間: ${formatTimestamp(status.lastTime ?? 0)}`);
        io.stdout(`島数: ${islandCount}`);
      }
      io.stdout(`バックアップ数: ${status.backups.length}`);
      for (const backup of status.backups) {
        io.stdout(
          `  - ${backup.label} (turn=${backup.turn}, createdAt=${formatTimestamp(backup.createdAt)})`,
        );
      }
      return;
    }
    default:
      throw new UsageError(`db: 未知のサブコマンドです: ${sub}`);
  }
}

async function runTurn(positionals: string[], node: ComposedNode, io: CliIO): Promise<void> {
  const sub = requirePositional(positionals, 0, "turn サブコマンド");
  const now = Math.floor(Date.now() / 1000);
  switch (sub) {
    case "check": {
      const count = node.turnService.advanceTurnIfDue(now);
      io.stdout(`${count} ターン進めました。`);
      return;
    }
    case "advance": {
      node.adminService.advanceTurn(now);
      io.stdout("ターンを進めました。");
      return;
    }
    default:
      throw new UsageError(`turn: 未知のサブコマンドです: ${sub}`);
  }
}

async function runTime(positionals: string[], node: ComposedNode, io: CliIO): Promise<void> {
  const sub = requirePositional(positionals, 0, "time サブコマンド");
  switch (sub) {
    case "set": {
      const raw = requirePositional(positionals, 1, "time set の日時");
      const unix = parseUnixOrIso8601(raw);
      node.adminService.setLastTime(unix);
      io.stdout(`最終更新時間を ${formatTimestamp(unix)} に変更しました。`);
      return;
    }
    default:
      throw new UsageError(`time: 未知のサブコマンドです: ${sub}`);
  }
}

async function runBackup(positionals: string[], node: ComposedNode, io: CliIO): Promise<void> {
  const sub = requirePositional(positionals, 0, "backup サブコマンド");
  switch (sub) {
    case "list": {
      const backups = await node.adminService.listBackups();
      if (backups.length === 0) {
        io.stdout("バックアップはありません。");
        return;
      }
      for (const backup of backups) {
        io.stdout(
          `${backup.label}\tturn=${backup.turn}\tcreatedAt=${formatTimestamp(backup.createdAt)}`,
        );
      }
      return;
    }
    case "create": {
      const label = positionals[1];
      await node.adminService.createBackup(label);
      io.stdout(`バックアップを作成しました。${label !== undefined ? `(${label})` : ""}`);
      return;
    }
    case "restore": {
      const label = requirePositional(positionals, 1, "backup restore のラベル");
      await node.adminService.restoreBackup(label);
      io.stdout(`バックアップ ${label} を現役データへ復元しました。`);
      return;
    }
    case "delete": {
      const label = requirePositional(positionals, 1, "backup delete のラベル");
      await node.adminService.deleteBackup(label);
      io.stdout(`バックアップ ${label} を削除しました。`);
      return;
    }
    default:
      throw new UsageError(`backup: 未知のサブコマンドです: ${sub}`);
  }
}

/**
 * CLI 本体。テストからは `dist/cli.js` を子プロセスで叩くのではなく、この関数を直接呼ぶ。
 * 戻り値は終了コード (成功 0、使い方誤り 2、失敗 1)。
 */
export async function runCli(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
  io: CliIO = defaultIO,
): Promise<number> {
  let values: { help?: boolean; yes?: boolean };
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: argv,
      options: {
        help: { type: "boolean", short: "h" },
        yes: { type: "boolean" },
      },
      allowPositionals: true,
    });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (err) {
    io.stderr(err instanceof Error ? err.message : String(err));
    io.stderr(HELP_TEXT);
    return 2;
  }

  if (values.help === true) {
    io.stdout(HELP_TEXT);
    return 0;
  }

  const command = positionals[0];
  if (command === undefined) {
    io.stderr(HELP_TEXT);
    return 2;
  }

  const rest = positionals.slice(1);

  let node: ComposedNode | undefined;
  try {
    const config = loadNodeConfig(env);
    node = composeNode(config);

    switch (command) {
      case "db":
        await runDb(rest, values, node, io);
        break;
      case "turn":
        await runTurn(rest, node, io);
        break;
      case "time":
        await runTime(rest, node, io);
        break;
      case "backup":
        await runBackup(rest, node, io);
        break;
      default:
        throw new UsageError(`未知のコマンドです: ${command}`);
    }
    return 0;
  } catch (err) {
    if (err instanceof UsageError) {
      io.stderr(err.message);
      return 2;
    }
    io.stderr(err instanceof Error ? err.message : String(err));
    return 1;
  } finally {
    node?.driver.close();
  }
}

// `node dist/cli.js ...` として直接実行された場合のみエントリポイントとして動く。
// テストからの import では実行されない (import.meta.url とエントリスクリプトの比較)。
const isMain = (() => {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  return import.meta.url === pathToFileURL(entry).href;
})();

if (isMain) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exit(code);
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
