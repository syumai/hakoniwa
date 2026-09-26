// Perl 版 Turn.pm の @HlogPool / @HlateLogPool / @HsecretLogPool と logOut/logLate/logSecret/
// logHistory/logFlush の移植。
import type { HistoryEntry, LogEntry } from "../types.ts";

type PoolEntry = Omit<LogEntry, "seq">;

/**
 * 1 ターン分のログを溜め込み、Perl 版 logFlush と同じ順序で書き出す。
 * 通常ログ (normal) / 遅延ログ (late) / 機密ログ (secret) / 記録ログ (history) の 4 種類。
 */
export class LogCollector {
  readonly turn: number;
  #normalPool: PoolEntry[] = [];
  #latePool: PoolEntry[] = [];
  #secretPool: PoolEntry[] = [];
  #historyPool: HistoryEntry[] = [];

  constructor(turn: number) {
    this.turn = turn;
  }

  /** 通常ログ。Perl 版 logOut。 */
  normal(html: string, islandId: number, targetId = 0): void {
    this.#normalPool.push({ turn: this.turn, secret: false, islandId, targetId, html });
  }

  /** 遅延ログ (ステルス系の標的側に「何者か」として出す)。Perl 版 logLate。 */
  late(html: string, islandId: number, targetId = 0): void {
    this.#latePool.push({ turn: this.turn, secret: false, islandId, targetId, html });
  }

  /** 機密ログ (ステルス系の攻撃側にのみ見せる)。Perl 版 logSecret。 */
  secret(html: string, islandId: number, targetId = 0): void {
    this.#secretPool.push({ turn: this.turn, secret: true, islandId, targetId, html });
  }

  /** 記録ログ (発見・改名・受賞・死滅等の年表)。Perl 版 logHistory。 */
  history(html: string): void {
    this.#historyPool.push({ turn: this.turn, html });
  }

  /**
   * ログを確定する。Perl 版 logFlush と同じ順序 (secret を逆順 → late を逆順 → normal を逆順)
   * に並べ、seq を 0 から振る。
   */
  flush(): { logs: LogEntry[]; history: HistoryEntry[] } {
    const logs: LogEntry[] = [];
    let seq = 0;

    for (let i = this.#secretPool.length - 1; i >= 0; i--) {
      logs.push({ ...this.#secretPool[i]!, seq: seq++ });
    }
    for (let i = this.#latePool.length - 1; i >= 0; i--) {
      logs.push({ ...this.#latePool[i]!, seq: seq++ });
    }
    for (let i = this.#normalPool.length - 1; i >= 0; i--) {
      logs.push({ ...this.#normalPool[i]!, seq: seq++ });
    }

    return { logs, history: [...this.#historyPool] };
  }
}
