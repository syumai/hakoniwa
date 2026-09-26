// Perl 版 Turn.pm の doCommand の移植。
// 先頭コマンドの取り出し・資金繰り/自動放棄・コスト検査までをここで行い、
// 種類ごとの処理は command-land.ts / command-build.ts / command-misc.ts / missile.ts に委譲する。
import { slideFront, writeAt } from "../commands/queue.ts";
import { commandSpecs, CommandKind } from "../constants.ts";
import * as messages from "../log/messages.ts";
import type { Island, World } from "../types.ts";
import { doNothingCommand } from "../types.ts";
import { doBuild, doMountain, doSbase } from "./command-build.ts";
import { doDestroy, doPrepare, doReclaim, doSellTree } from "./command-land.ts";
import { doAid, doGiveup, doPropaganda, doSell, doSendMonster } from "./command-misc.ts";
import type { TurnContext } from "./context.ts";
import { doMissile } from "./missile.ts";

/** doCommand の戻り値。Perl の 1 (ターン消費) / 0 (継続) に相当。 */
export type CommandOutcome = "consumed" | "continue";

/**
 * 1 コマンド分の処理。
 * - 先頭コマンドを取り出し、以降を詰める (資金繰りを末尾に補充)。
 * - 資金繰り (DoNothing) は money+10, absent++ のうえ、giveupTurns 到達で自動放棄に差し替える。
 * - それ以外は B11 (維持): 失敗しても含め absent = 0 にリセットしてからコスト検査する。
 * - コスト不足ならログを出して 'continue'。
 * - コマンド種別ごとのハンドラに委譲する。
 */
export function doCommand(ctx: TurnContext, world: World, island: Island): CommandOutcome {
  const commands = island.commands;
  const command = commands[0];
  if (command === undefined) {
    throw new Error("doCommand: island.commands is empty");
  }
  // 以降を詰める (先頭を削除し、末尾に資金繰りを補充する)
  slideFront(commands, 0, ctx.config.commandMax);

  const { kind } = command;
  const spec = commandSpecs[kind];
  const cost = spec.cost;
  const comName = spec.name;

  if (kind === CommandKind.DoNothing) {
    // 資金繰り
    messages.logDoNothing(ctx.log, island.id, island.name, comName);
    island.money += 10;
    island.absent++;

    // 自動放棄
    if (island.absent >= ctx.config.giveupTurns) {
      writeAt(commands, 0, { ...doNothingCommand, kind: CommandKind.Giveup });
    }
    return "consumed";
  }

  // B11: 資金繰り以外のコマンドは、成功/失敗を問わず absent をリセットする (維持)。
  island.absent = 0;

  // コストチェック
  if (cost > 0) {
    // 金の場合
    if (island.money < cost) {
      messages.logNoMoney(ctx.log, island.id, island.name, comName);
      return "continue";
    }
  } else if (cost < 0) {
    // 食料の場合
    if (island.food < -cost) {
      messages.logNoFood(ctx.log, island.id, island.name, comName);
      return "continue";
    }
  }

  switch (kind) {
    case CommandKind.Prepare:
    case CommandKind.Prepare2:
      return doPrepare(ctx, island, command);

    case CommandKind.Reclaim:
      return doReclaim(ctx, island, command);

    case CommandKind.Destroy:
      return doDestroy(ctx, island, command);

    case CommandKind.SellTree:
      return doSellTree(ctx, island, command);

    case CommandKind.Plant:
    case CommandKind.Farm:
    case CommandKind.Factory:
    case CommandKind.Base:
    case CommandKind.Dbase:
    case CommandKind.Monument:
    case CommandKind.Haribote:
      return doBuild(ctx, world, island, command);

    case CommandKind.Mountain:
      return doMountain(ctx, island, command);

    case CommandKind.Sbase:
      return doSbase(ctx, island, command);

    case CommandKind.MissileNM:
    case CommandKind.MissilePP:
    case CommandKind.MissileST:
    case CommandKind.MissileLD:
      // Phase 2b で実装。
      return doMissile(ctx, world, island, command);

    case CommandKind.SendMonster:
      return doSendMonster(ctx, world, island, command);

    case CommandKind.Sell:
      return doSell(ctx, island, command);

    case CommandKind.Money:
    case CommandKind.Food:
      return doAid(ctx, world, island, command);

    case CommandKind.Propaganda:
      return doPropaganda(ctx, island, command);

    case CommandKind.Giveup:
      return doGiveup(ctx, island, command);

    default:
      // Perl 版もここに到達したら return 1 (ターン消費) する。
      return "consumed";
  }
}
