// tmp/17-ogp.md 「実装の置き場所」節。Node 専用の生成スクリプト (root vite.config.ts の
// no-restricted-imports override で packages/game/scripts/** のみ node:* を許可している)。
//
// `public/images/*.gif` のうち、core/tile.ts の tileFor が返しうる画像 (地形・怪獣・記念碑の
// 32x32 タイル) だけを実際に tileFor を全パターン列挙して洗い出し、GIF をデコードして
// `src/ogp/tiles.generated.ts` (パレット + インデックス列) を書き出す。
//
// 実行: `pnpm --filter @hakoniwajs/core generate:ogp-tiles`
// (`tsx` または `node --experimental-strip-types` で実行できる純 TypeScript)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GifReader } from "omggif";
import { defaultConfig } from "../src/core/config.ts";
import { LandKind, monsters, monuments } from "../src/core/constants.ts";
import { tileFor } from "../src/core/tile.ts";
import type { Hex } from "../src/core/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const gamePackageRoot = join(__dirname, "..");
const imagesDir = join(gamePackageRoot, "public", "images");
const outFile = join(gamePackageRoot, "src", "ogp", "tiles.generated.ts");

/**
 * tileFor が実際に返しうる image 名をすべて列挙する。地形の種類ごとに代表的な value を
 * 総当たりし、visitor/owner の両モード・奇数/偶数ターン (怪獣の硬化判定用) で呼び出す。
 * ハードコードした画像名の一覧を別途持たず、tileFor 自体から導出することで
 * tileFor の変更に追従できるようにする。
 */
function collectImageNames(): string[] {
  const config = defaultConfig;
  const images = new Set<string>();
  const record = (hex: Hex): void => {
    for (const mode of ["visitor", "owner"] as const) {
      for (const turn of [0, 1]) {
        images.add(tileFor(hex, mode, turn, config).image);
      }
    }
  };

  record({ kind: LandKind.Sea, value: 0 });
  record({ kind: LandKind.Sea, value: 1 });
  record({ kind: LandKind.Waste, value: 0 });
  record({ kind: LandKind.Waste, value: 1 });
  record({ kind: LandKind.Plains, value: 0 });
  record({ kind: LandKind.Forest, value: 5 });
  // Town: 村/町/都市 の 3 段階。
  record({ kind: LandKind.Town, value: 10 });
  record({ kind: LandKind.Town, value: 50 });
  record({ kind: LandKind.Town, value: 150 });
  record({ kind: LandKind.Farm, value: 3 });
  record({ kind: LandKind.Factory, value: 3 });
  record({ kind: LandKind.Base, value: 5 });
  record({ kind: LandKind.Sbase, value: 5 });
  record({ kind: LandKind.Defence, value: 0 });
  record({ kind: LandKind.Haribote, value: 0 });
  record({ kind: LandKind.Oil, value: 0 });
  record({ kind: LandKind.Mountain, value: 0 });
  record({ kind: LandKind.Mountain, value: 5 });
  for (let value = 0; value < monuments.length; value++) {
    record({ kind: LandKind.Monument, value });
  }
  for (let monsterKind = 0; monsterKind < monsters.length; monsterKind++) {
    record({ kind: LandKind.Monster, value: monsterKind * 10 + 1 });
  }

  return [...images].sort();
}

interface DecodedTile {
  w: number;
  h: number;
  palette: number[];
  transparent: number;
  data: string;
}

/**
 * GIF 1 枚をデコードし、パレット (RGB 連結) とインデックス列に変換する。
 * omggif は RGBA へのデコードのみ公開しているため、RGBA から独自のパレットを再構築する
 * (元の GIF のパレット順序を保つ必要はない。減色もしない: 32x32 のドット絵は元々色数が少ない)。
 * alpha=0 (GIF の透過色) だったピクセルは共通の透明インデックスに割り当てる。
 */
function decodeTile(filePath: string): DecodedTile {
  const buf = readFileSync(filePath);
  const reader = new GifReader(buf);
  const { width, height } = reader;
  const rgba = new Uint8Array(width * height * 4);
  reader.decodeAndBlitFrameRGBA(0, rgba);

  const palette: number[] = [];
  const colorIndex = new Map<string, number>();
  const data = new Uint8Array(width * height);
  let transparent = -1;

  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const a = rgba[o + 3];
    if (a === 0) {
      if (transparent === -1) {
        transparent = palette.length / 3;
        palette.push(0, 0, 0);
      }
      data[i] = transparent;
      continue;
    }
    const r = rgba[o];
    const g = rgba[o + 1];
    const b = rgba[o + 2];
    const key = `${r},${g},${b}`;
    let index = colorIndex.get(key);
    if (index === undefined) {
      index = palette.length / 3;
      if (index > 255) {
        throw new Error(`${filePath}: too many colors (>256)`);
      }
      palette.push(r ?? 0, g ?? 0, b ?? 0);
      colorIndex.set(key, index);
    }
    data[i] = index;
  }

  return {
    w: width,
    h: height,
    palette,
    transparent,
    data: Buffer.from(data).toString("base64"),
  };
}

function main(): void {
  const imageNames = collectImageNames();
  const tiles: Record<string, DecodedTile> = {};
  for (const name of imageNames) {
    tiles[name] = decodeTile(join(imagesDir, name));
  }

  const lines: string[] = [];
  lines.push("// 生成物。手で編集しない。");
  lines.push("// `pnpm --filter @hakoniwajs/core generate:ogp-tiles` で再生成する。");
  lines.push(
    "// 生成元: packages/game/scripts/generate-ogp-tiles.ts, packages/game/public/images/*.gif",
  );
  lines.push("// tmp/17-ogp.md 「実装の置き場所」節。");
  lines.push("");
  lines.push("export interface GeneratedTile {");
  lines.push("  w: number;");
  lines.push("  h: number;");
  lines.push("  /** RGB を連結したパレット (palette[i*3], palette[i*3+1], palette[i*3+2])。 */");
  lines.push("  palette: number[];");
  lines.push("  /** 透明として扱うパレットのインデックス。透明色を含まないタイルは -1。 */");
  lines.push("  transparent: number;");
  lines.push("  /** 1 ピクセルごとのパレットインデックス (w*h バイト) を base64 化したもの。 */");
  lines.push("  data: string;");
  lines.push("}");
  lines.push("");
  lines.push("export const tiles: Record<string, GeneratedTile> = {");
  for (const name of imageNames) {
    const tile = tiles[name];
    if (tile === undefined) {
      continue;
    }
    lines.push(`  ${JSON.stringify(name)}: {`);
    lines.push(`    w: ${tile.w},`);
    lines.push(`    h: ${tile.h},`);
    lines.push(`    palette: [${tile.palette.join(",")}],`);
    lines.push(`    transparent: ${tile.transparent},`);
    lines.push(`    data: ${JSON.stringify(tile.data)},`);
    lines.push("  },");
  }
  lines.push("};");
  lines.push("");

  writeFileSync(outFile, lines.join("\n"));
  console.log(`generate-ogp-tiles: wrote ${imageNames.length} tiles to ${outFile}`);
}

main();
