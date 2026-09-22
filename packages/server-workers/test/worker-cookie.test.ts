// 本番で発覚したバグの回帰テスト: better-auth はリクエストが https のとき (本番の
// https://hakoniwa.syumai.dev は常に https) セッション Cookie 名の先頭に `__Secure-` を付ける
// (`SESSION_COOKIE_NAMES` のコメント参照)。以前の `worker.ts` の Cookie 抽出は
// `hako.session_token` への完全一致だけだったため、本番ではセッション Cookie を見つけられず、
// ログイン中のユーザーにも匿名のスナップショットが返ってしまっていた (トップ・観光ページで
// ログアウトしているように見えるバグ)。
//
// `packages/server-workers/test/snapshot-cache.test.ts` の統合テスト (2e.) はこの環境
// (@cloudflare/vitest-pool-workers) 上では better-auth 自身のセッション検証が常に接頭辞無しの
// 名前を期待する (実行環境の判定上、ローカルの http 相当になる) ため、`__Secure-` 付き Cookie
// 単体では DO 側の検証まで含めて完全に本番を再現できない。そのため、Cookie 抽出ロジック
// (`extractSessionCookieValue`) 自体は、better-auth の実際の Cookie 発行に依存しないこの
// ユニットテストで直接検証する。
import { describe, expect, it } from "vitest";
import { extractSessionCookieValue } from "../src/worker.ts";

describe("extractSessionCookieValue", () => {
  it("素の hako.session_token (ローカル開発の http) を認識する", () => {
    expect(extractSessionCookieValue("hako.session_token=abc123")).toBe("abc123");
  });

  it("__Secure-hako.session_token (本番の https) を認識する", () => {
    expect(extractSessionCookieValue("__Secure-hako.session_token=abc123")).toBe("abc123");
  });

  it("__Host-hako.session_token も念のため認識する", () => {
    expect(extractSessionCookieValue("__Host-hako.session_token=abc123")).toBe("abc123");
  });

  it("他の Cookie と混在していても、ヘッダ中の出現順で最初に一致したものを返す", () => {
    expect(extractSessionCookieValue("foo=bar; __Secure-hako.session_token=abc123; baz=qux")).toBe(
      "abc123",
    );
    expect(
      extractSessionCookieValue(
        "__Secure-hako.session_token=secure-value; hako.session_token=plain-value",
      ),
    ).toBe("secure-value");
  });

  it("前後の空白を無視する", () => {
    expect(extractSessionCookieValue(" __Secure-hako.session_token = abc123 ")).toBe("abc123");
  });

  it("セッション Cookie が無ければ undefined を返す (他の hako.* 以外の Cookie は無視する)", () => {
    expect(extractSessionCookieValue("foo=bar; baz=qux")).toBeUndefined();
    expect(extractSessionCookieValue("")).toBeUndefined();
    // 接頭辞違い・大文字小文字違いなど、候補に無い名前は無視する。
    expect(extractSessionCookieValue("hako.session_token_extra=abc123")).toBeUndefined();
  });
});
