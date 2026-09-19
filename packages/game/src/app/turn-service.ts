// tmp/08-turn-trigger-admin-cli.md 「ターン進行トリガー」節 + tmp/18-games.md (複数ゲーム) の移植。
// Perl 版 Main.pm readIslandsFile のターン判定 + Turn.pm turnMain の移植。
import type { BackupStore, GameMeta, GameRepository, Logger } from "./ports.ts";
import { isFinished } from "./season.ts";
import type { GameConfig } from "../core/config.ts";
import type { Rng } from "../core/rng.ts";
import type { World } from "../core/types.ts";
import { createTurnContext, runTurn } from "../core/turn/index.ts";

export interface TurnServiceDeps {
  repo: GameRepository;
  config: GameConfig;
  rng: Rng;
  backupStore: BackupStore;
  logger: Logger;
}

/**
 * ターン進行。08 のアルゴリズムどおり `advanceTurnIfDue`/`advanceTurn` は同期関数として保つ。
 * tmp/18-games.md「TurnService」節: 現在のゲーム (`repo.getCurrentGameId()`) だけを対象にする。
 * ゲームが無い、または現在のゲームが `running` でなければ何もしない。
 *
 * 設計書との差異: 08 はバックアップ作成を `advanceTurnIfDue` の同期フロー内に書いているが、
 * `BackupStore` は非同期 (04-database.md) であり、同期関数の中で await することはできない。
 * そのため、ターン処理のトランザクションが確定した後に
 * `void backupStore.create(...).then(() => backupStore.rotate(...)).catch(logger.error)` の形で
 * fire-and-forget 呼び出しにしている。呼び出し元はバックアップの完了を待たない。
 */
export class TurnService {
  readonly #deps: TurnServiceDeps;

  constructor(deps: TurnServiceDeps) {
    this.#deps = deps;
  }

  /** 期限が来ていれば `config.maxCatchUpTurns` を上限に進める。進めたターン数を返す。 */
  advanceTurnIfDue(now: number): number {
    const { repo, config } = this.#deps;
    let count = 0;
    for (let i = 0; i < config.maxCatchUpTurns; i++) {
      const gameId = repo.getCurrentGameId();
      if (gameId === undefined) {
        break;
      }
      const meta = repo.getMeta(gameId);
      // tmp/16-season.md「ターン進行」節 + tmp/18-games.md: 終了後はそれ以上進めない。
      if (isFinished(meta)) {
        break;
      }
      // tmp/16-season.md「ターンの長さも DB に持つ」節: 期限判定は config ではなく meta.unitTimeSec
      // (管理画面「ゲーム設定」/ CLI `game set-unit-time` で変更された値) を使う。
      if (now - meta.lastTime < meta.unitTimeSec) {
        break;
      }
      const advancedTurn = this.#advanceOnce(gameId, meta, now);
      if (advancedTurn === undefined) {
        break;
      }
      count++;
    }
    return count;
  }

  /** 期限に関係なく 1 ターン進める (デバッグ/管理用)。現在のゲームが無い/終了後は何もしない。 */
  advanceTurn(now: number): void {
    const { repo } = this.#deps;
    const gameId = repo.getCurrentGameId();
    if (gameId === undefined) {
      return;
    }
    const meta = repo.getMeta(gameId);
    if (isFinished(meta)) {
      return;
    }
    this.#advanceOnce(gameId, meta, now);
  }

  /**
   * 1 ターン分の進行を試みる。`tryBumpTurn` の楽観ロックに失敗したら undefined を返す。
   * 成功したら進行後の turn 番号を返す (呼び出し元がバックアップ要否の判定に使う)。
   * 進行後に `turn > finalTurn` になったら、同じトランザクション内で `finishGame` を呼ぶ
   * (tmp/18-games.md「TurnService」節)。
   */
  #advanceOnce(gameId: number, meta: GameMeta, now: number): number | undefined {
    const { repo, config, rng } = this.#deps;
    let newTurn: number | undefined;

    const advanced = repo.transaction(() => {
      const next: GameMeta = {
        ...meta,
        turn: meta.turn + 1,
        lastTime: meta.lastTime + meta.unitTimeSec,
      };
      if (!repo.tryBumpTurn(gameId, meta.turn, next)) {
        return false;
      }

      const islands = repo.loadAllIslands(gameId);
      const world: World = {
        turn: meta.turn,
        lastTime: meta.lastTime,
        nextIslandId: meta.nextIslandId,
        islands,
      };
      // tmp/16-season.md「ターンの長さも DB に持つ」節: runTurn に渡す config は
      // meta.unitTimeSec で上書きする (runTurn 内の `world.lastTime += ctx.config.unitTimeSec` も
      // meta の値に従わせるため)。
      const turnConfig: GameConfig = { ...config, unitTimeSec: meta.unitTimeSec };
      const ctx = createTurnContext({ config: turnConfig, rng, turn: meta.turn });
      const result = runTurn(world, ctx);

      repo.replaceAllIslands(gameId, result.world.islands);
      repo.appendLogs(gameId, result.logs);
      repo.appendHistory(gameId, result.history);
      repo.deleteLogsBefore(gameId, result.world.turn - config.logKeepTurns + 1);
      repo.trimHistory(gameId, config.historyMax);

      if (next.finalTurn !== null && next.turn > next.finalTurn) {
        repo.finishGame(gameId, now);
      }

      newTurn = result.world.turn;
      return true;
    });

    if (!advanced || newTurn === undefined) {
      return undefined;
    }

    if (newTurn % config.backupEveryTurns === 0) {
      this.#scheduleBackup(newTurn);
    }
    return newTurn;
  }

  #scheduleBackup(turn: number): void {
    const { backupStore, config, logger } = this.#deps;
    void backupStore
      .create(`turn-${turn}`, turn)
      .then(() => backupStore.rotate(config.backupKeep))
      .catch((err: unknown) =>
        logger.error(`バックアップの作成に失敗しました (turn=${turn})`, err),
      );
  }
}
