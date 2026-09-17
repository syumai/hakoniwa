// tmp/09-tooling.md 「packages/server-node」節: `@hono/vite-dev-server` 用のエントリ。
// Vite の `publicDir` (packages/game/public) が images/style.css/owner.js を配信するため、
// ここでは server.ts と同じ組み立てを行い、ランタイム非依存の Hono app をそのまま export する。
import { composeNode } from "./compose.ts";
import { loadNodeConfig } from "./config.ts";

const config = loadNodeConfig();
const deps = composeNode(config);

export default deps.app;
