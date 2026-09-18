// @cloudflare/vitest-pool-workers が提供する `cloudflare:workers` の `env` / `exports` の型付け用。
// テストから `import { env } from "cloudflare:workers"` した際に、wrangler.jsonc の
// バインディングに応じた具体的な型 (Env) が付くようにする。
import type { Env as WorkerEnv } from "../src/env.ts";

// このファイルは import を持つため module 扱いになる。`declare global` で包むことで
// @cloudflare/workers-types の ambient `Cloudflare.Env` (空の interface) にマージする。
declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}
