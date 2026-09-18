// web 層テスト用の共通セットアップ。*.test.tsx ではないので vitest には拾われない。
import { AdminService } from "../app/admin-service.ts";
import { AuthMethodPolicy } from "../app/auth-methods.ts";
import {
  FakeBackupStore,
  FakeClock,
  FakeGameRepository,
  FakeLogger,
  FakeSettingsRepository,
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
  /**
   * v1 の名残 (マスターパスワード認証)。v2 では better-auth に置き換わったため未使用。
   * 既存テストの呼び出し形を壊さないために受け付けるだけで、AppConfig には反映しない。
   */
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
  const rng = createSeededRng(42);
  const backupStore = new FakeBackupStore();
  const logger = new FakeLogger();

  const debug = options.debug ?? false;
  const game: GameConfig = { ...defaultConfig, debug, ...options.gameOverrides };

  const config: AppConfig = {
    game,
    auth: {
      baseUrl: "http://localhost:5173",
      secret: "test-secret",
      devLogin: false,
      adminEmails: [],
    },
    mail: { mailFrom: "hakoniwa@example.com" },
    ngWords: [],
    adminEnabled: options.adminEnabled ?? true,
    debug,
  };

  const gameService = new GameService({ repo, clock, config: game, rng, ngWords: config.ngWords });

  const turnService = new TurnService({ repo, config: game, rng, backupStore, logger });
  const authMethods = new AuthMethodPolicy({
    configured: { x: false, discord: false, email: true },
    settings: new FakeSettingsRepository(),
  });
  const adminService = new AdminService({
    repo,
    clock,
    config: game,
    backupStore,
    turnService,
    authMethods,
    mailerIsConsole: true,
  });

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
