// web 層テスト用の共通セットアップ。*.test.tsx ではないので vitest には拾われない。
import { AdminService } from "../app/admin-service.ts";
import {
  FakeBackupStore,
  FakeClock,
  FakeGameRepository,
  FakeLogger,
  FakePasswordHasher,
} from "../app/fake-repository.ts";
import { GameService } from "../app/game-service.ts";
import { TurnService } from "../app/turn-service.ts";
import type { AppConfig } from "../bootstrap/config-from-env.ts";
import { defaultConfig } from "../core/config.ts";
import type { GameConfig } from "../core/config.ts";
import { createSeededRng } from "../core/rng.ts";
import { createApp } from "./app.tsx";
import type { WebDeps } from "./deps.ts";

export const INITIAL_CLOCK = 1_000_000;

export interface SetupOptions {
  debug?: boolean;
  adminEnabled?: boolean;
  masterPassword?: string;
  specialPassword?: string;
  gameOverrides?: Partial<GameConfig>;
  /** 初期化 (repo.initialize) をスキップする (not_initialized のテスト用)。 */
  skipInit?: boolean;
}

export interface TestApp {
  app: ReturnType<typeof createApp>;
  repo: FakeGameRepository;
  clock: FakeClock;
  config: AppConfig;
  gameService: GameService;
  turnService: TurnService;
  adminService: AdminService;
}

export function setupTestApp(options: SetupOptions = {}): TestApp {
  const repo = new FakeGameRepository();
  if (options.skipInit !== true) {
    repo.initialize({ turn: 1, lastTime: INITIAL_CLOCK, nextIslandId: 1 });
  }
  const clock = new FakeClock(INITIAL_CLOCK);
  const hasher = new FakePasswordHasher();
  const rng = createSeededRng(42);
  const backupStore = new FakeBackupStore();
  const logger = new FakeLogger();

  const debug = options.debug ?? false;
  const game: GameConfig = { ...defaultConfig, debug, ...options.gameOverrides };

  const config: AppConfig = {
    game,
    adminEnabled: options.adminEnabled ?? true,
    debug,
    ...(options.masterPassword !== undefined ? { masterPassword: options.masterPassword } : {}),
    ...(options.specialPassword !== undefined ? { specialPassword: options.specialPassword } : {}),
  };

  const gameService = new GameService({
    repo,
    hasher,
    clock,
    config: game,
    rng,
    ...(config.masterPassword !== undefined ? { masterPassword: config.masterPassword } : {}),
    ...(config.specialPassword !== undefined ? { specialPassword: config.specialPassword } : {}),
  });

  const turnService = new TurnService({ repo, config: game, rng, backupStore, logger });
  const adminService = new AdminService({ repo, clock, config: game, backupStore, turnService });

  const deps: WebDeps = { gameService, turnService, adminService, config, clock };
  const app = createApp(deps);

  return { app, repo, clock, config, gameService, turnService, adminService };
}

/** `application/x-www-form-urlencoded` の body を組み立てる小さなヘルパ。 */
export function formBody(fields: Record<string, string | number>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    params.set(key, String(value));
  }
  return params;
}

export async function postForm(
  app: ReturnType<typeof createApp>,
  path: string,
  fields: Record<string, string | number>,
  headers: Record<string, string> = {},
): Promise<Response> {
  return await app.request(path, {
    method: "POST",
    body: formBody(fields),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
  });
}
