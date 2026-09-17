// tmp/06-web-routes-and-views.md の web 層エントリポイント用の依存注入型。
// Phase 3a/3b で組み立てた Service 一式と、bootstrap/config-from-env.ts の AppConfig をまとめる。
import type { AdminService } from "../app/admin-service.ts";
import type { GameService } from "../app/game-service.ts";
import type { Clock } from "../app/ports.ts";
import type { TurnService } from "../app/turn-service.ts";
import type { AppConfig } from "../bootstrap/config-from-env.ts";

/** `createApp` に渡す依存一式。ランタイム非依存 (node:* や cloudflare:* を含まない)。 */
export interface WebDeps {
  gameService: GameService;
  turnService: TurnService;
  adminService: AdminService;
  config: AppConfig;
  /** turn-check ミドルウェアが使う時計。Date.now を直接使わない。 */
  clock: Clock;
}
