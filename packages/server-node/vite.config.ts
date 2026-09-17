import { defineConfig } from "vite-plus";

// tmp/09-tooling.md packages/server-node のテスト設定。
// 実 SQLite (node:sqlite) を使う storage / turn / backup / driver のテストをここに置く。
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
