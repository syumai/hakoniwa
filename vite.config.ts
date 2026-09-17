import { defineConfig } from "vite-plus";

// 既存の Perl 資産と設計書 (tmp/) は編集対象外なので、lint / fmt どちらからも除外する。
// 設計書 (tmp/09-tooling.md) は lint.ignorePatterns のみを挙げているが、
// `vp fmt` / `vp check` は Markdown 等も含めてリポジトリ全体を走査するため、
// fmt.ignorePatterns にも同じ一覧 (+ 残りの Perl 資産) を設定している (設計書との差異)。
const nonTypeScriptAssetPatterns = [
  "**/dist/**",
  "tmp/**",
  "lib/**",
  "cgi/**",
  "t/**",
  "scripts/**",
  "README.md",
  "hako-readme.txt",
  "memo.txt",
  "cpanfile",
  "cpanfile.snapshot",
  "app.psgi",
  ".perltidyrc",
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
