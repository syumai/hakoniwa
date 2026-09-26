// islands / lbbs_posts 行 ⇔ core の Island / IslandSummary / LbbsPost の変換。
// 壊れた JSON (terrain/commands/prize_turns) は Error を throw する
// (07-auth-and-security.md 「terrain/commands の JSON は DB から読むときに形状検証」)。
import type { IslandSummary } from "../app/ports.ts";
import { terrainFromJSON } from "../core/terrain.ts";
import type { Command, Island, LbbsAuthor, LbbsPost, Prize } from "../core/types.ts";

/** `SELECT * FROM islands` 1 行分。 */
export interface IslandRow {
  game_id: number;
  id: number;
  rank: number;
  name: string;
  owner_user_id: string;
  comment: string;
  score: number;
  absent: number;
  money: number;
  food: number;
  pop: number;
  area: number;
  farm: number;
  factory: number;
  mountain: number;
  prize_flags: number;
  prize_monsters: number;
  prize_turns: string;
  terrain: string;
  commands: string;
  created_turn: number;
  abandoned_at: number | null;
}

/** `SELECT * FROM lbbs_posts` 1 行分。 */
export interface LbbsRow {
  game_id: number;
  island_id: number;
  position: number;
  author: string;
  user_id: string;
  name: string;
  message: string;
  turn: number;
}

/** UPDATE/INSERT で使う、rank と created_turn を除いた列の値。 */
interface IslandColumnValues {
  id: number;
  name: string;
  ownerUserId: string;
  comment: string;
  score: number;
  absent: number;
  money: number;
  food: number;
  pop: number;
  area: number;
  farm: number;
  factory: number;
  mountain: number;
  prizeFlags: number;
  prizeMonsters: number;
  prizeTurns: string;
  terrain: string;
  commands: string;
  abandonedAt: number | null;
}

function parseJSON(json: string, field: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new Error(`mapper: invalid JSON for ${field}`);
  }
}

function parsePrizeTurns(json: string): number[] {
  const parsed = parseJSON(json, "prize_turns");
  if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "number")) {
    throw new Error("mapper: prize_turns must be a JSON array of numbers");
  }
  return parsed;
}

function parseCommand(raw: unknown, index: number): Command {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`mapper: commands[${index}] has invalid shape`);
  }
  // Record<string, number> 経由だと noUncheckedIndexedAccess で `number | undefined` に
  // なってしまうため、Reflect.get (戻り値 any) 経由で読んでから typeof で narrowing する。
  const kind: unknown = Reflect.get(raw, "kind");
  const target: unknown = Reflect.get(raw, "target");
  const x: unknown = Reflect.get(raw, "x");
  const y: unknown = Reflect.get(raw, "y");
  const arg: unknown = Reflect.get(raw, "arg");
  if (
    typeof kind !== "number" ||
    typeof target !== "number" ||
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof arg !== "number"
  ) {
    throw new Error(`mapper: commands[${index}] has invalid shape`);
  }
  return { kind: kind as Command["kind"], target, x, y, arg };
}

function parseCommands(json: string, commandMax: number): Command[] {
  const parsed = parseJSON(json, "commands");
  if (!Array.isArray(parsed)) {
    throw new Error("mapper: commands must be a JSON array");
  }
  if (parsed.length !== commandMax) {
    throw new Error(`mapper: commands must have length ${commandMax}, got ${parsed.length}`);
  }
  return parsed.map((raw, index) => parseCommand(raw, index));
}

function rowToLbbsPost(row: LbbsRow): LbbsPost {
  if (row.author !== "visitor" && row.author !== "owner") {
    throw new Error(`mapper: invalid lbbs author: ${row.author}`);
  }
  const author: LbbsAuthor = row.author;
  return { author, userId: row.user_id, name: row.name, message: row.message, turn: row.turn };
}

/** islandSize / commandMax を注入して行 ⇔ ドメインオブジェクトを変換する。 */
export class IslandMapper {
  readonly #islandSize: number;
  readonly #commandMax: number;

  constructor(config: { islandSize: number; commandMax: number }) {
    this.#islandSize = config.islandSize;
    this.#commandMax = config.commandMax;
  }

  rowToPrize(row: Pick<IslandRow, "prize_flags" | "prize_monsters" | "prize_turns">): Prize {
    return {
      flags: row.prize_flags,
      monsters: row.prize_monsters,
      turns: parsePrizeTurns(row.prize_turns),
    };
  }

  rowToSummary(row: IslandRow): IslandSummary {
    return {
      id: row.id,
      name: row.name,
      ownerUserId: row.owner_user_id,
      comment: row.comment,
      score: row.score,
      absent: row.absent,
      money: row.money,
      food: row.food,
      pop: row.pop,
      area: row.area,
      farm: row.farm,
      factory: row.factory,
      mountain: row.mountain,
      prize: this.rowToPrize(row),
      abandonedAt: row.abandoned_at,
    };
  }

  rowToIsland(row: IslandRow, lbbsRows: LbbsRow[]): Island {
    return {
      id: row.id,
      name: row.name,
      ownerUserId: row.owner_user_id,
      comment: row.comment,
      score: row.score,
      absent: row.absent,
      money: row.money,
      food: row.food,
      pop: row.pop,
      area: row.area,
      farm: row.farm,
      factory: row.factory,
      mountain: row.mountain,
      prize: this.rowToPrize(row),
      terrain: terrainFromJSON(this.#islandSize, parseJSON(row.terrain, "terrain") as number[][]),
      commands: parseCommands(row.commands, this.#commandMax),
      lbbs: lbbsRows.map(rowToLbbsPost),
      abandonedAt: row.abandoned_at,
    };
  }

  /** INSERT/UPDATE にそのまま渡せる、rank と created_turn を除いた列値。 */
  islandToColumnValues(island: Island): IslandColumnValues {
    if (island.commands.length !== this.#commandMax) {
      throw new Error(
        `mapper: island.commands must have length ${this.#commandMax}, got ${island.commands.length}`,
      );
    }
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
      prizeFlags: island.prize.flags,
      prizeMonsters: island.prize.monsters,
      prizeTurns: JSON.stringify(island.prize.turns),
      terrain: JSON.stringify(island.terrain.toJSON()),
      commands: JSON.stringify(island.commands),
      abandonedAt: island.abandonedAt,
    };
  }
}
