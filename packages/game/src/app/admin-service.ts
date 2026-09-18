// tmp/08-turn-trigger-admin-cli.md 「管理機能」節、tmp/14-users-auth.md
// 「ログイン方法の設定」節の移植。Perl 版 Maintenance.pm (hako-mente.cgi) の各モードのユースケース化。
import type { AuthMethodsFlags, AuthMethodPolicy } from "./auth-methods.ts";
import type { BackupInfo, BackupStore, Clock, GameRepository } from "./ports.ts";
import type { SeasonVM } from "./season.ts";
import { buildSeasonVM } from "./season.ts";
import type { TurnService } from "./turn-service.ts";
import type { GameConfig } from "../core/config.ts";

export interface AdminStatus {
  initialized: boolean;
  turn?: number;
  lastTime?: number;
  backups: BackupInfo[];
  /** 開始時刻・最終ターン・状態 (開始前/進行中/終了)。tmp/16-season.md。初期化済みのときのみ。 */
  season?: SeasonVM;
}

/** `AdminService.initialize` の追加オプション。tmp/16-season.md「設定の入口」節。 */
export interface AdminInitializeOptions {
  /** 省略時は従来どおり `now` を `unitTimeSec` で切り下げる。 */
  startAt?: number;
  /** 省略時 (または未指定) は無期限 (null)。 */
  finalTurn?: number | null;
  /**
   * 1 ターンの長さ (秒)。tmp/16-season.md「ターンの長さも DB に持つ (追加要件)」節。
   * 省略時は `config.unitTimeSec` (`HAKONIWA_UNIT_TIME_SEC`)。開始時刻の切り下げにもこの値を使う。
   */
  unitTimeSec?: number;
}

/** 管理画面のログイン方法設定 UI 向け VM。 */
export interface AuthMethodsVM {
  configured: AuthMethodsFlags;
  enabled: AuthMethodsFlags;
  /** true なら email は ConsoleMailer (開発用) で、本番設定 (Resend) はまだされていない。 */
  mailerIsConsole: boolean;
}

export interface AdminServiceDeps {
  repo: GameRepository;
  clock: Clock;
  config: GameConfig;
  backupStore: BackupStore;
  turnService: TurnService;
  authMethods: AuthMethodPolicy;
  mailerIsConsole: boolean;
}

/**
 * 設計書との差異: 08 の擬似コードは `status`/`listBackups`/`createBackup`/`restoreBackup`/
 * `deleteBackup` を同期シグネチャで示しているが、`BackupStore` (04-database.md) は
 * VACUUM INTO やブックマーク操作のため非同期である。ここでは実際に動く形として、
 * バックアップに触れるメソッドはすべて `Promise` を返す非同期メソッドにしている。
 * `initialize`/`reset`/`setLastTime`/`advanceTurn` は repo 操作のみなので同期のまま。
 */
export class AdminService {
  readonly #deps: AdminServiceDeps;

  constructor(deps: AdminServiceDeps) {
    this.#deps = deps;
  }

  async status(): Promise<AdminStatus> {
    const { repo, backupStore, clock } = this.#deps;
    const backups = await backupStore.list();
    if (!repo.isInitialized()) {
      return { initialized: false, backups };
    }
    const meta = repo.getMeta();
    const season = buildSeasonVM(meta, clock.now());
    return { initialized: true, turn: meta.turn, lastTime: meta.lastTime, backups, season };
  }

  /**
   * Perl 版 Maintenance.pm newMode の移植: turn=1, nextIslandId=1。
   * tmp/16-season.md「設定の入口」節: `startAt` 省略時は従来どおり `now` を `unitTimeSec` で
   * 切り下げる。`finalTurn` 省略時は無期限 (null)。
   * 「ターンの長さも DB に持つ (追加要件)」節: `unitTimeSec` 省略時は `config.unitTimeSec`
   * (`HAKONIWA_UNIT_TIME_SEC`)。開始時刻の切り下げにもこの値を使う。
   */
  initialize(now: number, options: AdminInitializeOptions = {}): void {
    const { repo, config } = this.#deps;
    const unitTimeSec = options.unitTimeSec ?? config.unitTimeSec;
    const lastTime = options.startAt ?? now - (now % unitTimeSec);
    const finalTurn = options.finalTurn ?? null;
    repo.transaction(() => {
      repo.reset();
      // startAt はターン1の lastTime と同じ値で初期化する (16「開始時刻」の定義)。
      repo.initialize({
        turn: 1,
        lastTime,
        nextIslandId: 1,
        finalTurn,
        startAt: lastTime,
        unitTimeSec,
      });
    });
  }

