// Perl 版 Map.pm tempCommand (計画一覧の表示文字列) の移植。
// HTML/色タグは付けず、構造化データとして返す (views 側で装飾する)。
import type { GameConfig } from "../config.ts";
import { CommandKind, commandSpecs } from "../constants.ts";
import type { Command } from "../types.ts";

export interface FormattedCommand {
  /** 例: "01：" */
  number: string;
  /** 表示文字列本体。 */
  text: string;
}

/** 島名解決。見つからない場合は undefined を返す。 */
export type ResolveIslandName = (id: number) => string | undefined;

function formatTargetIsland(target: number, resolveIslandName: ResolveIslandName): string {
  const name = resolveIslandName(target);
  if (name === undefined) {
    return "無人島";
  }
  return `${name}島`;
}

/** arg * cost の金額/食料表示。0 なら cost そのもの、負なら食料単位。 */
function formatValue(command: Command, config: GameConfig): string {
  const cost = commandSpecs[command.kind].cost;
  let value = command.arg * cost;
  if (value === 0) {
    value = cost;
  }
  if (value < 0) {
    return `${-value}${config.units.food}`;
  }
  return `${value}${config.units.money}`;
}

/**
 * 計画 1 件の表示用データを組み立てる。Perl 版 tempCommand の移植。
 * (x,y) 表記、ターゲット島名、費用表記の組み立てロジックは Perl と同じにする。
 */
export function formatCommand(
  command: Command,
  index: number,
  config: GameConfig,
  resolveIslandName: ResolveIslandName,
): FormattedCommand {
  const { kind, x, y, arg } = command;
  const name = commandSpecs[kind].name;
  const point = `(${x},${y})`;

  let text: string;
  switch (kind) {
    case CommandKind.DoNothing:
    case CommandKind.Giveup:
      text = name;
      break;

    case CommandKind.MissileNM:
    case CommandKind.MissilePP:
    case CommandKind.MissileST:
    case CommandKind.MissileLD: {
      const n = arg === 0 ? "無制限" : `${arg}発`;
      text = `${formatTargetIsland(command.target, resolveIslandName)}${point}へ${name}(${n})`;
      break;
    }

    case CommandKind.SendMonster:
      text = `${formatTargetIsland(command.target, resolveIslandName)}へ${name}`;
      break;

    case CommandKind.Sell:
      text = `${name}${formatValue(command, config)}`;
      break;

    case CommandKind.Propaganda:
      text = name;
      break;

    case CommandKind.Money:
    case CommandKind.Food:
      text = `${formatTargetIsland(command.target, resolveIslandName)}へ${name}${formatValue(command, config)}`;
      break;

    case CommandKind.Destroy:
      text =
        arg !== 0 ? `${point}で${name}(予算${formatValue(command, config)})` : `${point}で${name}`;
      break;

    case CommandKind.Farm:
    case CommandKind.Factory:
    case CommandKind.Mountain:
      text = arg === 0 ? `${point}で${name}` : `${point}で${name}(${arg}回)`;
      break;

    default:
      // 座標付き (整地/地ならし/埋め立て/掘削/伐採/植林/基地/防衛/海底基地/記念碑/ハリボテ 等)
      text = `${point}で${name}`;
      break;
  }

  const number = `${String(index + 1).padStart(2, "0")}：`;
  return { number, text };
}
