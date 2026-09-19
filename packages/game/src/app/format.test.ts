import { describe, expect, it } from "vitest";
import { formatDuration, parseDuration } from "./format.ts";

describe("formatDuration", () => {
  it("60秒未満は秒表示", () => {
    expect(formatDuration(0)).toBe("0秒");
    expect(formatDuration(59)).toBe("59秒");
  });

  it("分未満の端数は切り捨てる", () => {
    expect(formatDuration(90)).toBe("1分");
    expect(formatDuration(119)).toBe("1分");
  });

  it("時間ちょうどなら分を省略する", () => {
    expect(formatDuration(21600)).toBe("6時間");
    expect(formatDuration(3600)).toBe("1時間");
  });

  it("分だけなら時間を省略する", () => {
    expect(formatDuration(60)).toBe("1分");
    expect(formatDuration(1800)).toBe("30分");
  });

  it("時間と分の両方がある場合", () => {
    expect(formatDuration(3900)).toBe("1時間5分");
    expect(formatDuration(23400)).toBe("6時間30分");
  });
});

describe("parseDuration", () => {
  it("数字のみは秒として扱う", () => {
    expect(parseDuration("3600")).toBe(3600);
    expect(parseDuration("60")).toBe(60);
  });

  it("h 指定は時間", () => {
    expect(parseDuration("6h")).toBe(21600);
    expect(parseDuration("1h")).toBe(3600);
  });

  it("m 指定は分", () => {
    expect(parseDuration("90m")).toBe(5400);
    expect(parseDuration("1m")).toBe(60);
  });

  it("h と m を組み合わせられる", () => {
    expect(parseDuration("1h30m")).toBe(5400);
    expect(parseDuration("6h30m")).toBe(23400);
  });

  it("0 以下・不正な形式は undefined", () => {
    expect(parseDuration("0")).toBeUndefined();
    expect(parseDuration("0h")).toBeUndefined();
    expect(parseDuration("0h0m")).toBeUndefined();
    expect(parseDuration("")).toBeUndefined();
    expect(parseDuration("abc")).toBeUndefined();
    expect(parseDuration("1d")).toBeUndefined();
    expect(parseDuration("30s")).toBeUndefined();
    expect(parseDuration("-60")).toBeUndefined();
    expect(parseDuration("1m30m")).toBeUndefined();
  });
});
