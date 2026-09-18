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
    projects: ["packages/*"],
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
