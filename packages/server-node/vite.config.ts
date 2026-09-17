import { fileURLToPath } from "node:url";
import devServer from "@hono/vite-dev-server";
import { defineConfig } from "vite-plus";

// tmp/09-tooling.md packages/server-node の vite.config.ts。
// dev: `@hono/vite-dev-server` が src/dev.ts の default export (Hono app) を SSR ランナーで動かす。
// build: SSR ビルドで dist/server.js と dist/cli.js を出す。
export default defineConfig({
  plugins: [devServer({ entry: "src/dev.ts" })],
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
