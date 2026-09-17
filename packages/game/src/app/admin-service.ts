// tmp/08-turn-trigger-admin-cli.md 「管理機能」節の移植。
// Perl 版 Maintenance.pm (hako-mente.cgi) の各モードのユースケース化。
import type { BackupInfo, BackupStore, Clock, GameRepository } from "./ports.ts";
import type { TurnService } from "./turn-service.ts";
import type { GameConfig } from "../core/config.ts";

export interface AdminStatus {
  initialized: boolean;
  turn?: number;
  lastTime?: number;
  backups: BackupInfo[];
}

export interface AdminServiceDeps {
  repo: GameRepository;
  clock: Clock;
  config: GameConfig;
  backupStore: BackupStore;
  turnService: TurnService;
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
}
