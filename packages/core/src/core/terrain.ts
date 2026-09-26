// Perl 版 Turn.pm の landName / estimate 補助関数、Main.pm の monsterSpec / expToLevel の移植。
import type { GameConfig } from "./config.ts";
import { LandKind, monsters, monuments } from "./constants.ts";
import type { Hex, Terrain } from "./types.ts";

const LAND_KIND_VALUES: readonly number[] = Object.values(LandKind);

function isLandKind(value: number): value is LandKind {
  return LAND_KIND_VALUES.includes(value);
}

function assertInBounds(size: number, x: number, y: number): void {
  if (x < 0 || x >= size || y < 0 || y >= size) {
    throw new RangeError(`terrain: out of bounds (${x}, ${y}) for size ${size}`);
  }
}

class TerrainImpl implements Terrain {
  readonly size: number;
  #cells: Hex[];

  constructor(size: number, cells: Hex[]) {
    this.size = size;
    this.#cells = cells;
  }

  get(x: number, y: number): Hex {
    assertInBounds(this.size, x, y);
    const hex = this.#cells[y * this.size + x];
    if (hex === undefined) {
      throw new RangeError(`terrain: out of bounds (${x}, ${y}) for size ${this.size}`);
    }
    return hex;
  }

  set(x: number, y: number, hex: Hex): void {
    assertInBounds(this.size, x, y);
    this.#cells[y * this.size + x] = hex;
  }

  setKind(x: number, y: number, kind: LandKind, value = 0): void {
    this.set(x, y, { kind, value });
  }

  clone(): Terrain {
    return new TerrainImpl(
      this.size,
      this.#cells.map((hex) => ({ ...hex })),
    );
  }

  toJSON(): number[][] {
    return this.#cells.map((hex) => [hex.kind, hex.value]);
  }
}

/** size x size の地形を作る。cells を渡した場合はその内容で初期化する (行優先: y, x)。 */
export function createTerrain(size: number, cells?: number[][]): Terrain {
  if (cells !== undefined) {
    return terrainFromJSON(size, cells);
  }
  const initial: Hex[] = Array.from({ length: size * size }, () => ({
    kind: LandKind.Sea,
    value: 0,
  }));
  return new TerrainImpl(size, initial);
}

/** toJSON() の逆変換。形状が不正な場合は throw する。 */
export function terrainFromJSON(size: number, cells: number[][]): Terrain {
  if (cells.length !== size * size) {
    throw new Error(`terrainFromJSON: expected ${size * size} cells, got ${cells.length}`);
  }
  const parsed: Hex[] = cells.map((cell, index) => {
    if (!Array.isArray(cell) || cell.length !== 2) {
      throw new Error(`terrainFromJSON: cell ${index} must be [kind, value]`);
    }
    const [kind, value] = cell;
    if (typeof kind !== "number" || typeof value !== "number") {
      throw new Error(`terrainFromJSON: cell ${index} must contain numbers`);
    }
    if (!isLandKind(kind)) {
      throw new Error(`terrainFromJSON: cell ${index} has invalid kind ${kind}`);
    }
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new Error(`terrainFromJSON: cell ${index} has invalid value ${value}`);
    }
    return { kind, value };
  });
  return new TerrainImpl(size, parsed);
}

/** 怪獣の value からその種類・名前・体力を取り出す。Perl 版 monsterSpec。 */
export function monsterSpec(value: number): { kind: number; name: string; hp: number } {
  const kind = Math.floor(value / 10);
  const spec = monsters[kind];
  const name = spec?.name ?? "";
  const hp = value - kind * 10;
  return { kind, name, hp };
}

/** 経験値からレベルを算出する。Perl 版 expToLevel。 */
export function expToLevel(kind: LandKind, exp: number, config: GameConfig): number {
  if (kind === LandKind.Base) {
    // ミサイル基地
    for (let i = config.maxBaseLevel; i > 1; i--) {
      const threshold = config.baseLevelUp[i - 2];
      if (threshold !== undefined && exp >= threshold) {
        return i;
      }
    }
    return 1;
  }
  // 海底基地
  for (let i = config.maxSBaseLevel; i > 1; i--) {
    const threshold = config.sBaseLevelUp[i - 2];
    if (threshold !== undefined && exp >= threshold) {
      return i;
    }
  }
  return 1;
}

/**
 * 怪獣が硬化中かどうか。special 3 は奇数ターン、4 は偶数ターンで硬化。
 * monsterKind は monsters 配列の添字。
 */
export function isHardened(monsterKind: number, turn: number): boolean {
  const special = monsters[monsterKind]?.special;
  if (special === 3) {
    return turn % 2 === 1;
  }
  if (special === 4) {
    return turn % 2 === 0;
  }
  return false;
}

/** 地形の呼称。Perl 版 landName。 */
export function landName(hex: Hex): string {
  switch (hex.kind) {
    case LandKind.Sea:
      return hex.value === 1 ? "浅瀬" : "海";
    case LandKind.Waste:
      return "荒地";
    case LandKind.Plains:
      return "平地";
    case LandKind.Town:
      if (hex.value < 30) {
        return "村";
      }
      if (hex.value < 100) {
        return "町";
      }
      return "都市";
    case LandKind.Forest:
      return "森";
    case LandKind.Farm:
      return "農場";
    case LandKind.Factory:
      return "工場";
    case LandKind.Base:
      return "ミサイル基地";
    case LandKind.Defence:
      return "防衛施設";
    case LandKind.Mountain:
      return "山";
    case LandKind.Monster:
      return monsterSpec(hex.value).name;
    case LandKind.Sbase:
      return "海底基地";
    case LandKind.Oil:
      return "海底油田";
    case LandKind.Monument:
      return monuments[hex.value]?.name ?? "";
    case LandKind.Haribote:
      return "ハリボテ";
    default:
      return "";
  }
}
