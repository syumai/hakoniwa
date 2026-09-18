// テスト用のインメモリ実装群。
// `packages/game` 自身のテストに加え、`packages/server-node` の web 層テスト (Phase 3b) でも
// 使い回すため、テストファイルではなく src 直下に置く (index.ts から re-export する)。
import type {
  BackupInfo,
  BackupStore,
  Clock,
  GameMeta,
  GameRepository,
  IslandSummary,
  ListLogsQuery,
  Logger,
  Mailer,
  SettingsRepository,
  UserPrefs,
} from "./ports.ts";
import type { HistoryEntry, Island, LbbsPost, LogEntry } from "../core/types.ts";

function cloneIsland(island: Island): Island {
  return {
    ...island,
    prize: { ...island.prize, turns: [...island.prize.turns] },
    terrain: island.terrain.clone(),
    commands: island.commands.map((command) => ({ ...command })),
    lbbs: island.lbbs.map((post) => ({ ...post })),
  };
}

function toSummary(island: Island): IslandSummary {
  return {
    id: island.id,
    name: island.name,
    ownerUserId: island.ownerUserId,
    comment: island.comment,
    score: island.score,
    absent: island.absent,
    money: island.money,
    food: island.food,
    pop: island.pop,
    area: island.area,
    farm: island.farm,
    factory: island.factory,
    mountain: island.mountain,
    prize: { ...island.prize, turns: [...island.prize.turns] },
  };
}

/**
 * `GameRepository` のインメモリ実装。
 * `transaction` は同期的に渡された関数をそのまま実行するだけ (実 DB のような
 * ロールバックは行わない。テストでは基本的に例外系は「repo の状態を変更しないまま throw する」
 * ように呼び出し側 (game-service 等) が事前検証してから書き込む設計になっているため問題ない)。
 */
export class FakeGameRepository implements GameRepository {
  #meta: GameMeta | undefined;
  #islands = new Map<number, Island>();
  /** rank 昇順の island id 一覧。 */
  #order: number[] = [];
  #logs: LogEntry[] = [];
  #history: HistoryEntry[] = [];
  #userPrefs = new Map<string, UserPrefs>();

  transaction<T>(fn: () => T): T {
    return fn();
  }

  isInitialized(): boolean {
    return this.#meta !== undefined;
  }

