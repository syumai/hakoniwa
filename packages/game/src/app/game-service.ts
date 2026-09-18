// tmp/06-web-routes-and-views.md 「ユースケース呼び出し」の GameService の実装。
// tmp/14-users-auth.md (better-auth への置き換え)、tmp/15-ng-words-and-mobile.md (NG ワード) 反映。
// Perl 版 Map.pm (printIslandMain/ownerMain/commandMain/commentMain/localBbsMain) と
// Turn.pm (newIslandMain/changeMain) の移植。
import type { AuthUser } from "./auth.ts";
import { AppError } from "./errors.ts";
import { findNgWord } from "../core/ng-words.ts";
import {
  MAX_COMMENT_LEN,
  MAX_LBBS_MESSAGE_LEN,
  MAX_NAME_LEN,
  isBadIslandName,
  sanitizeText,
} from "./sanitize.ts";
import type { GameRepository, IslandSummary, UserPrefs } from "./ports.ts";
import type { Clock } from "./ports.ts";
import { buildSeasonVM, isFinished } from "./season.ts";
import { buildIslandOgpVM, buildMoneyDisplay } from "./view-models.ts";
import type {
  IslandDetailVM,
  IslandPageVM,
  NewIslandVM,
  OwnerPageVM,
  TopPageVM,
} from "./view-models.ts";
import type { GameConfig } from "../core/config.ts";
import { CommandKind, commandSpecs } from "../core/constants.ts";
import type { AutoPrepareKind } from "../core/commands/queue.ts";
import { autoPrepare, clearAll, deleteAt, insertAt, writeAt } from "../core/commands/queue.ts";
import { formatCommand } from "../core/commands/format.ts";
import type { ResolveIslandName } from "../core/commands/format.ts";
import { shuffledPoints } from "../core/geometry.ts";
import { estimate, makeNewIsland } from "../core/island.ts";
import { LogCollector } from "../core/log/collector.ts";
import * as messages from "../core/log/messages.ts";
import { flagPrizes, killedMonsters, turnPrizes } from "../core/prize.ts";
import type { Rng } from "../core/rng.ts";
import type { Command, Island, LbbsPost } from "../core/types.ts";

/** 計画登録フォームの入力値。web 層のフォームからそのまま渡ってくる想定 (未検証の raw な数値)。 */
export interface CommandInput {
  /** 登録先の欄番号 (0 始まり)。 */
  number: number;
  kind: number;
  x: number;
  y: number;
  /** Command.arg。 */
  amount: number;
  target: number;
  mode: "insert" | "write" | "delete";
}

export interface GameServiceDeps {
  repo: GameRepository;
  clock: Clock;
  config: GameConfig;
  rng: Rng;
  /** HAKONIWA_NG_WORDS 由来の追加 NG ワード。未指定なら空配列。 */
  ngWords?: string[];
}

function buildDetailVM(island: Island, rank: number, turn: number): IslandDetailVM {
  return {
    id: island.id,
    name: island.name,
    rank,
    turn,
    absent: island.absent,
    pop: island.pop,
    area: island.area,
    food: island.food,
    farm: island.farm,
    factory: island.factory,
    mountain: island.mountain,
    comment: island.comment,
    prize: {
      turnPrizes: turnPrizes(island.prize),
      flagPrizes: flagPrizes(island.prize),
      killedMonsters: killedMonsters(island.prize),
    },
    terrain: island.terrain,
  };
}

/** Perl 版 Map.pm / Turn.pm の各 *Main のユースケース化。v2 (better-auth ベースの認可) 版。 */
export class GameService {
  readonly #deps: GameServiceDeps;

  constructor(deps: GameServiceDeps) {
    this.#deps = deps;
  }

  // ----------------------------------------------------------------------
  // 認可まわりの共通処理 (tmp/14-users-auth.md 「認可ルール」節)
  // ----------------------------------------------------------------------

