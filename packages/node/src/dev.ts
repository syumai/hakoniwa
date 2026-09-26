// tmp/09-tooling.md 「packages/node」節: `@hono/vite-dev-server` 用のエントリ。
// Vite の `publicDir` (packages/core/public) が images/style.css/owner.js を配信するため、
// ここでは server.ts と同じ組み立てを行い、ランタイム非依存の Hono app をそのまま export する。
import { composeNode } from "./compose.ts";
import { loadNodeConfig } from "./config.ts";

const config = loadNodeConfig();
const deps = composeNode(config);

// tmp/14-users-auth.md 「開発ログインの保護」節: 開発サーバーでも有効化されていることが分かるように警告する。
if (config.auth.devLogin) {
  console.warn(
    "hakoniwa: HAKONIWA_DEV_LOGIN=true です。開発ログイン (任意のメールアドレスでログインできる機能) が有効になっています。本番環境では無効にしてください。",
  );
}

export default deps.app;