  /** Perl 版 Maintenance.pm deleteMode (ID 指定なし = 現役データ削除) の移植。 */
  reset(): void {
    this.#deps.repo.reset();
  }

  /**
   * Perl 版 Maintenance.pm timeMode/stimeMode の移植。unix 秒を直接設定する。
   * tmp/16-season.md「設定の入口」節: ターン1の間は最終更新時刻の変更が開始時刻の変更と同義なので
   * `startAt` も追従させる。ターン2以降は `startAt` を変えない (開始済みの記録として固定する)。
   */
  setLastTime(unix: number): void {
    const { repo } = this.#deps;
    repo.transaction(() => {
      const meta = repo.getMeta();
      const startAt = meta.turn === 1 ? unix : meta.startAt;
      repo.saveMeta({ ...meta, lastTime: unix, startAt });
    });
  }

  /**
   * 最終ターン数の変更。tmp/16-season.md「設定の入口」節 (管理画面「ゲーム設定」/ CLI
   * `game set-final-turn`)。null で無期限に戻せる。
   */
  setFinalTurn(finalTurn: number | null): void {
    const { repo } = this.#deps;
    repo.transaction(() => {
      const meta = repo.getMeta();
      repo.saveMeta({ ...meta, finalTurn });
    });
  }

  /**
   * 1 ターンの長さ (秒) の変更。tmp/16-season.md「ターンの長さも DB に持つ (追加要件)」節
   * (管理画面「ゲーム設定」/ CLI `game set-unit-time`)。`lastTime` は変えないため、変更は
   * 次のターン境界 (`lastTime + 新しい値`) から効く。
   */
  setUnitTimeSec(unitTimeSec: number): void {
    if (!Number.isInteger(unitTimeSec) || unitTimeSec < 1) {
      throw new Error(
        `AdminService.setUnitTimeSec: must be a positive integer (got: ${unitTimeSec})`,
      );
    }
    const { repo } = this.#deps;
    repo.transaction(() => {
      const meta = repo.getMeta();
      repo.saveMeta({ ...meta, unitTimeSec });
    });
  }

  async listBackups(): Promise<BackupInfo[]> {
    return this.#deps.backupStore.list();
  }

  async createBackup(label?: string): Promise<void> {
    const meta = this.#deps.repo.getMeta();
    const finalLabel = label ?? `manual-${meta.turn}-${this.#deps.clock.now()}`;
    await this.#deps.backupStore.create(finalLabel, meta.turn);
  }

  /** Perl 版 Maintenance.pm currentMode の移植。 */
  async restoreBackup(label: string): Promise<void> {
    await this.#deps.backupStore.restore(label);
  }

  /** Perl 版 Maintenance.pm deleteMode (ID 指定あり) の移植。 */
  async deleteBackup(label: string): Promise<void> {
    await this.#deps.backupStore.delete(label);
  }

  /** 手動でのターン進行。TurnService に委譲する。 */
  advanceTurn(now: number): void {
    this.#deps.turnService.advanceTurn(now);
  }

  /**
   * 資金・食料を最大化する。tmp/14-users-auth.md「決定事項」6: 特殊パスワードの代わりに
   * 管理画面の操作として残したもの。
   */
  maximizeIsland(id: number): void {
    const { repo } = this.#deps;
    repo.transaction(() => {
      const island = repo.findIsland(id);
      if (island === undefined) {
        throw new Error(`AdminService.maximizeIsland: island not found: ${id}`);
      }
      island.money = 9999;
      island.food = 9999;
      repo.updateIsland(island);
    });
  }

  /** ログイン方法 (X/Discord/メール) の設定済み・有効状態。管理画面のトグル表示用。 */
  getAuthMethods(): AuthMethodsVM {
    const { authMethods, mailerIsConsole } = this.#deps;
    return {
      configured: authMethods.configured(),
      enabled: authMethods.enabled(),
      mailerIsConsole,
    };
  }

  /** 管理画面からのログイン方法 ON/OFF 切り替え。 */
  setAuthMethods(methods: AuthMethodsFlags): void {
    this.#deps.authMethods.setEnabled(methods);
  }
}
