import { fileURLToPath } from "node:url";
import devServer from "@hono/vite-dev-server";
import { defineConfig } from "vite-plus";
import type { PluginOption } from "vite-plus";

// tmp/09-tooling.md packages/server-node の vite.config.ts。
// dev: `@hono/vite-dev-server` が src/dev.ts の default export (Hono app) を SSR ランナーで動かす。
// build: SSR ビルドで dist/server.js と dist/cli.js を出す。
//
// 設計書との差異: Phase 8 (server-workers) が wrangler/@cloudflare/vite-plugin を依存に追加した
// ことで、pnpm のワークスペース全体でピア解決が変わり (@hono/vite-dev-server の任意ピアである
// wrangler/miniflare が解決されるようになった)、@hono/vite-dev-server が返す Plugin の型が
// 実体の `vite` パッケージを指すようになった。一方 `vite-plus` の `defineConfig` が期待する
// `PluginOption` は `vite-plus` 自身が同梱する `vite` 相当 (`@voidzero-dev/vite-plus-core`) の型で、
// 両者は構造的にほぼ同じだが別モジュールの型のため、そのまま渡すと型チェッカーが
// `Excessive stack depth` で落ちる (再帰的な Plugin 型同士の比較)。`unknown` 経由のキャストで
// この型の同一性チェックを回避する (実行時の挙動は変わらない)。
export default defineConfig({
  plugins: [devServer({ entry: "src/dev.ts" })] as unknown as PluginOption[],
  publicDir: fileURLToPath(new URL("../game/public", import.meta.url)),
  build: {
    ssr: true,
    outDir: "dist",
    rollupOptions: {
      input: { server: "src/server.ts", cli: "src/cli.ts" },
      output: { entryFileNames: "[name].js" },
    },
  },
  // @hakoniwa/game は .ts を exports しているため、ソースからバンドルへ同梱する。
  ssr: { noExternal: ["@hakoniwa/game"] },
  // 設計書 (tmp/09-tooling.md) は esbuild オプションを指定しているが、packages/game/vite.config.ts
  // と同じ理由 (vite-plus は rolldown-vite ベースで esbuild が deprecated) で oxc オプションを使う。
  oxc: { jsx: { runtime: "automatic", importSource: "hono/jsx" } },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
