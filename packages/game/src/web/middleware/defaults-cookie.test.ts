// updateDefaults が同一リクエスト内で c.get('defaults') に反映されることのテスト。
// Perl 版 cgiInput が $HdefaultX 等を同一リクエスト内で上書きし、直後の描画がそれを使う挙動に対応する。
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { defaultsCookieMiddleware, updateDefaults } from "./defaults-cookie.ts";
import type { DefaultsCookieEnv } from "./defaults-cookie.ts";

describe("updateDefaults", () => {
  it("同一リクエスト内で c.get('defaults') に patch がマージされる", async () => {
    const app = new Hono<DefaultsCookieEnv>();
    app.use(defaultsCookieMiddleware());
    app.get("/", (c) => {
      // ミドルウェア直後は Cookie 由来の空の defaults。
      expect(c.get("defaults")).toEqual({});
      updateDefaults(c, { pointX: 5, pointY: 6, kind: 2 });
      // updateDefaults 直後は同一リクエスト内ですぐ反映される (Set-Cookie を待たない)。
      expect(c.get("defaults")).toEqual({ pointX: 5, pointY: 6, kind: 2 });
      updateDefaults(c, { targetIslandId: 1 });
      expect(c.get("defaults")).toEqual({ pointX: 5, pointY: 6, kind: 2, targetIslandId: 1 });
      return c.text("ok");
    });

    const res = await app.request("/");
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("hako_defaults");
  });
});
