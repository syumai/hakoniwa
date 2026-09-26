// tmp/06-web-routes-and-views.md の web 層エントリポイント用の依存注入型。
// Phase 3a/3b で組み立てた Service 一式と、bootstrap/config-from-env.ts の AppConfig をまとめる。
import type { AdminService } from "../app/admin-service.ts";
import type { GameService } from "../app/game-service.ts";
import type { Clock, Logger } from "../app/ports.ts";
import type { TurnService } from "../app/turn-service.ts";
import type { AppConfig } from "../bootstrap/config-from-env.ts";
import type { createAuth } from "../bootstrap/auth.ts";

/** `createApp` に渡す依存一式。ランタイム非依存 (node:* や cloudflare:* を含まない)。 */
export interface WebDeps {
  gameService: GameService;
  turnService: TurnService;
  adminService: AdminService;
  config: AppConfig;
  /** turn-check ミドルウェアが使う時計。Date.now を直接使わない。 */
  clock: Clock;
  /** better-auth インスタンス。session-middleware/routes/auth.tsx/routes/account.tsx から使う。 */
  auth: ReturnType<typeof createAuth>;
  /** better-auth の APIError 等、想定内だがログに残したいエラーの記録先。 */
  logger: Logger;
}
