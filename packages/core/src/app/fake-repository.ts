// テスト用のインメモリ実装群。
// `packages/core` 自身のテストに加え、`packages/node` の web 層テスト (Phase 3b) でも
// 使い回すため、テストファイルではなく src 直下に置く (index.ts から re-export する)。
import type {
  BackupInfo,
  BackupStore,
  Clock,
  CreateGameInput,
  GameMeta,
  GameRepository,
  GameSummary,
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
    abandonedAt: island.abandonedAt,
  };
}

/**
 * `GameRepository` のインメモリ実装。tmp/18-games.md (複数ゲーム) 対応: ゲームごとに
 * 島・ログ・履歴を独立して保持する (`Map<gameId, ...>`)。
 * `transaction` は同期的に渡された関数をそのまま実行するだけ (実 DB のような
 * ロールバックは行わない。テストでは基本的に例外系は「repo の状態を変更しないまま throw する」
 * ように呼び出し側 (game-service 等) が事前検証してから書き込む設計になっているため問題ない)。
 */
export class FakeGameRepository implements GameRepository {
  #games = new Map<number, GameMeta>();
  #nextGameId = 1;
  #islands = new Map<number, Map<number, Island>>();
  /** gameId -> rank 昇順の island id 一覧。 */
  #order = new Map<number, number[]>();
  #logs = new Map<number, LogEntry[]>();
  #history = new Map<number, HistoryEntry[]>();
  #userPrefs = new Map<string, UserPrefs>();
  /** tmp/19-abandon.md「回数制限」節。gameId -> 放棄記録一覧。 */
  #abandonments = new Map<
    number,
    Array<{ userId: string; islandId: number; islandName: string; abandonedAt: number }>
  >();

  transaction<T>(fn: () => T): T {
    return fn();
  }

  isInitialized(): boolean {
    return this.#games.size > 0;
  }

  listGames(): GameSummary[] {
    return [...this.#games.values()]
      .sort((a, b) => b.id - a.id)
      .map((meta) => ({
        id: meta.id,
        name: meta.name,
        status: meta.status,
        startAt: meta.startAt,
        finishedAt: meta.finishedAt,
        turn: meta.turn,
        finalTurn: meta.finalTurn,
        islandCount: (this.#order.get(meta.id) ?? []).length,
      }));
  }

  getCurrentGameId(): number | undefined {
    if (this.#games.size === 0) {
      return undefined;
    }
    return Math.max(...this.#games.keys());
  }

  getMeta(gameId: number): GameMeta {
    const meta = this.#games.get(gameId);
    if (meta === undefined) {
      throw new Error(`FakeGameRepository: game not found: ${gameId}`);
    }
    return { ...meta };
  }

  saveMeta(meta: GameMeta): void {
    if (!this.#games.has(meta.id)) {
      throw new Error(`FakeGameRepository: game not found: ${meta.id}`);
    }
    this.#games.set(meta.id, { ...meta });
  }

  createGame(input: CreateGameInput, now: number): number {
    const id = this.#nextGameId++;
    const meta: GameMeta = {
      id,
      name: input.name,
      status: "running",
      turn: 0,
      firstTurn: 0,
      lastTime: input.startAt,
      startAt: input.startAt,
      finalTurn: input.finalTurn,
      unitTimeSec: input.unitTimeSec,
      nextIslandId: 1,
      createdAt: now,
      finishedAt: null,
    };
    this.#games.set(id, meta);
    this.#islands.set(id, new Map());
    this.#order.set(id, []);
    this.#logs.set(id, []);
    this.#history.set(id, []);
    return id;
  }

  finishGame(gameId: number, now: number): void {
    const meta = this.getMeta(gameId);
    this.#games.set(gameId, { ...meta, status: "finished", finishedAt: now });
  }

  tryBumpTurn(gameId: number, expectedTurn: number, next: GameMeta): boolean {
    const meta = this.#games.get(gameId);
    if (meta === undefined || meta.turn !== expectedTurn || meta.status !== "running") {
      return false;
    }
    this.#games.set(gameId, { ...next, id: gameId });
    return true;
  }

  #islandsOf(gameId: number): Map<number, Island> {
    let islands = this.#islands.get(gameId);
    if (islands === undefined) {
      islands = new Map();
      this.#islands.set(gameId, islands);
    }
    return islands;
  }

  #orderOf(gameId: number): number[] {
    let order = this.#order.get(gameId);
    if (order === undefined) {
      order = [];
      this.#order.set(gameId, order);
    }
    return order;
  }

  #logsOf(gameId: number): LogEntry[] {
    let logs = this.#logs.get(gameId);
    if (logs === undefined) {
      logs = [];
      this.#logs.set(gameId, logs);
    }
    return logs;
  }

