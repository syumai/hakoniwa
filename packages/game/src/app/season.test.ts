// tmp/16-season.md 「状態判定」節のテスト。
import { describe, expect, it } from "vitest";
import type { GameMeta } from "./ports.ts";
import { buildSeasonVM, isBeforeStart, isFinished } from "./season.ts";

function meta(overrides: Partial<GameMeta> = {}): GameMeta {
  return {
    turn: 1,
    lastTime: 1000,
    nextIslandId: 1,
    finalTurn: null,
    startAt: 1000,
    unitTimeSec: 21600,
    ...overrides,
  };
}

describe("isFinished", () => {
  it("finalTurn が null なら常に false", () => {
    expect(isFinished(meta({ turn: 9999, finalTurn: null }))).toBe(false);
  });

  it("turn が finalTurn 以下なら false", () => {
    expect(isFinished(meta({ turn: 5, finalTurn: 5 }))).toBe(false);
  });

  it("turn が finalTurn を超えたら true", () => {
    expect(isFinished(meta({ turn: 6, finalTurn: 5 }))).toBe(true);
  });
});

describe("isBeforeStart", () => {
  it("turn===1 かつ now < startAt なら true", () => {
    expect(isBeforeStart(meta({ turn: 1, startAt: 1000 }), 999)).toBe(true);
  });

  it("turn===1 でも now >= startAt なら false", () => {
    expect(isBeforeStart(meta({ turn: 1, startAt: 1000 }), 1000)).toBe(false);
  });

  it("turn が1でなければ false", () => {
    expect(isBeforeStart(meta({ turn: 2, startAt: 1000 }), 0)).toBe(false);
  });
});

describe("buildSeasonVM", () => {
  const unitTimeSec = 21600;

  it("開始前: state='before'、nextTurnAt は null", () => {
    const vm = buildSeasonVM(meta({ turn: 1, startAt: 1000, finalTurn: null, unitTimeSec }), 500);
    expect(vm).toEqual({
      turn: 1,
      finalTurn: null,
      state: "before",
      startAt: 1000,
      finishedAtTurn: null,
      nextTurnAt: null,
      unitTimeSec,
    });
  });

  it("進行中: state='running'、nextTurnAt は lastTime + unitTimeSec", () => {
    const vm = buildSeasonVM(
      meta({ turn: 3, lastTime: 5000, startAt: 1000, finalTurn: 10, unitTimeSec }),
      5000,
    );
    expect(vm).toEqual({
      turn: 3,
      finalTurn: 10,
      state: "running",
      startAt: 1000,
      finishedAtTurn: null,
      nextTurnAt: 5000 + unitTimeSec,
      unitTimeSec,
    });
  });

  it("進行中: nextTurnAt は config ではなく meta.unitTimeSec を使う", () => {
    const vm = buildSeasonVM(
      meta({ turn: 3, lastTime: 5000, startAt: 1000, finalTurn: 10, unitTimeSec: 60 }),
      5000,
    );
    expect(vm.nextTurnAt).toBe(5060);
    expect(vm.unitTimeSec).toBe(60);
  });

  it("終了後: state='finished'、finishedAtTurn は finalTurn、nextTurnAt は null", () => {
    const vm = buildSeasonVM(meta({ turn: 11, startAt: 1000, finalTurn: 10, unitTimeSec }), 999999);
    expect(vm).toEqual({
      turn: 11,
      finalTurn: 10,
      state: "finished",
      startAt: 1000,
      finishedAtTurn: 10,
      nextTurnAt: null,
      unitTimeSec,
    });
  });
});
