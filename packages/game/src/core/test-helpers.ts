// テスト専用のファクトリ群。index.ts からは export しない。
import type { GameConfig } from "./config.ts";
import { defaultConfig } from "./config.ts";
import { makeNewIsland } from "./island.ts";
import { LogCollector } from "./log/collector.ts";
import { createSeededRng } from "./rng.ts";
import { createTerrain } from "./terrain.ts";
import type { TurnContext } from "./turn/context.ts";
import type { Island, World } from "./types.ts";

/**
 * テスト用の島を作る。地形はデフォルトで全面海 (`createTerrain`) にする
 * (`makeNewLand` のランダム地形はテストの意図を分かりにくくするため)。
 * `overrides` で id/name/terrain/money/food 等を上書きできる。
 */
export function makeTestIsland(
  overrides: Partial<Island> = {},
  config: GameConfig = defaultConfig,
): Island {
  const base = makeNewIsland(config, createSeededRng(1), {
    id: overrides.id ?? 1,
    name: overrides.name ?? "テスト島",
    passwordHash: "hash",
  });
  base.terrain = createTerrain(config.islandSize);
  return { ...base, ...overrides };
}

/** テスト用の World を作る。 */
export function makeTestWorld(islands: Island[], turn = 1): World {
  const maxId = islands.reduce((max, island) => Math.max(max, island.id), 0);
  return {
    turn,
    lastTime: 0,
    nextIslandId: maxId + 1,
    islands,
  };
}

/** テスト用の TurnContext を作る。 */
export function makeTestContext(
  overrides: Partial<TurnContext> = {},
  config: GameConfig = defaultConfig,
): TurnContext {
  return {
    config,
    rng: createSeededRng(1),
    log: new LogCollector(1),
    turn: 1,
    points: [],
    state: new Map(),
    defenceCache: new Map(),
    ...overrides,
  };
}
