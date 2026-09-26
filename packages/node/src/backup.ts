// tmp/04-database.md 「バックアップ」節、Node 実装 (VACUUM INTO によるファイルバックアップ)。
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { BackupInfo, BackupStore } from "@hakoniwajs/core";
import type { NodeSqliteDriver } from "./driver.ts";

const LABEL_PATTERN = /^[A-Za-z0-9_-]+$/;
const SQLITE_EXT = ".sqlite";
const META_EXT = ".json";

interface BackupMetaFile {
  turn: number;
  createdAt: number;
}

/**
 * `VACUUM INTO` によるファイルバックアップ。
 * メタ情報 (turn, createdAt) は `<label>.json` に隣接して保存する。
 */
export class FileBackupStore implements BackupStore {
  readonly #dbPath: string;
  readonly #backupDir: string;
  readonly #driver: NodeSqliteDriver;

  constructor(dbPath: string, backupDir: string, driver: NodeSqliteDriver) {
    this.#dbPath = dbPath;
    this.#backupDir = backupDir;
    this.#driver = driver;
    mkdirSync(backupDir, { recursive: true });
  }

  #validateLabel(label: string): void {
    if (!LABEL_PATTERN.test(label)) {
      throw new Error(`FileBackupStore: invalid label: ${JSON.stringify(label)}`);
    }
  }

  #dbFilePath(label: string): string {
    return join(this.#backupDir, `${label}${SQLITE_EXT}`);
  }

  #metaFilePath(label: string): string {
    return join(this.#backupDir, `${label}${META_EXT}`);
  }

  async list(): Promise<BackupInfo[]> {
    if (!existsSync(this.#backupDir)) {
      return [];
    }
    const infos: BackupInfo[] = [];
    for (const file of readdirSync(this.#backupDir)) {
      if (!file.endsWith(SQLITE_EXT)) {
        continue;
      }
      const label = file.slice(0, -SQLITE_EXT.length);
      const metaPath = this.#metaFilePath(label);
      if (!existsSync(metaPath)) {
        continue;
      }
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as BackupMetaFile;
      infos.push({ label, turn: meta.turn, createdAt: meta.createdAt });
    }
    infos.sort((a, b) => b.createdAt - a.createdAt);
    return infos;
  }

  async create(label: string, turn: number): Promise<void> {
    this.#validateLabel(label);
    // label は [A-Za-z0-9_-]+ に制限済みなので単一引用符は含まれ得ないが、念のためエスケープする。
    const escapedPath = this.#dbFilePath(label).replace(/'/g, "''");
    this.#driver.exec(`VACUUM INTO '${escapedPath}'`);
    const meta: BackupMetaFile = { turn, createdAt: Math.floor(Date.now() / 1000) };
    writeFileSync(this.#metaFilePath(label), JSON.stringify(meta));
  }

  async restore(label: string): Promise<void> {
    this.#validateLabel(label);
    const backupPath = this.#dbFilePath(label);
    if (!existsSync(backupPath)) {
      throw new Error(`FileBackupStore: backup not found: ${label}`);
    }
    // ファイル置換の前に接続を閉じておく (reopen() は close 済みでも安全に呼べる)。
    this.#driver.close();
    const beforeRestorePath = `${this.#dbPath}.before-restore`;
    if (existsSync(this.#dbPath)) {
      if (existsSync(beforeRestorePath)) {
        rmSync(beforeRestorePath);
      }
      renameSync(this.#dbPath, beforeRestorePath);
    }
    mkdirSync(dirname(this.#dbPath), { recursive: true });
    copyFileSync(backupPath, this.#dbPath);
    this.#driver.reopen();
  }

  async delete(label: string): Promise<void> {
    this.#validateLabel(label);
    const dbFile = this.#dbFilePath(label);
    if (existsSync(dbFile)) {
      rmSync(dbFile);
    }
    const metaFile = this.#metaFilePath(label);
    if (existsSync(metaFile)) {
      rmSync(metaFile);
    }
  }

  async rotate(keep: number): Promise<void> {
    const infos = await this.list();
    for (const info of infos.slice(keep)) {
      await this.delete(info.label);
    }
  }
}
