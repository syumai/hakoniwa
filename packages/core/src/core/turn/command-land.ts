// Perl 版 Turn.pm doCommand のうち、整地/地ならし/埋め立て/掘削 (油田探し含む)/伐採の移植。
import { CommandKind, LandKind, commandSpecs } from "../constants.ts";
import { countAround, inBounds, neighbor } from "../geometry.ts";
import { point } from "../log/markup.ts";
import * as messages from "../log/messages.ts";
import { landName } from "../terrain.ts";
import type { Command, Island } from "../types.ts";
import type { CommandOutcome } from "./command.ts";
import { getState } from "./context.ts";
import type { TurnContext } from "./context.ts";

/** 整地 (Prepare) / 地ならし (Prepare2)。 */
export function doPrepare(ctx: TurnContext, island: Island, command: Command): CommandOutcome {
  const { kind, x, y } = command;
  const spec = commandSpecs[kind];
  const comName = spec.name;
  const hex = island.terrain.get(x, y);
  const p = point(x, y);

  if (
    hex.kind === LandKind.Sea ||
    hex.kind === LandKind.Sbase ||
    hex.kind === LandKind.Oil ||
    hex.kind === LandKind.Mountain ||
    hex.kind === LandKind.Monster
  ) {
    // 海、海底基地、油田、山、怪獣は整地できない
    messages.logLandFail(ctx.log, island.id, island.name, comName, landName(hex), p);
    return "continue";
  }

  // 目的の場所を平地にする (Perl はコマンド名でなく '整地' 固定文字列でログを出す)
  island.terrain.setKind(x, y, LandKind.Plains, 0);
  messages.logLandSuc(ctx.log, island.id, island.name, "整地", p);
  island.money -= spec.cost;

  if (kind === CommandKind.Prepare2) {
    // 地ならし: prepare2 をカウントし、ターン消費せず継続
    getState(ctx, island.id).prepare2++;
    return "continue";
  }

  // 整地: 埋蔵金の可能性あり
  if (ctx.rng.int(1000) < ctx.config.disaster.maizo) {
    const v = 100 + ctx.rng.int(901);
    island.money += v;
    messages.logMaizo(ctx.log, island.id, island.name, comName, v, ctx.config);
  }
  return "consumed";
}

/** 埋め立て。 */
export function doReclaim(ctx: TurnContext, island: Island, command: Command): CommandOutcome {
  const { x, y } = command;
  const spec = commandSpecs[CommandKind.Reclaim];
  const comName = spec.name;
  const terrain = island.terrain;
  const hex = terrain.get(x, y);
  const p = point(x, y);

  if (hex.kind !== LandKind.Sea && hex.kind !== LandKind.Oil && hex.kind !== LandKind.Sbase) {
    // 海、海底基地、油田しか埋め立てできない
    messages.logLandFail(ctx.log, island.id, island.name, comName, landName(hex), p);
    return "continue";
  }

  const seaCount =
    countAround(terrain, { x, y }, LandKind.Sea, 7) +
    countAround(terrain, { x, y }, LandKind.Oil, 7) +
    countAround(terrain, { x, y }, LandKind.Sbase, 7);

  if (seaCount === 7) {
    // 全部海だから埋め立て不能
    messages.logNoLandAround(ctx.log, island.id, island.name, comName, p);
    return "continue";
  }

  if (hex.kind === LandKind.Sea && hex.value === 1) {
    // 浅瀬の場合: 目的の場所を荒地にする
    terrain.setKind(x, y, LandKind.Waste, 0);
    messages.logLandSuc(ctx.log, island.id, island.name, comName, p);
    island.area++;

    if (seaCount <= 4) {
      // 周りの海が3ヘックス以内なので、浅瀬にする
      for (let i = 1; i < 7; i++) {
        const s = neighbor({ x, y }, i);
        if (!inBounds(s, terrain.size)) {
          continue;
        }
        if (terrain.get(s.x, s.y).kind === LandKind.Sea) {
          terrain.set(s.x, s.y, { kind: LandKind.Sea, value: 1 });
        }
      }
    }
  } else {
    // 海なら、目的の場所を浅瀬にする
    terrain.setKind(x, y, LandKind.Sea, 1);
    messages.logLandSuc(ctx.log, island.id, island.name, comName, p);
  }

  island.money -= spec.cost;
  return "consumed";
}

/** 掘削 (油田探し含む)。 */
export function doDestroy(ctx: TurnContext, island: Island, command: Command): CommandOutcome {
  const { x, y } = command;
  let arg = command.arg;
  const spec = commandSpecs[CommandKind.Destroy];
  const cost = spec.cost;
  const comName = spec.name;
  const terrain = island.terrain;
  const hex = terrain.get(x, y);
  const p = point(x, y);

  if (hex.kind === LandKind.Sbase || hex.kind === LandKind.Oil || hex.kind === LandKind.Monster) {
    // 海底基地、油田、怪獣は掘削できない
    messages.logLandFail(ctx.log, island.id, island.name, comName, landName(hex), p);
    return "continue";
  }

  if (hex.kind === LandKind.Sea && hex.value === 0) {
    // 海なら、油田探し
    if (arg === 0) {
      arg = 1;
    }
    const value = Math.min(arg * cost, island.money);
    const str = `${value}${ctx.config.units.money}`;
    const probability = Math.trunc(value / cost);
    island.money -= value;

    if (probability > ctx.rng.int(100)) {
      // 油田見つかる
      messages.logOilFound(ctx.log, island.id, island.name, p, comName, str);
      terrain.setKind(x, y, LandKind.Oil, 0);
    } else {
      // 無駄撃ちに終わる
      messages.logOilFail(ctx.log, island.id, island.name, p, comName, str);
    }
    return "consumed";
  }

  // 目的の場所を海にする。山なら荒地に。浅瀬 (すでに海) なら深海に。
  if (hex.kind === LandKind.Mountain) {
    terrain.setKind(x, y, LandKind.Waste, 0);
  } else if (hex.kind === LandKind.Sea) {
    terrain.set(x, y, { kind: LandKind.Sea, value: 0 });
  } else {
    terrain.setKind(x, y, LandKind.Sea, 1);
    island.area--;
  }
  messages.logLandSuc(ctx.log, island.id, island.name, comName, p);

  island.money -= cost;
  return "consumed";
}

/** 伐採。 */
export function doSellTree(ctx: TurnContext, island: Island, command: Command): CommandOutcome {
  const { x, y } = command;
  const spec = commandSpecs[CommandKind.SellTree];
  const comName = spec.name;
  const terrain = island.terrain;
  const hex = terrain.get(x, y);
  const p = point(x, y);

  if (hex.kind !== LandKind.Forest) {
    // 森以外は伐採できない
    messages.logLandFail(ctx.log, island.id, island.name, comName, landName(hex), p);
    return "continue";
  }

  terrain.setKind(x, y, LandKind.Plains, 0);
  messages.logLandSuc(ctx.log, island.id, island.name, comName, p);

  island.money += ctx.config.treeValue * hex.value;
  return "consumed";
}
