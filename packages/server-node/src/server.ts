// `vp build` 後 `node dist/server.js` で起動するエントリポイント。
// 実体は serve.ts の startServer (npm パッケージの `hakoniwa serve` と共通)。
import { loadNodeConfig } from "./config.ts";
import { startServer } from "./serve.ts";

startServer(loadNodeConfig());
