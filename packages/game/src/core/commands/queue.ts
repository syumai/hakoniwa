// Perl 版 Main.pm の slideFront/slideBack、Map.pm commandMain のコマンドキュー操作の移植。
import { CommandKind, LandKind } from "../constants.ts";
import type { Point } from "../geometry.ts";
import type { Command, Terrain } from "../types.ts";
import { doNothingCommand } from "../types.ts";

/**
 * コマンドを前にずらす。Perl 版 slideFront の移植。
 * index を削除し、末尾 (max-1) に資金繰り (doNothingCommand) を補充する。
 * 呼び出し後も commands.length は max のまま。
 */
export function slideFront(commands: Command[], index: number, max: number): void {
  commands.splice(index, 1);
  commands[max - 1] = { ...doNothingCommand };
}

/**
 * コマンドを後にずらす。Perl 版 slideBack の移植。
 * B10: index が末尾 (length-1) なら何もしない (Perl の挙動を維持)。
 * それ以外は末尾を捨て、index の位置に commands[index] のコピーを挿入する
 * (Perl: `splice(@$command, $number, 0, $command->[$number])`)。
 */
export function slideBack(commands: Command[], index: number): void {
  const last = commands.length - 1;
  if (index === last) {
    return;
  }
  commands.pop();
  const current = commands[index];
  if (current === undefined) {
    throw new RangeError(`slideBack: index out of range: ${index}`);
  }
  commands.splice(index, 0, { ...current });
}

/** index の位置にコマンドを書き込む (置き換え)。 */
export function writeAt(commands: Command[], index: number, command: Command): void {
  commands[index] = command;
}

/** index の位置にコマンドを挿入する (slideBack + writeAt)。 */
export function insertAt(commands: Command[], index: number, command: Command): void {
  slideBack(commands, index);
  writeAt(commands, index, command);
}

/** index のコマンドを削除する (slideFront)。 */
export function deleteAt(commands: Command[], index: number, max: number): void {
  slideFront(commands, index, max);
}

/** すべてのコマンドを資金繰りに戻す。Perl 版 commandMain の AutoDelete (全消し) の移植。 */
export function clearAll(commands: Command[], max: number): void {
  commands.length = 0;
  for (let i = 0; i < max; i++) {
    commands.push({ ...doNothingCommand });
  }
}

/** フル整地・フル地ならしで使うコマンド種別。 */
export type AutoPrepareKind = typeof CommandKind.Prepare | typeof CommandKind.Prepare2;

/**
 * フル整地・フル地ならしの自動入力。Perl 版 commandMain の AutoPrepare/AutoPrepare2 の移植。
 * points (シャッフル済み座標配列) を順に調べ、荒地が見つかるたびに index へ
 * slideBack + 書き込みを行う。挿入数は最大 max 個。
 */
export function autoPrepare(
  commands: Command[],
  index: number,
  terrain: Terrain,
  kind: AutoPrepareKind,
  points: readonly Point[],
  max: number,
): void {
  let inserted = 0;
  for (const { x, y } of points) {
    if (inserted >= max) {
      break;
    }
    if (terrain.get(x, y).kind === LandKind.Waste) {
      slideBack(commands, index);
      writeAt(commands, index, { kind, target: 0, x, y, arg: 0 });
      inserted++;
    }
  }
}
