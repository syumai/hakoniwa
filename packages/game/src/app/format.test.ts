import { describe, expect, it } from "vitest";
import { formatDuration } from "./format.ts";

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
