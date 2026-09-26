// Perl 版 Turn.pm doCommand のうち、植林/農場/工場/ミサイル基地/防衛施設/記念碑/ハリボテ
// (地上建設系) と採掘場、海底基地の移植。
import { commandSpecs, CommandKind, LandKind, monuments } from "../constants.ts";
import { slideBack, writeAt } from "../commands/queue.ts";
import { point } from "../log/markup.ts";
import * as messages from "../log/messages.ts";
import { landName } from "../terrain.ts";
import type { Command, Hex, Island, World } from "../types.ts";
import type { CommandOutcome } from "./command.ts";
import { findIsland, getState } from "./context.ts";
import type { TurnContext } from "./context.ts";

/** 地上建設系 (植林/農場/工場/基地/防衛/記念碑/ハリボテ) が施行可能な地形かどうか。 */
function canBuild(kind: CommandKind, hex: Hex): boolean {
  return (
    hex.kind === LandKind.Plains ||
    hex.kind === LandKind.Town ||
    (hex.kind === LandKind.Monument && kind === CommandKind.Monument) ||
    (hex.kind === LandKind.Farm && kind === CommandKind.Farm) ||
    (hex.kind === LandKind.Factory && kind === CommandKind.Factory) ||
    (hex.kind === LandKind.Defence && kind === CommandKind.Dbase)
  );
}

/**
 * 地上建設系 (植林/農場整備/工場建設/ミサイル基地建設/防衛施設建設/記念碑建造/ハリボテ設置)。
 * B8: 記念碑の再建造 (発射) で対象島が既に不在の場合は、何も言わずに 'continue' する (維持)。
 */
export function doBuild(
  ctx: TurnContext,
  world: World,
  island: Island,
  command: Command,
): CommandOutcome {
  const { kind, target, x, y } = command;
  let arg = command.arg;
  const spec = commandSpecs[kind];
  const cost = spec.cost;
  const comName = spec.name;
  const terrain = island.terrain;
  const hex = terrain.get(x, y);
  const p = point(x, y);

  if (!canBuild(kind, hex)) {
    // 不適当な地形
    messages.logLandFail(ctx.log, island.id, island.name, comName, landName(hex), p);
    return "continue";
  }

  switch (kind) {
    case CommandKind.Plant: {
      terrain.setKind(x, y, LandKind.Forest, 1); // 木は最低単位
      messages.logPBSuc(ctx.log, island.id, island.name, comName, p);
      break;
    }
    case CommandKind.Base: {
      terrain.setKind(x, y, LandKind.Base, 0); // 経験値0
      messages.logPBSuc(ctx.log, island.id, island.name, comName, p);
      break;
    }
    case CommandKind.Haribote: {
      terrain.setKind(x, y, LandKind.Haribote, 0);
      messages.logHariSuc(
        ctx.log,
        island.id,
        island.name,
        comName,
        commandSpecs[CommandKind.Dbase].name,
        p,
      );
      break;
    }
    case CommandKind.Farm: {
      if (hex.kind === LandKind.Farm) {
        // すでに農場の場合: 規模 + 2000人 (最大 50000人)
        terrain.set(x, y, { kind: LandKind.Farm, value: Math.min(hex.value + 2, 50) });
      } else {
        terrain.setKind(x, y, LandKind.Farm, 10); // 規模 = 10000人
      }
      messages.logLandSuc(ctx.log, island.id, island.name, comName, p);
      break;
    }
    case CommandKind.Factory: {
      if (hex.kind === LandKind.Factory) {
        // すでに工場の場合: 規模 + 10000人 (最大 100000人)
        terrain.set(x, y, { kind: LandKind.Factory, value: Math.min(hex.value + 10, 100) });
      } else {
        terrain.setKind(x, y, LandKind.Factory, 30); // 規模 = 30000人
      }
      messages.logLandSuc(ctx.log, island.id, island.name, comName, p);
      break;
    }
    case CommandKind.Dbase: {
      if (hex.kind === LandKind.Defence) {
        // すでに防衛施設の場合: 自爆装置セット
        terrain.set(x, y, { kind: LandKind.Defence, value: 1 });
        messages.logBombSet(ctx.log, island.id, island.name, landName(hex), p);
      } else {
        terrain.setKind(x, y, LandKind.Defence, 0);
        messages.logLandSuc(ctx.log, island.id, island.name, comName, p);
      }
      break;
    }
    case CommandKind.Monument: {
      if (hex.kind === LandKind.Monument) {
        // すでに記念碑の場合: 「発射」。B8: 隠し仕様として維持する。
        const targetIsland = findIsland(world, target);
        if (targetIsland === undefined) {
          // ターゲットがすでにない。何も言わずに中止。
          return "continue";
        }
        getState(ctx, targetIsland.id).bigMissile++;
        terrain.setKind(x, y, LandKind.Waste, 0);
        messages.logMonFly(ctx.log, island.id, island.name, landName(hex), p);
      } else {
        // 目的の場所を記念碑に
        const value = arg >= monuments.length ? 0 : arg;
        terrain.setKind(x, y, LandKind.Monument, value);
        messages.logLandSuc(ctx.log, island.id, island.name, comName, p);
      }
      break;
    }
    default:
      break;
  }

  island.money -= cost;

  // 回数付きなら、コマンドを戻す
  if (kind === CommandKind.Farm || kind === CommandKind.Factory) {
    if (arg > 1) {
      arg--;
      slideBack(island.commands, 0);
      writeAt(island.commands, 0, { kind, target, x, y, arg });
    }
  }

  return "consumed";
}

/** 採掘場整備 (山にのみ作れる。回数付き再投入あり)。 */
export function doMountain(ctx: TurnContext, island: Island, command: Command): CommandOutcome {
  const { target, x, y } = command;
  let arg = command.arg;
  const spec = commandSpecs[CommandKind.Mountain];
  const comName = spec.name;
  const terrain = island.terrain;
  const hex = terrain.get(x, y);
  const p = point(x, y);

  if (hex.kind !== LandKind.Mountain) {
    // 山以外には作れない
    messages.logLandFail(ctx.log, island.id, island.name, comName, landName(hex), p);
    return "continue";
  }

  // 規模 + 5000人 (最大 200000人)
  terrain.set(x, y, { kind: LandKind.Mountain, value: Math.min(hex.value + 5, 200) });
  messages.logLandSuc(ctx.log, island.id, island.name, comName, p);

  island.money -= spec.cost;

  if (arg > 1) {
    arg--;
    slideBack(island.commands, 0);
    writeAt(island.commands, 0, { kind: CommandKind.Mountain, target, x, y, arg });
  }
  return "consumed";
}

/** 海底基地建設 (海の深いところにのみ作れる)。 */
export function doSbase(ctx: TurnContext, island: Island, command: Command): CommandOutcome {
  const { x, y } = command;
  const spec = commandSpecs[CommandKind.Sbase];
  const comName = spec.name;
  const terrain = island.terrain;
  const hex = terrain.get(x, y);

  if (hex.kind !== LandKind.Sea || hex.value !== 0) {
    // 海以外には作れない
    messages.logLandFail(ctx.log, island.id, island.name, comName, landName(hex), point(x, y));
    return "continue";
  }

  terrain.setKind(x, y, LandKind.Sbase, 0); // 経験値0
  // Perl 版は実座標でなく固定文字列 '(?, ?)' を渡している (維持)。
  messages.logLandSuc(ctx.log, island.id, island.name, comName, "(?, ?)");

  island.money -= spec.cost;
  return "consumed";
}
