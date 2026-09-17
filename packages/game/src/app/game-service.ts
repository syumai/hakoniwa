// tmp/06-web-routes-and-views.md 「ユースケース呼び出し」の GameService の実装。
// Perl 版 Map.pm (printIslandMain/ownerMain/commandMain/commentMain/localBbsMain) と
// Turn.pm (newIslandMain/changeMain) の移植。
import { safeEqual, verifyIslandPassword } from "./auth.ts";
import type { VerifyIslandPasswordDeps } from "./auth.ts";
import { AppError } from "./errors.ts";
import {
  MAX_COMMENT_LEN,
  MAX_LBBS_MESSAGE_LEN,
  MAX_LBBS_NAME_LEN,
  MAX_NAME_LEN,
  isBadIslandName,
  sanitizeText,
} from "./sanitize.ts";
import type { GameRepository } from "./ports.ts";
import type { PasswordHasher, Clock } from "./ports.ts";
import { buildMoneyDisplay } from "./view-models.ts";
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
  hasher: PasswordHasher;
  clock: Clock;
  config: GameConfig;
  /** 全島のパスワード代用。未設定なら無効。 */
  masterPassword?: string;
  /** changeSettings の旧パスワード欄専用。資金・食料を 9999 にする。未設定なら無効。 */
  specialPassword?: string;
  rng: Rng;
}

