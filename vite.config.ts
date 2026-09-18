import { defineConfig } from "vite-plus";

// 設計書 (tmp/) とオリジナルの readme、静的アセットは lint / fmt どちらからも除外する。
const nonTypeScriptAssetPatterns = [
  "**/dist/**",
  "tmp/**",
  "hako-readme.txt",
  // Adapter が配信する静的アセット (画像/CSS/座標選択補助スクリプト)。
  // ブラウザにそのまま配信する素の JS であり、プロジェクトの ESM/TS Lint 対象ではない。
  "packages/*/public/**",
];

export default defineConfig({
  test: {
    // packages/server-workers は除外する。vp test (vite-plus 同梱の vitest) は独自の
    // VitestModuleRunner でテストを実行するが、@cloudflare/vitest-pool-workers の
    // cloudflareTest プラグインは実行中の vitest インスタンス (TestProject 等) に直接フックする
    // 実装のため、vite-plus 同梱の別インスタンス経由では `describe()` が
    // "Cannot read properties of undefined (reading 'config')" で落ちる
    // (tmp/12-workers-adapter.md 「実装時の指示」、tmp/09-tooling.md 参照。設計書との差異)。
    // packages/server-workers 単体では `pnpm --filter @hakoniwa/server-workers test`
    // (実体は素の `vitest run`) で問題なく動く。
    projects: ["packages/*", "!packages/server-workers"],
  },
  fmt: {
    ignorePatterns: nonTypeScriptAssetPatterns,
  },
  lint: {
    ignorePatterns: nonTypeScriptAssetPatterns,
    options: { typeAware: true, typeCheck: true },
    overrides: [
      // ゲーム本体はランタイム非依存
      {
        files: ["packages/game/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            { patterns: ["node:*", "cloudflare:*", "@hono/node-server*"] },
          ],
        },
      },
      // core は上位層と hono に依存しない
      {
        files: ["packages/game/src/core/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                "node:*",
                "cloudflare:*",
                "hono*",
                "../app/*",
                "../storage/*",
                "../web/*",
                "../bootstrap/*",
              ],
            },
          ],
        },
      },
    ],
  },
});
