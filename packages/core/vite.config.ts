import { defineConfig } from "vite-plus";

// packages/core はビルドスクリプトを持たない (テスト設定のみ)。
// 設計書 (tmp/09-tooling.md) は esbuild オプションを指定しているが、
// vite-plus (rolldown-vite ベース) では esbuild は deprecated であり、
// 指定しても oxc 側の設定で上書きされ警告が出るため oxc オプションを使う。
export default defineConfig({
  oxc: { jsx: { runtime: "automatic", importSource: "hono/jsx" } },
  test: { include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