function buildDetailVM(island: Island, rank: number): IslandDetailVM {
  return {
    id: island.id,
    name: island.name,
    rank,
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

/** Perl 版 Map.pm / Turn.pm の各 *Main のユースケース化。 */
export class GameService {
  readonly #deps: GameServiceDeps;

  constructor(deps: GameServiceDeps) {
    this.#deps = deps;
  }

  // ----------------------------------------------------------------------
  // 認証まわりの共通処理
  // ----------------------------------------------------------------------

  #authDeps(): VerifyIslandPasswordDeps {
    const { hasher, masterPassword } = this.#deps;
    return masterPassword === undefined ? { hasher } : { hasher, masterPassword };
  }

  #ensureInitialized(): void {
    if (!this.#deps.repo.isInitialized()) {
      throw new AppError("not_initialized");
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
    return {
      ...buildDetailVM(island, rank),
      moneyDisplay: buildMoneyDisplay(island.money, config, false),
      lbbs: island.lbbs,
      logs,
    };
  }

  #buildOwnerPageVM(id: number): OwnerPageVM {
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
    return {
      ...buildDetailVM(island, rank),
      money: island.money,
      commands,
      lbbs: island.lbbs,
      logs,
    };
  }

  // ----------------------------------------------------------------------
  // トップ / 観光
  // ----------------------------------------------------------------------

  /** Perl 版 Top.pm topPageMain の移植。 */
  getTopPage(): TopPageVM {
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
    return {
      turn: meta.turn,
      islands,
      canCreate: summaries.length < config.maxIslands,
      logs,
      history,
      debug: config.debug,
    };
  }

  /** Perl 版 Map.pm printIslandMain の移植。 */
  getIslandPage(id: number): IslandPageVM {
    this.#ensureInitialized();
    return this.#buildIslandPageVM(id);
  }

  /** Perl 版 Map.pm ownerMain の移植。 */
  async openOwnerPage(id: number, password: string): Promise<OwnerPageVM> {
    this.#ensureInitialized();
    const island = this.#deps.repo.findIsland(id);
    if (island === undefined) {
      throw new AppError("island_not_found");
    }
    const ok = await verifyIslandPassword(island, password, this.#authDeps());
    if (!ok) {
      throw new AppError("wrong_password");
    }
    return this.#buildOwnerPageVM(id);
  }

  // ----------------------------------------------------------------------
  // 新規作成
  // ----------------------------------------------------------------------

  /** Perl 版 Turn.pm newIslandMain の移植。 */
  async createIsland(name: string, password: string, confirm: string): Promise<NewIslandVM> {
    this.#ensureInitialized();
    const { repo, config } = this.#deps;
    const cleanName = sanitizeText(name, MAX_NAME_LEN);

    // 事前検証 (すべて同期)。Perl 版 newIslandMain と同じ順序:
    // 上限 → 名前空 → 禁止文字/無人 → 重複 → パスワード空 → 確認不一致。
    const validate = (): void => {
      if (repo.listIslandSummaries().length >= config.maxIslands) {
        throw new AppError("island_full");
      }
      if (cleanName === "") {
        throw new AppError("no_name");
      }
      if (isBadIslandName(cleanName)) {
        throw new AppError("bad_name");
      }
      if (repo.findIslandByName(cleanName) !== undefined) {
        throw new AppError("name_taken");
      }
      if (password === "") {
        throw new AppError("no_password");
      }
      if (confirm !== password) {
        throw new AppError("password_mismatch");
      }
    };
    // 事前チェック。ハッシュ化 (非同期) が無駄にならないよう先に一度確認する。
    validate();

    const passwordHash = await this.#deps.hasher.hash(password);

    return repo.transaction(() => {
      // await を挟んだので、repo の状態が変わっていないか改めて検証する (TOCTOU 対策)。
      validate();

      const meta = repo.getMeta();
      const island = makeNewIsland(config, this.#deps.rng, {
        id: meta.nextIslandId,
        name: cleanName,
        passwordHash,
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
        ...buildDetailVM(island, rank + 1),
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

  /** Perl 版 Map.pm commandMain の移植。 */
  async registerCommand(
    id: number,
    password: string,
    input: CommandInput,
  ): Promise<OwnerPageVM & { notice: string }> {
    this.#ensureInitialized();
    const { repo, config } = this.#deps;
    const island0 = repo.findIsland(id);
    if (island0 === undefined) {
      throw new AppError("island_not_found");
    }
    const ok = await verifyIslandPassword(island0, password, this.#authDeps());
    if (!ok) {
      throw new AppError("wrong_password");
    }
    this.#validateCommandInput(input);

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
      return { ...this.#buildOwnerPageVM(id), notice: "計画を登録しました。" };
    });
  }

  // ----------------------------------------------------------------------
  // コメント
  // ----------------------------------------------------------------------

  /** Perl 版 Map.pm commentMain の移植。 */
  async updateComment(
    id: number,
    password: string,
    message: string,
  ): Promise<OwnerPageVM & { notice: string }> {
    this.#ensureInitialized();
    const { repo } = this.#deps;
    const island0 = repo.findIsland(id);
    if (island0 === undefined) {
      throw new AppError("island_not_found");
    }
    const ok = await verifyIslandPassword(island0, password, this.#authDeps());
    if (!ok) {
      throw new AppError("wrong_password");
    }
    const comment = sanitizeText(message, MAX_COMMENT_LEN);

    return repo.transaction(() => {
      const island = repo.findIsland(id);
      if (island === undefined) {
        throw new AppError("island_not_found");
      }
      island.comment = comment;
      repo.updateIsland(island);
      return { ...this.#buildOwnerPageVM(id), notice: "コメントを更新しました。" };
    });
  }

  // ----------------------------------------------------------------------
  // 名前・パスワード変更
  // ----------------------------------------------------------------------

  /** Perl 版 Turn.pm changeMain の移植。 */
  async changeSettings(
    id: number,
    oldPassword: string,
    name?: string,
    password?: string,
    confirm?: string,
  ): Promise<void> {
    this.#ensureInitialized();
    const { repo, config, specialPassword } = this.#deps;
    const island0 = repo.findIsland(id);
    if (island0 === undefined) {
      throw new AppError("island_not_found");
    }

    const isSpecial =
      specialPassword !== undefined &&
      specialPassword !== "" &&
      safeEqual(oldPassword, specialPassword);

    if (!isSpecial) {
      const ok = await verifyIslandPassword(island0, oldPassword, this.#authDeps());
      if (!ok) {
        throw new AppError("wrong_password");
      }
    }

    // 確認用パスワード (名前・パスワードどちらの変更でも必ずチェックする。Perl 版と同じ順序)。
    if ((confirm ?? "") !== (password ?? "")) {
      throw new AppError("password_mismatch");
    }

    const cleanName = name !== undefined ? sanitizeText(name, MAX_NAME_LEN) : "";
    const newPasswordHash =
      password !== undefined && password !== ""
        ? await this.#deps.hasher.hash(password)
        : undefined;

    repo.transaction(() => {
      const island = repo.findIsland(id);
      if (island === undefined) {
        throw new AppError("island_not_found");
      }

      let changed = false;

      if (isSpecial) {
        island.money = 9999;
        island.food = 9999;
      }

      if (cleanName !== "") {
        if (isBadIslandName(cleanName)) {
          throw new AppError("bad_name");
        }
        if (repo.findIslandByName(cleanName) !== undefined) {
          throw new AppError("name_taken");
        }
        if (island.money < config.costChangeName) {
          throw new AppError("no_money");
        }
        if (!isSpecial) {
          island.money -= config.costChangeName;
        }
        const log = new LogCollector(repo.getMeta().turn);
        messages.logChangeName(log, island.name, cleanName);
        const { history } = log.flush();
        repo.appendHistory(history);
        island.name = cleanName;
        changed = true;
      }

      if (newPasswordHash !== undefined) {
        island.passwordHash = newPasswordHash;
        changed = true;
      }

      if (!changed && !isSpecial) {
        throw new AppError("nothing_to_change");
      }

      repo.updateIsland(island);
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

  /** Perl 版 Map.pm localBbsMain (観光者モード) の移植。 */
  postLbbsAsVisitor(id: number, name: string, message: string): IslandPageVM & { notice: string } {
    this.#ensureInitialized();
    const { repo, config } = this.#deps;
    if (!config.useLbbs) {
      throw new AppError("lbbs_disabled");
    }
    const island = repo.findIsland(id);
    if (island === undefined) {
      throw new AppError("island_not_found");
    }
    const cleanName = sanitizeText(name, MAX_LBBS_NAME_LEN);
    const cleanMessage = sanitizeText(message, MAX_LBBS_MESSAGE_LEN);
    // B5: 名前またはメッセージが空なら lbbs_empty (Perl 版はメッセージの空判定が抜けていたバグを修正)。
    if (cleanName === "" || cleanMessage === "") {
      throw new AppError("lbbs_empty");
    }

    return repo.transaction(() => {
      const meta = repo.getMeta();
      this.#pushLbbsPost(id, {
        author: "visitor",
        name: cleanName,
        message: cleanMessage,
        turn: meta.turn,
      });
      return { ...this.#buildIslandPageVM(id), notice: "掲示板に書き込みました。" };
    });
  }

  /** Perl 版 Map.pm localBbsMain (島主モード) の移植。 */
  async postLbbsAsOwner(
    id: number,
    password: string,
    name: string,
    message: string,
  ): Promise<OwnerPageVM & { notice: string }> {
    this.#ensureInitialized();
    const { repo, config } = this.#deps;
    if (!config.useLbbs) {
      throw new AppError("lbbs_disabled");
    }
    const island0 = repo.findIsland(id);
    if (island0 === undefined) {
      throw new AppError("island_not_found");
    }
    const cleanName = sanitizeText(name, MAX_LBBS_NAME_LEN);
    const cleanMessage = sanitizeText(message, MAX_LBBS_MESSAGE_LEN);
    if (cleanName === "" || cleanMessage === "") {
      throw new AppError("lbbs_empty");
    }
    const ok = await verifyIslandPassword(island0, password, this.#authDeps());
    if (!ok) {
      throw new AppError("wrong_password");
    }

    return repo.transaction(() => {
      const meta = repo.getMeta();
      this.#pushLbbsPost(id, {
        author: "owner",
        name: cleanName,
        message: cleanMessage,
        turn: meta.turn,
      });
      return { ...this.#buildOwnerPageVM(id), notice: "掲示板に書き込みました。" };
    });
  }

  /** Perl 版 Map.pm localBbsMain (削除モード) の移植。 */
  async deleteLbbs(
    id: number,
    password: string,
    number: number,
  ): Promise<OwnerPageVM & { notice: string }> {
    this.#ensureInitialized();
    const { repo, config } = this.#deps;
    if (!config.useLbbs) {
      throw new AppError("lbbs_disabled");
    }
    const island0 = repo.findIsland(id);
    if (island0 === undefined) {
      throw new AppError("island_not_found");
    }
    const ok = await verifyIslandPassword(island0, password, this.#authDeps());
    if (!ok) {
      throw new AppError("wrong_password");
    }
    if (!Number.isInteger(number) || number < 0 || number >= config.lbbsMax) {
      throw new AppError("invalid_input");
    }

    return repo.transaction(() => {
      const island = repo.findIsland(id);
      if (island === undefined) {
        throw new AppError("island_not_found");
      }
      const posts = [...island.lbbs];
      if (number < posts.length) {
        posts.splice(number, 1);
      }
      repo.replaceLbbs(id, posts);
      return { ...this.#buildOwnerPageVM(id), notice: "掲示板の書き込みを削除しました。" };
    });
  }
}
