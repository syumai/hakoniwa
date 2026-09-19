// tmp/16-season.md 「状態判定」節 + tmp/18-games.md 「定義」節のテスト。
import { describe, expect, it } from "vitest";
import type { GameMeta } from "./ports.ts";
import { buildSeasonVM, isBeforeStart, isFinished } from "./season.ts";

function meta(overrides: Partial<GameMeta> = {}): GameMeta {
  return {
    id: 1,
    name: "第 1 回",
    status: "running",
    turn: 1,
    lastTime: 1000,
    nextIslandId: 1,
    finalTurn: null,
    startAt: 1000,
    unitTimeSec: 21600,
    createdAt: 1000,
    finishedAt: null,
    ...overrides,
  };
}

describe("isFinished", () => {
  it("status='running' なら false", () => {
    expect(isFinished(meta({ status: "running", turn: 9999, finalTurn: null }))).toBe(false);
  });

  it("status='running' で turn が finalTurn を超えていても、status を明示的に更新するまでは false", () => {
    expect(isFinished(meta({ status: "running", turn: 6, finalTurn: 5 }))).toBe(false);
  });

  it("status='finished' なら true (tmp/18-games.md: 終了判定は状態列に昇格した)", () => {
    expect(isFinished(meta({ status: "finished", turn: 6, finalTurn: 5, finishedAt: 6000 }))).toBe(
      true,
    );
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

  it("終了済みなら turn===1 でも false", () => {
    expect(
      isBeforeStart(meta({ turn: 1, startAt: 1000, status: "finished", finishedAt: 0 }), 0),
    ).toBe(false);
  });
});

describe("buildSeasonVM", () => {
  const unitTimeSec = 21600;

  it("開始前: state='before'、nextTurnAt は null", () => {
    const vm = buildSeasonVM(meta({ turn: 1, startAt: 1000, finalTurn: null, unitTimeSec }), 500);
    expect(vm).toEqual({
      gameId: 1,
      gameName: "第 1 回",
      status: "running",
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
      gameId: 1,
      gameName: "第 1 回",
      status: "running",
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

  it("終了後 (最終ターン到達): state='finished'、finishedAtTurn は finalTurn、nextTurnAt は null", () => {
    const vm = buildSeasonVM(
      meta({
        turn: 11,
        startAt: 1000,
        finalTurn: 10,
        unitTimeSec,
        status: "finished",
        finishedAt: 999999,
      }),
      999999,
    );
    expect(vm).toEqual({
      gameId: 1,
      gameName: "第 1 回",
      status: "finished",
      turn: 11,
      finalTurn: 10,
      state: "finished",
      startAt: 1000,
      finishedAtTurn: 10,
      nextTurnAt: null,
      unitTimeSec,
    });
  });

  it("終了後 (手動終了。turn が finalTurn 以下): finishedAtTurn は現在の turn", () => {
    const vm = buildSeasonVM(
      meta({
        turn: 4,
        startAt: 1000,
        finalTurn: 10,
        unitTimeSec,
        status: "finished",
        finishedAt: 6000,
      }),
      6000,
    );
    expect(vm.state).toBe("finished");
    expect(vm.finishedAtTurn).toBe(4);
    expect(vm.nextTurnAt).toBeNull();
  });
});
