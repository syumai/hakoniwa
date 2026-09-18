// tmp/08-turn-trigger-admin-cli.md 「管理機能」節、tmp/14-users-auth.md
// 「ログイン方法の設定」節の移植。Perl 版 Maintenance.pm (hako-mente.cgi) の各モードのユースケース化。
import type { AuthMethodsFlags, AuthMethodPolicy } from "./auth-methods.ts";
import type { BackupInfo, BackupStore, Clock, GameRepository } from "./ports.ts";
import type { TurnService } from "./turn-service.ts";
import type { GameConfig } from "../core/config.ts";

export interface AdminStatus {
  initialized: boolean;
  turn?: number;
  lastTime?: number;
  backups: BackupInfo[];
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
    const { repo, backupStore } = this.#deps;
    const backups = await backupStore.list();
    if (!repo.isInitialized()) {
      return { initialized: false, backups };
    }
    const meta = repo.getMeta();
    return { initialized: true, turn: meta.turn, lastTime: meta.lastTime, backups };
  }

  /** Perl 版 Maintenance.pm newMode の移植: turn=1, lastTime を unitTimeSec で切り下げ, nextIslandId=1。 */
  initialize(now: number): void {
    const { repo, config } = this.#deps;
    const lastTime = now - (now % config.unitTimeSec);
    repo.transaction(() => {
      repo.reset();
      repo.initialize({ turn: 1, lastTime, nextIslandId: 1 });
    });
  }

  /** Perl 版 Maintenance.pm deleteMode (ID 指定なし = 現役データ削除) の移植。 */
  reset(): void {
    this.#deps.repo.reset();
  }

  /** Perl 版 Maintenance.pm timeMode/stimeMode の移植。unix 秒を直接設定する。 */
  setLastTime(unix: number): void {
    const { repo } = this.#deps;
    repo.transaction(() => {
      const meta = repo.getMeta();
      repo.saveMeta({ ...meta, lastTime: unix });
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