  getMeta(): GameMeta {
    if (this.#meta === undefined) {
      throw new Error("FakeGameRepository: not initialized");
    }
    return { ...this.#meta };
  }

  saveMeta(meta: GameMeta): void {
    this.#meta = { ...meta };
  }

  tryBumpTurn(expectedTurn: number, next: GameMeta): boolean {
    if (this.#meta === undefined || this.#meta.turn !== expectedTurn) {
      return false;
    }
    this.#meta = { ...next };
    return true;
  }

  listIslandSummaries(): IslandSummary[] {
    return this.#order.map((id) => toSummary(this.#mustGet(id)));
  }

  loadAllIslands(): Island[] {
    return this.#order.map((id) => cloneIsland(this.#mustGet(id)));
  }

  findIsland(id: number): Island | undefined {
    const island = this.#islands.get(id);
    return island === undefined ? undefined : cloneIsland(island);
  }

  findIslandByName(name: string): IslandSummary | undefined {
    for (const id of this.#order) {
      const island = this.#mustGet(id);
      if (island.name === name) {
        return toSummary(island);
      }
    }
    return undefined;
  }

  findIslandByOwner(userId: string): IslandSummary | undefined {
    for (const id of this.#order) {
      const island = this.#mustGet(id);
      if (island.ownerUserId === userId) {
        return toSummary(island);
      }
    }
    return undefined;
  }

  insertIsland(island: Island, rank: number): void {
    this.#islands.set(island.id, cloneIsland(island));
    const index = Math.max(0, Math.min(rank, this.#order.length));
    this.#order.splice(index, 0, island.id);
  }

  updateIsland(island: Island): void {
    if (!this.#islands.has(island.id)) {
      throw new Error(`FakeGameRepository: island not found: ${island.id}`);
    }
    this.#islands.set(island.id, cloneIsland(island));
  }

  replaceAllIslands(islands: Island[]): void {
    this.#islands = new Map(islands.map((island) => [island.id, cloneIsland(island)]));
    this.#order = islands.map((island) => island.id);
  }

  deleteIsland(id: number): void {
    this.#islands.delete(id);
    this.#order = this.#order.filter((existing) => existing !== id);
  }

  replaceLbbs(islandId: number, posts: LbbsPost[]): void {
    const island = this.#mustGet(islandId);
    island.lbbs = posts.map((post) => ({ ...post }));
  }

  appendLogs(entries: LogEntry[]): void {
    for (const entry of entries) {
      this.#logs.push({ ...entry });
    }
  }

  listLogs(q: ListLogsQuery): LogEntry[] {
    return this.#logs
      .filter((entry) => entry.turn >= q.sinceTurn)
      .filter((entry) => {
        if (q.islandId === undefined) {
          return true;
        }
        return entry.islandId === q.islandId || entry.targetId === q.islandId;
      })
      .filter((entry) => {
        if (!entry.secret) {
          return true;
        }
        return q.includeSecretFor !== undefined && entry.islandId === q.includeSecretFor;
      })
      .sort((a, b) => b.turn - a.turn || a.seq - b.seq)
      .map((entry) => ({ ...entry }));
  }

  deleteLogsBefore(turn: number): void {
    this.#logs = this.#logs.filter((entry) => entry.turn >= turn);
  }

  appendHistory(entries: HistoryEntry[]): void {
    for (const entry of entries) {
      this.#history.push({ ...entry });
    }
  }

  listHistory(limit: number): HistoryEntry[] {
    return [...this.#history]
      .reverse()
      .slice(0, limit)
      .map((entry) => ({ ...entry }));
  }

  trimHistory(keep: number): void {
    this.#history = this.#history.slice(Math.max(0, this.#history.length - keep));
  }

  initialize(meta: GameMeta): void {
    this.#meta = { ...meta };
  }

  reset(): void {
    this.#meta = undefined;
    this.#islands = new Map();
    this.#order = [];
    this.#logs = [];
    this.#history = [];
  }

  getUserPrefs(userId: string): UserPrefs | undefined {
    const prefs = this.#userPrefs.get(userId);
    return prefs === undefined ? undefined : { ...prefs };
  }

  setUserPrefs(userId: string, prefs: UserPrefs): void {
    this.#userPrefs.set(userId, { ...prefs });
  }

  #mustGet(id: number): Island {
    const island = this.#islands.get(id);
    if (island === undefined) {
      throw new Error(`FakeGameRepository: island not found: ${id}`);
    }
    return island;
  }
}

/** 値を固定し、`set` で明示的にしか進まないテスト用時計。 */
export class FakeClock implements Clock {
  #current: number;

  constructor(initial: number) {
    this.#current = initial;
  }

  now(): number {
    return this.#current;
  }

  set(value: number): void {
    this.#current = value;
  }

  advance(deltaSeconds: number): void {
    this.#current += deltaSeconds;
  }
}

/** テスト用のインメモリバックアップストア。 */
export class FakeBackupStore implements BackupStore {
  readonly items: BackupInfo[] = [];

  async list(): Promise<BackupInfo[]> {
    return [...this.items];
  }

  async create(label: string, turn: number): Promise<void> {
    this.items.push({ label, createdAt: 0, turn });
  }

  async restore(label: string): Promise<void> {
    if (!this.items.some((backup) => backup.label === label)) {
      throw new Error(`FakeBackupStore: backup not found: ${label}`);
    }
  }

  async delete(label: string): Promise<void> {
    const index = this.items.findIndex((backup) => backup.label === label);
    if (index !== -1) {
      this.items.splice(index, 1);
    }
  }

  async rotate(keep: number): Promise<void> {
    while (this.items.length > keep) {
      this.items.shift();
    }
  }
}

/** テスト用のインメモリ設定リポジトリ。 */
export class FakeSettingsRepository implements SettingsRepository {
  #store = new Map<string, string>();

  get(key: string): string | undefined {
    return this.#store.get(key);
  }

  set(key: string, value: string): void {
    this.#store.set(key, value);
  }
}

/** 送信内容を記録するだけのテスト用メーラー。 */
export class FakeMailer implements Mailer {
  readonly sent: Array<{ to: string; subject: string; text: string }> = [];

  async send(mail: { to: string; subject: string; text: string }): Promise<void> {
    this.sent.push(mail);
  }

  /** 最後に送ったメール本文からマジックリンクの URL を取り出す (テスト用の簡易ヘルパ)。 */
  lastUrl(): string | undefined {
    const last = this.sent[this.sent.length - 1];
    if (last === undefined) {
      return undefined;
    }
    const match = /https?:\/\/\S+/.exec(last.text);
    return match?.[0];
  }
}

/** 呼び出し内容を記録するだけのテスト用ロガー。 */
export class FakeLogger implements Logger {
  readonly infos: string[] = [];
  readonly warns: string[] = [];
  readonly errors: Array<{ message: string; err: unknown }> = [];

  info(msg: string): void {
    this.infos.push(msg);
  }

  warn(msg: string): void {
    this.warns.push(msg);
  }

  error(msg: string, err?: unknown): void {
    this.errors.push({ message: msg, err });
  }
}
