import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite-plus";
import type { PluginOption } from "vite-plus";

// tmp/09-tooling.md / tmp/12-workers-adapter.md packages/server-workers の vite.config.ts。
// dev/build は @cloudflare/vite-plugin が wrangler.jsonc を読み、Worker を workerd 上で動かす。
// テスト (vitest-pool-workers) は別ファイル vitest.config.ts に分離する
// (cloudflareTest プラグインと @cloudflare/vite-plugin は同居できないため)。
//
// `unknown` 経由のキャストの理由は packages/server-node/vite.config.ts のコメント参照
// (@cloudflare/vite-plugin が返す Plugin[] は実体の `vite` パッケージの型で、vite-plus の
// `PluginOption` (`@voidzero-dev/vite-plus-core` 由来) とは別モジュールの型のため)。
export default defineConfig({
  // cloudflare() は既に Plugin[] を返すため、配列でくるまない
  // (くるむと Plugin[][] になり、defineConfig 側の型比較が深くなりすぎてエラーになる)。
  plugins: cloudflare({ configPath: "../../wrangler.jsonc" }) as unknown as PluginOption[],
  // @hakoniwajs/core の JSX (hono/jsx) をこのパッケージのバンドルでも変換する必要がある
  // (packages/server-node/vite.config.ts と同じ理由: vite-plus は rolldown-vite ベースで
  // esbuild オプションが deprecated のため oxc オプションを使う)。
  oxc: { jsx: { runtime: "automatic", importSource: "hono/jsx" } },
});
