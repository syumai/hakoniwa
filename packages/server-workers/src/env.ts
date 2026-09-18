// wrangler.jsonc の bindings/vars/secrets に対応する `Env` 型。
// `HakoniwaGame` (game-object.ts) の import type { Env } from "./env.ts";
import type { HakoniwaGame } from "./game-object.ts";

export interface Env {
  /** durable_objects.bindings (wrangler.jsonc)。世界は 1 つなので getByName('main') で固定して使う。 */
  GAME: DurableObjectNamespace<HakoniwaGame>;

  // 以下は vars (wrangler.jsonc) または `wrangler secret put` で設定する。
  // すべて loadConfigFromEnv (@hakoniwa/game) がそのまま読む文字列環境変数。
  HAKONIWA_BASE_URL?: string;
  HAKONIWA_AUTH_SECRET?: string;
  HAKONIWA_X_CLIENT_ID?: string;
  HAKONIWA_X_CLIENT_SECRET?: string;
  HAKONIWA_DISCORD_CLIENT_ID?: string;
  HAKONIWA_DISCORD_CLIENT_SECRET?: string;
  HAKONIWA_RESEND_API_KEY?: string;
  HAKONIWA_MAIL_FROM?: string;
  HAKONIWA_DEV_LOGIN?: string;
  HAKONIWA_ADMIN_EMAILS?: string;
  HAKONIWA_NG_WORDS?: string;
  HAKONIWA_ADMIN_ENABLED?: string;
  HAKONIWA_DEBUG?: string;
  HAKONIWA_USE_LBBS?: string;
  HAKONIWA_UNIT_TIME_SEC?: string;
  HAKONIWA_MAX_CATCH_UP_TURNS?: string;
  HAKONIWA_SITE_TITLE?: string;
  HAKONIWA_ADMIN_NAME?: string;
  HAKONIWA_EMAIL?: string;
  HAKONIWA_BBS_URL?: string;
  HAKONIWA_TOPPAGE_URL?: string;
}