  #requireLogin(actor: AuthUser | undefined): AuthUser {
    if (actor === undefined) {
      throw new AppError("login_required");
    }
    return actor;
  }

  /** ログイン済みかつ自分の島の IslandSummary を返す。無ければ no_island。 */
  #requireOwnIsland(actor: AuthUser | undefined): { user: AuthUser; summary: IslandSummary } {
    const user = this.#requireLogin(actor);
    const summary = this.#deps.repo.findIslandByOwner(user.id);
    if (summary === undefined) {
      throw new AppError("no_island");
    }
    return { user, summary };
  }

  #requireNgWordFree(text: string): void {
    const ngWord = findNgWord(text, this.#deps.ngWords ?? []);
    if (ngWord !== undefined) {
      // 利用者にはどの語が引っかかったかを見せない (15「照合ルール」6)。
      throw new AppError("ng_word");
    }
  }

  #ensureInitialized(): void {
    if (!this.#deps.repo.isInitialized()) {
      throw new AppError("not_initialized");
    }
  }

  /**
   * tmp/16-season.md「ターン進行」節: ゲーム終了後は更新系操作を拒否する
   * (createIsland/registerCommand/updateComment/changeName)。掲示板の記帳 (postLbbs) は対象外。
   */
  #ensureNotFinished(): void {
    if (isFinished(this.#deps.repo.getMeta())) {
      throw new AppError("game_finished");
    }
  }

  #findRank(id: number, summaries: { id: number }[]): number {
    const index = summaries.findIndex((s) => s.id === id);
    return index === -1 ? 0 : index + 1;
  }

  // ----------------------------------------------------------------------
  // 画面の組み立て (repo からの読み出し。同期)
  // ----------------------------------------------------------------------

  #buildIslandPageVM(id: number): IslandPageVM {
    const { repo, config } = this.#deps;
    const island = repo.findIsland(id);
    if (island === undefined) {
      throw new AppError("island_not_found");
    }
    const rank = this.#findRank(id, repo.listIslandSummaries());
    const meta = repo.getMeta();
    const sinceTurn = meta.turn - config.logKeepTurns + 1;
    const logs = repo.listLogs({ sinceTurn, islandId: id });
    const detail = buildDetailVM(island, rank, meta.turn);
    return {
      ...detail,
      moneyDisplay: buildMoneyDisplay(island.money, config, false),
      lbbs: island.lbbs,
      logs,
      ogp: buildIslandOgpVM(detail, config),
    };
  }

  #buildOwnerPageVM(id: number, userId: string): OwnerPageVM {
    const { repo, config } = this.#deps;
    const island = repo.findIsland(id);
    if (island === undefined) {
      throw new AppError("island_not_found");
    }
    const summaries = repo.listIslandSummaries();
    const rank = this.#findRank(id, summaries);
    const nameById = new Map(summaries.map((s) => [s.id, s.name] as const));
    const resolveIslandName: ResolveIslandName = (targetId) => nameById.get(targetId);
    const meta = repo.getMeta();
    const sinceTurn = meta.turn - config.logKeepTurns + 1;
    const logs = repo.listLogs({ sinceTurn, islandId: id, includeSecretFor: id });
    const commands = island.commands.map((command, index) =>
      formatCommand(command, index, config, resolveIslandName),
    );
    const defaults: UserPrefs = repo.getUserPrefs(userId) ?? {};
    const season = buildSeasonVM(meta, this.#deps.clock.now(), config.unitTimeSec);
    return {
      ...buildDetailVM(island, rank, meta.turn),
      money: island.money,
      commands,
      rawCommands: island.commands,
      lbbs: island.lbbs,
      logs,
      defaults,
      season,
    };
  }

  // ----------------------------------------------------------------------
  // トップ / 観光
  // ----------------------------------------------------------------------

  /** Perl 版 Top.pm topPageMain の移植。 */
  getTopPage(actor: AuthUser | undefined): TopPageVM {
    this.#ensureInitialized();
    const { repo, config } = this.#deps;
    const meta = repo.getMeta();
    const summaries = repo.listIslandSummaries();
    const islands = summaries.map((s, index) => ({
      id: s.id,
      name: s.name,
      rank: index + 1,
      absent: s.absent,
      pop: s.pop,
      area: s.area,
      food: s.food,
      farm: s.farm,
      factory: s.factory,
      mountain: s.mountain,
      moneyDisplay: buildMoneyDisplay(s.money, config, false),
      prize: {
        turnPrizes: turnPrizes(s.prize),
        flagPrizes: flagPrizes(s.prize),
        killedMonsters: killedMonsters(s.prize),
      },
      comment: s.comment,
    }));
    const sinceTurn = meta.turn - config.topLogTurns + 1;
    const logs = repo.listLogs({ sinceTurn });
    const history = repo.listHistory(config.historyMax);
    const hasIsland = actor !== undefined && repo.findIslandByOwner(actor.id) !== undefined;
    const season = buildSeasonVM(meta, this.#deps.clock.now(), config.unitTimeSec);
    return {
      turn: meta.turn,
      islands,
      canCreate: summaries.length < config.maxIslands,
      logs,
      history,
      debug: config.debug,
      viewer: { ...(actor !== undefined ? { user: actor } : {}), hasIsland },
      season,
    };
  }

  /** Perl 版 Map.pm printIslandMain の移植。誰でも見られる (14「認可ルール」節)。 */
  getIslandPage(id: number): IslandPageVM {
    this.#ensureInitialized();
    return this.#buildIslandPageVM(id);
  }

  /**
   * OGP 画像 (地図 PNG) 生成用。tmp/17-ogp.md。認証・セッションに依存しない (誰でも同じ画像)。
   * Perl 版には無い (v2 独自の追加)。
   */
  getIslandOgp(id: number): { island: Island; turn: number } {
    this.#ensureInitialized();
    const { repo } = this.#deps;
    const island = repo.findIsland(id);
    if (island === undefined) {
      throw new AppError("island_not_found");
    }
    return { island, turn: repo.getMeta().turn };
  }

  /** Perl 版 Map.pm ownerMain の移植。actor 自身の島を開く (1 ユーザー 1 島)。 */
  openOwnerPage(actor: AuthUser | undefined): OwnerPageVM {
    this.#ensureInitialized();
    const { user, summary } = this.#requireOwnIsland(actor);
    return this.#buildOwnerPageVM(summary.id, user.id);
  }

  // ----------------------------------------------------------------------
  // 新規作成
  // ----------------------------------------------------------------------

  /** Perl 版 Turn.pm newIslandMain の移植。ログイン必須、1 ユーザー 1 島。 */
  createIsland(actor: AuthUser | undefined, name: string): NewIslandVM {
    this.#ensureInitialized();
    this.#ensureNotFinished();
    const user = this.#requireLogin(actor);
    const { repo, config } = this.#deps;
    const cleanName = sanitizeText(name, MAX_NAME_LEN);

    // 事前検証: 1 島制約 → 上限 → 名前空 → 禁止文字/無人 → NG ワード → 重複。
    const validate = (): void => {
      if (repo.findIslandByOwner(user.id) !== undefined) {
        throw new AppError("already_has_island");
      }
      if (repo.listIslandSummaries().length >= config.maxIslands) {
        throw new AppError("island_full");
      }
      if (cleanName === "") {
        throw new AppError("no_name");
      }
      if (isBadIslandName(cleanName)) {
        throw new AppError("bad_name");
      }
      this.#requireNgWordFree(cleanName);
      if (repo.findIslandByName(cleanName) !== undefined) {
        throw new AppError("name_taken");
      }
    };
    validate();

    return repo.transaction(() => {
      // トランザクション内で改めて検証する (TOCTOU 対策)。
      validate();

      const meta = repo.getMeta();
      const island = makeNewIsland(config, this.#deps.rng, {
        id: meta.nextIslandId,
        name: cleanName,
        ownerUserId: user.id,
      });
      estimate(island);

      const rank = repo.listIslandSummaries().length;
      repo.insertIsland(island, rank);
      repo.saveMeta({ ...meta, nextIslandId: meta.nextIslandId + 1 });

      const log = new LogCollector(meta.turn);
      messages.logDiscover(log, cleanName);
      const { history } = log.flush();
      repo.appendHistory(history);

      return {
        ...buildDetailVM(island, rank + 1, meta.turn),
        money: island.money,
      };
    });
  }

  // ----------------------------------------------------------------------
  // 計画登録
  // ----------------------------------------------------------------------

  #validateCommandInput(input: CommandInput): void {
    const { config } = this.#deps;
    if (!Number.isInteger(input.number) || input.number < 0 || input.number >= config.commandMax) {
      throw new AppError("invalid_input");
    }
    if (commandSpecs[input.kind as CommandKind] === undefined) {
      throw new AppError("invalid_input");
    }
    if (!Number.isInteger(input.x) || input.x < 0 || input.x >= config.islandSize) {
      throw new AppError("invalid_input");
    }
    if (!Number.isInteger(input.y) || input.y < 0 || input.y >= config.islandSize) {
      throw new AppError("invalid_input");
    }
    if (!Number.isInteger(input.amount) || input.amount < 0 || input.amount > 99) {
      throw new AppError("invalid_input");
    }
    if (!Number.isInteger(input.target) || input.target < 0) {
      throw new AppError("invalid_input");
    }
    if (input.mode !== "insert" && input.mode !== "write" && input.mode !== "delete") {
      throw new AppError("invalid_input");
    }
  }

  /** Perl 版 Map.pm commandMain の移植。actor 自身の島に対してのみ実行できる。 */
  registerCommand(
    actor: AuthUser | undefined,
    input: CommandInput,
  ): OwnerPageVM & { notice: string } {
    this.#ensureInitialized();
    this.#ensureNotFinished();
    const { user, summary } = this.#requireOwnIsland(actor);
    const id = summary.id;
    this.#validateCommandInput(input);
    const { repo, config } = this.#deps;

    return repo.transaction(() => {
      const island = repo.findIsland(id);
      if (island === undefined) {
        throw new AppError("island_not_found");
      }
      const { commands } = island;
      const max = config.commandMax;
      const kind = input.kind as CommandKind;

      if (input.mode === "delete") {
        deleteAt(commands, input.number, max);
      } else if (kind === CommandKind.AutoPrepare || kind === CommandKind.AutoPrepare2) {
        const points = shuffledPoints(config.islandSize, this.#deps.rng);
        autoPrepare(commands, input.number, island.terrain, kind as AutoPrepareKind, points, max);
      } else if (kind === CommandKind.AutoDelete) {
        clearAll(commands, max);
      } else {
        const command: Command = {
          kind,
          target: input.target,
          x: input.x,
          y: input.y,
          arg: input.amount,
        };
        if (input.mode === "insert") {
          insertAt(commands, input.number, command);
        } else {
          writeAt(commands, input.number, command);
        }
      }

      repo.updateIsland(island);
      repo.setUserPrefs(user.id, {
        targetIslandId: input.target,
        pointX: input.x,
        pointY: input.y,
        kind: input.kind,
      });
      // Perl 版 commandMain は delete モードと AutoDelete (全消し) を tempCommandDelete、
      // それ以外 (insert/write/AutoPrepare/AutoPrepare2) を tempCommandAdd で表示する。
      const notice =
        input.mode === "delete" || kind === CommandKind.AutoDelete
          ? "コマンドを削除しました。"
          : "コマンドを登録しました。";
      return { ...this.#buildOwnerPageVM(id, user.id), notice };
    });
  }

  // ----------------------------------------------------------------------
  // コメント
  // ----------------------------------------------------------------------

  /** Perl 版 Map.pm commentMain の移植。actor 自身の島に対してのみ実行できる。 */
  updateComment(actor: AuthUser | undefined, message: string): OwnerPageVM & { notice: string } {
    this.#ensureInitialized();
    this.#ensureNotFinished();
    const { user, summary } = this.#requireOwnIsland(actor);
    const { repo } = this.#deps;
    const comment = sanitizeText(message, MAX_COMMENT_LEN);
    this.#requireNgWordFree(comment);

    return repo.transaction(() => {
      const island = repo.findIsland(summary.id);
      if (island === undefined) {
        throw new AppError("island_not_found");
      }
      island.comment = comment;
      repo.updateIsland(island);
      return { ...this.#buildOwnerPageVM(summary.id, user.id), notice: "コメントを更新しました。" };
    });
  }

  // ----------------------------------------------------------------------
  // 名前変更 (旧 changeSettings。パスワードは廃止)
  // ----------------------------------------------------------------------

  /** Perl 版 Turn.pm changeMain の移植。actor 自身の島に対してのみ実行できる。 */
  changeName(actor: AuthUser | undefined, name: string): OwnerPageVM & { notice: string } {
    this.#ensureInitialized();
    this.#ensureNotFinished();
    const { user, summary } = this.#requireOwnIsland(actor);
    const { repo, config } = this.#deps;
    const cleanName = sanitizeText(name, MAX_NAME_LEN);

    if (cleanName === "") {
      throw new AppError("no_name");
    }
    if (isBadIslandName(cleanName)) {
      throw new AppError("bad_name");
    }
    this.#requireNgWordFree(cleanName);

    return repo.transaction(() => {
      const island = repo.findIsland(summary.id);
      if (island === undefined) {
        throw new AppError("island_not_found");
      }
      if (repo.findIslandByName(cleanName) !== undefined && cleanName !== island.name) {
        throw new AppError("name_taken");
      }
      if (island.money < config.costChangeName) {
        throw new AppError("no_money");
      }
      island.money -= config.costChangeName;

      const log = new LogCollector(repo.getMeta().turn);
      messages.logChangeName(log, island.name, cleanName);
      const { history } = log.flush();
      repo.appendHistory(history);
      island.name = cleanName;
      repo.updateIsland(island);

      return { ...this.#buildOwnerPageVM(summary.id, user.id), notice: "名前を変更しました。" };
    });
  }

  // ----------------------------------------------------------------------
  // ローカル掲示板
  // ----------------------------------------------------------------------

  #pushLbbsPost(id: number, post: LbbsPost): void {
    const { repo, config } = this.#deps;
    const island = repo.findIsland(id);
    if (island === undefined) {
      throw new AppError("island_not_found");
    }
    const posts = [post, ...island.lbbs].slice(0, config.lbbsMax);
    repo.replaceLbbs(id, posts);
  }

  /**
   * Perl 版 Map.pm localBbsMain の移植。記帳はログイン必須 (14「認可ルール」節)。
   * actor 自身の島なら 'owner' として、他人の島なら 'visitor' として記帳する。
   * 表示名は actor.name (フォームで名前を受け取らない)。
   */
  postLbbs(
    actor: AuthUser | undefined,
    islandId: number,
    message: string,
  ): (OwnerPageVM | IslandPageVM) & { notice: string } {
    this.#ensureInitialized();
    const { repo, config } = this.#deps;
    if (!config.useLbbs) {
      throw new AppError("lbbs_disabled");
    }
    const user = this.#requireLogin(actor);
    const island0 = repo.findIsland(islandId);
    if (island0 === undefined) {
      throw new AppError("island_not_found");
    }
    const cleanMessage = sanitizeText(message, MAX_LBBS_MESSAGE_LEN);
    if (cleanMessage === "") {
      throw new AppError("lbbs_empty");
    }
    this.#requireNgWordFree(cleanMessage);
    const isOwner = island0.ownerUserId === user.id;

    return repo.transaction(() => {
      const meta = repo.getMeta();
      this.#pushLbbsPost(islandId, {
        author: isOwner ? "owner" : "visitor",
        userId: user.id,
        name: user.name,
        message: cleanMessage,
        turn: meta.turn,
      });
      const notice = "記帳を行いました。";
      return isOwner
        ? { ...this.#buildOwnerPageVM(islandId, user.id), notice }
        : { ...this.#buildIslandPageVM(islandId), notice };
    });
  }

  /** Perl 版 Map.pm localBbsMain (削除モード) の移植。actor 自身の島の記帳のみ削除できる。 */
  deleteLbbs(actor: AuthUser | undefined, number: number): OwnerPageVM & { notice: string } {
    this.#ensureInitialized();
    const { repo, config } = this.#deps;
    if (!config.useLbbs) {
      throw new AppError("lbbs_disabled");
    }
    const { user, summary } = this.#requireOwnIsland(actor);
    if (!Number.isInteger(number) || number < 0 || number >= config.lbbsMax) {
      throw new AppError("invalid_input");
    }

    return repo.transaction(() => {
      const island = repo.findIsland(summary.id);
      if (island === undefined) {
        throw new AppError("island_not_found");
      }
      const posts = [...island.lbbs];
      if (number < posts.length) {
        posts.splice(number, 1);
      }
      repo.replaceLbbs(summary.id, posts);
      return { ...this.#buildOwnerPageVM(summary.id, user.id), notice: "記帳内容を削除しました。" };
    });
  }
}
