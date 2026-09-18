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
import { createCsrfToken } from "../bootstrap/csrf.ts";
import type { AppConfig } from "../bootstrap/config-from-env.ts";
import { defaultConfig } from "../core/config.ts";
import type { GameConfig } from "../core/config.ts";
import { createSeededRng } from "../core/rng.ts";
import { createApp } from "./app.tsx";
import type { WebDeps } from "./deps.ts";

export const INITIAL_CLOCK = 1_000_000;

export const SESSION_COOKIE_NAME = "hako.session_token";

export interface FakeSessionUser {
  id: string;
  name: string;
  email: string;
  image?: string;
}

/**
 * tmp/14-users-auth.md「サーバーサイドでの呼び出し」節の `auth.api.getSession` の最小モック。
 * web 層のテストではログイン方法 (OAuth/magic-link/devLogin) 自体は better-auth 本体の責務なので
 * 検証しない (それは packages/server-node の実 DB 結合テストで行う)。ここでは
 * `getSession` がテストで用意したユーザーを返せれば十分。
 */
export class FakeAuth {
  #sessions = new Map<string, { user: FakeSessionUser; sessionId: string }>();
  #counter = 0;

  api = {
    getSession: async ({ headers }: { headers: Headers }) => {
      const token = extractSessionToken(headers);
      if (token === undefined) {
        return null;
      }
      const entry = this.#sessions.get(token);
      if (entry === undefined) {
        return null;
      }
      const now = new Date();
      return {
        user: {
          ...entry.user,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
        session: {
          id: entry.sessionId,
          token,
          userId: entry.user.id,
          expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
          createdAt: now,
          updatedAt: now,
        },
      };
    },
  };

  /** `/api/auth/*` は web 層のテストでは叩かない想定 (実 better-auth を使う結合テストの領分)。 */
  handler = (): Promise<Response> => {
    throw new Error("FakeAuth.handler: not implemented (use packages/server-node の結合テスト)");
  };

  /** テストが「ログイン中」を模擬するための Cookie ヘッダ値と session.id を発行する。 */
  login(user: FakeSessionUser): { cookieHeader: string; sessionId: string } {
    this.#counter += 1;
    const token = `test-token-${this.#counter}`;
    const sessionId = `test-session-${this.#counter}`;
    this.#sessions.set(token, { user, sessionId });
    return { cookieHeader: `${SESSION_COOKIE_NAME}=${token}`, sessionId };
  }
}

function extractSessionToken(headers: Headers): string | undefined {
  const cookieHeader = headers.get("cookie");
  if (cookieHeader === null) {
    return undefined;
  }
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === SESSION_COOKIE_NAME) {
      return rawValue.join("=");
    }
  }
  return undefined;
}

export interface SetupOptions {
  debug?: boolean;
  adminEnabled?: boolean;
  devLogin?: boolean;
  adminEmails?: string[];
  ngWords?: string[];
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
  auth: FakeAuth;
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
  const auth = new FakeAuth();

  const debug = options.debug ?? false;
  const game: GameConfig = { ...defaultConfig, debug, ...options.gameOverrides };

  const config: AppConfig = {
    game,
    auth: {
      baseUrl: "http://localhost:5173",
      secret: "test-secret",
      devLogin: options.devLogin ?? false,
      adminEmails: options.adminEmails ?? [],
    },
    mail: { mailFrom: "hakoniwa@example.com" },
    ngWords: options.ngWords ?? [],
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

  const deps: WebDeps = {
    gameService,
    turnService,
    adminService,
    config,
    clock,
    auth: auth as unknown as WebDeps["auth"],
    logger,
  };
  const app = createApp(deps);

  return { app, repo, clock, config, gameService, turnService, adminService, auth };
}

/**
 * `testApp.auth.login(user)` でセッションを作り、そのまま POST に使える Cookie ヘッダと
 * `_csrf` トークンをまとめて返す。
 */
export async function loginAs(
  testApp: TestApp,
  user: FakeSessionUser,
): Promise<{ cookie: string; csrfToken: string; user: FakeSessionUser }> {
  const { cookieHeader, sessionId } = testApp.auth.login(user);
  const csrfToken = await createCsrfToken(testApp.config.auth.secret, sessionId);
  return { cookie: cookieHeader, csrfToken, user };
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
