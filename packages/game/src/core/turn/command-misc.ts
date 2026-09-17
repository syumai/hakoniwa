// Perl 版 Turn.pm doCommand のうち、怪獣派遣/食料輸出/資金援助・食料援助/誘致活動/島の放棄の移植。
import { commandSpecs, CommandKind } from "../constants.ts";
import * as messages from "../log/messages.ts";
import type { Command, Island, World } from "../types.ts";
import type { CommandOutcome } from "./command.ts";
import { findIsland, getState } from "./context.ts";
import type { TurnContext } from "./context.ts";

/**
 * 怪獣派遣。
 * B2: Perl は対象島の存在確認 (`$tn eq ''`) より先に `$Hislands[$tn]` を参照していたが、
 * 先に存在確認してから logMsNoTarget を出す。
 */
export function doSendMonster(
  ctx: TurnContext,
  world: World,
  island: Island,
  command: Command,
): CommandOutcome {
  const { target } = command;
  const spec = commandSpecs[CommandKind.SendMonster];
  const comName = spec.name;

  const targetIsland = findIsland(world, target);
  if (targetIsland === undefined) {
    // ターゲットがすでにない
    messages.logMsNoTarget(ctx.log, island.id, island.name, comName);
    return "continue";
  }

  messages.logMonsSend(ctx.log, island.id, target, island.name, targetIsland.name);
  getState(ctx, targetIsland.id).monsterSend++;

  island.money -= spec.cost;
  return "consumed";
}

/** 食料輸出。B13: ターンを消費せず次のコマンドを続行する。 */
export function doSell(ctx: TurnContext, island: Island, command: Command): CommandOutcome {
  let arg = command.arg;
  const spec = commandSpecs[CommandKind.Sell];
  const cost = spec.cost; // 食料 (負数)
  const comName = spec.name;

  if (arg === 0) {
    arg = 1;
  }
  const value = Math.min(arg * -cost, island.food);

  messages.logSell(ctx.log, island.id, island.name, comName, value, ctx.config);
  island.food -= value;
  // B26: Perl は小数のまま保持しファイル入出力で切り捨てていたが、money は整数不変条件を保つため加算時に切り捨てる。
  island.money += Math.trunc(value / 10);
  return "continue";
}

/**
 * 資金援助・食料援助。B13: ターンを消費せず次のコマンドを続行する。
 * B2: Perl は対象島の存在確認より先に `$Hislands[$tn]` を参照していたが、
 * 先に存在確認してから logMsNoTarget を出して 'continue' する (修正)。
 */
export function doAid(
  ctx: TurnContext,
  world: World,
  island: Island,
  command: Command,
): CommandOutcome {
  const { kind, target } = command;
  let arg = command.arg;
  const spec = commandSpecs[kind];
  const cost = spec.cost;
  const comName = spec.name;

  const targetIsland = findIsland(world, target);
  if (targetIsland === undefined) {
    messages.logMsNoTarget(ctx.log, island.id, island.name, comName);
    return "continue";
  }

  if (arg === 0) {
    arg = 1;
  }

  let value: number;
  let str: string;
  if (cost < 0) {
    value = Math.min(arg * -cost, island.food);
    str = `${value}${ctx.config.units.food}`;
  } else {
    value = Math.min(arg * cost, island.money);
    str = `${value}${ctx.config.units.money}`;
  }

  messages.logAid(ctx.log, island.id, target, island.name, targetIsland.name, comName, str);

  if (cost < 0) {
    island.food -= value;
    targetIsland.food += value;
  } else {
    island.money -= value;
    targetIsland.money += value;
  }
  return "continue";
}

/** 誘致活動。 */
export function doPropaganda(ctx: TurnContext, island: Island, _command: Command): CommandOutcome {
  const spec = commandSpecs[CommandKind.Propaganda];
  messages.logPropaganda(ctx.log, island.id, island.name, spec.name);
  getState(ctx, island.id).propaganda = true;
  island.money -= spec.cost;
  return "consumed";
}

/**
 * 島の放棄。
 * Perl 版は `unlink("island.$id")` でファイルを消していたが、TS ではデータ削除は
 * 呼び出し側 (app 層) が `dead` フラグを見て行う (B6 相当。ここではファイル操作をしない)。
 */
export function doGiveup(ctx: TurnContext, island: Island, _command: Command): CommandOutcome {
  messages.logGiveup(ctx.log, island.id, island.name);
  getState(ctx, island.id).dead = true;
  return "consumed";
}