  #historyOf(gameId: number): HistoryEntry[] {
    let history = this.#history.get(gameId);
    if (history === undefined) {
      history = [];
      this.#history.set(gameId, history);
    }
    return history;
  }

  listIslandSummaries(gameId: number): IslandSummary[] {
    return this.#orderOf(gameId).map((id) => toSummary(this.#mustGet(gameId, id)));
  }

  loadAllIslands(gameId: number): Island[] {
    return this.#orderOf(gameId).map((id) => cloneIsland(this.#mustGet(gameId, id)));
  }

  findIsland(gameId: number, id: number): Island | undefined {
    const island = this.#islandsOf(gameId).get(id);
    return island === undefined ? undefined : cloneIsland(island);
  }

  findIslandByName(gameId: number, name: string): IslandSummary | undefined {
    for (const id of this.#orderOf(gameId)) {
      const island = this.#mustGet(gameId, id);
      if (island.name === name) {
        return toSummary(island);
      }
    }
    return undefined;
  }

  findIslandByOwner(gameId: number, userId: string): IslandSummary | undefined {
    for (const id of this.#orderOf(gameId)) {
      const island = this.#mustGet(gameId, id);
      if (island.ownerUserId === userId && island.abandonedAt === null) {
        return toSummary(island);
      }
    }
    return undefined;
  }

  insertIsland(gameId: number, island: Island, rank: number): void {
    this.#islandsOf(gameId).set(island.id, cloneIsland(island));
    const order = this.#orderOf(gameId);
    const index = Math.max(0, Math.min(rank, order.length));
    order.splice(index, 0, island.id);
  }

  updateIsland(gameId: number, island: Island): void {
    const islands = this.#islandsOf(gameId);
    if (!islands.has(island.id)) {
      throw new Error(`FakeGameRepository: island not found: ${island.id}`);
    }
    islands.set(island.id, cloneIsland(island));
  }

  replaceAllIslands(gameId: number, islands: Island[]): void {
    this.#islands.set(gameId, new Map(islands.map((island) => [island.id, cloneIsland(island)])));
    this.#order.set(
      gameId,
      islands.map((island) => island.id),
    );
  }

  deleteIsland(gameId: number, id: number): void {
    this.#islandsOf(gameId).delete(id);
    this.#order.set(
      gameId,
      this.#orderOf(gameId).filter((existing) => existing !== id),
    );
  }

  replaceLbbs(gameId: number, islandId: number, posts: LbbsPost[]): void {
    const island = this.#mustGet(gameId, islandId);
    island.lbbs = posts.map((post) => ({ ...post }));
  }

  appendLogs(gameId: number, entries: LogEntry[]): void {
    const logs = this.#logsOf(gameId);
    for (const entry of entries) {
      logs.push({ ...entry });
    }
  }

  listLogs(gameId: number, q: ListLogsQuery): LogEntry[] {
    return this.#logsOf(gameId)
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

  deleteLogsBefore(gameId: number, turn: number): void {
    this.#logs.set(
      gameId,
      this.#logsOf(gameId).filter((entry) => entry.turn >= turn),
    );
  }

  appendHistory(gameId: number, entries: HistoryEntry[]): void {
    const history = this.#historyOf(gameId);
    for (const entry of entries) {
      history.push({ ...entry });
    }
  }

  listHistory(gameId: number, limit: number): HistoryEntry[] {
    return [...this.#historyOf(gameId)]
      .reverse()
      .slice(0, limit)
      .map((entry) => ({ ...entry }));
  }

  trimHistory(gameId: number, keep: number): void {
    const history = this.#historyOf(gameId);
    this.#history.set(gameId, history.slice(Math.max(0, history.length - keep)));
  }

  countAbandonments(gameId: number, userId: string): number {
    return (this.#abandonments.get(gameId) ?? []).filter((a) => a.userId === userId).length;
  }

  recordAbandonment(
    gameId: number,
    userId: string,
    islandId: number,
    islandName: string,
    abandonedAt: number,
  ): void {
    const list = this.#abandonments.get(gameId) ?? [];
    list.push({ userId, islandId, islandName, abandonedAt });
    this.#abandonments.set(gameId, list);
  }

  reset(): void {
    this.#games = new Map();
    this.#nextGameId = 1;
    this.#islands = new Map();
    this.#order = new Map();
    this.#logs = new Map();
    this.#history = new Map();
    this.#abandonments = new Map();
  }

  getUserPrefs(userId: string): UserPrefs | undefined {
    const prefs = this.#userPrefs.get(userId);
    return prefs === undefined ? undefined : { ...prefs };
  }

  setUserPrefs(userId: string, prefs: UserPrefs): void {
    this.#userPrefs.set(userId, { ...prefs });
  }

  #mustGet(gameId: number, id: number): Island {
    const island = this.#islandsOf(gameId).get(id);
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
