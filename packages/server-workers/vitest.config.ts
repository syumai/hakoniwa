import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// tmp/09-tooling.md / tmp/12-workers-adapter.md: テストは @cloudflare/vitest-pool-workers
// (cloudflareTest プラグイン) で workerd 上で実行する。@cloudflare/vite-plugin (dev/build 用の
// vite.config.ts) とは同居できないため、テスト専用にこのファイルを分離する。
// root の vite.config.ts (`test.projects: ["packages/*"]`) は、ディレクトリ配下に
// vitest.config.ts があればそちらを優先して読むため、root 側の変更は不要。
export default defineConfig({
  test: {
    // workerd 上での初回リクエスト (better-auth/JSX の初期化を含む) はコールドスタートが
    // 既定の 5000ms を超えることがあるため、少し余裕を持たせる。
    testTimeout: 20000,
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // wrangler.jsonc の vars を上書きし、テストが loadConfigFromEnv を通せるようにする
      // (HAKONIWA_AUTH_SECRET は本番では `wrangler secret put` で設定する必須値)。
      miniflare: {
        bindings: {
          HAKONIWA_AUTH_SECRET: "test-secret-0123456789abcdef0123456789",
          HAKONIWA_DEV_LOGIN: "true",
          HAKONIWA_ADMIN_EMAILS: "admin@example.com",
          HAKONIWA_BASE_URL: "http://example.com",
        },
      },
    }),
  ],
});
