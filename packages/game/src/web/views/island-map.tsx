// Perl 版 Map.pm islandMap/landString の移植。
// 観光者への偽装 (基地→森、海底基地→海、ハリボテ→防衛施設、森の本数非表示) と
// 怪獣の硬化画像 (isHardened) をここで扱う。
import type { GameConfig } from "../../core/config.ts";
import { CommandKind, LandKind, commandSpecs, monsters, monuments } from "../../core/constants.ts";
import { expToLevel, isHardened, monsterSpec } from "../../core/terrain.ts";
import type { Command, Terrain } from "../../core/types.ts";

export type IslandMapMode = "visitor" | "owner";

export interface IslandMapProps {
  terrain: Terrain;
  mode: IslandMapMode;
  /** isHardened (怪獣の硬化判定) に使う現在のターン。 */
  turn: number;
  config: GameConfig;
  /** owner モードのみ使用。座標付きの計画をヘックスの表示に重ねる (Perl 版 comStr)。 */
  commands?: readonly Command[];
}

interface CellView {
  image: string;
  desc: string;
}

/** 座標ごとの計画ラベル文字列 (例: " [1]整地 [3]伐採")。Perl 版 ownerMain の comStr 組み立て。 */
function buildCommandLabels(commands: readonly Command[] | undefined, size: number): string[][] {
  const labels: string[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ""),
  );
  if (commands === undefined) {
    return labels;
  }
  commands.forEach((command, index) => {
    // Perl 版: kind < 20 (座標付きの土地系計画) のみ地図に重ねる。
    if (command.kind >= 20) {
      return;
    }
    const spec = commandSpecs[command.kind as CommandKind];
    if (spec === undefined) {
      return;
    }
    const row = labels[command.y];
    if (row === undefined || command.x < 0 || command.x >= row.length) {
      return;
    }
    row[command.x] = `${row[command.x] ?? ""} [${index + 1}]${spec.name}`;
  });
  return labels;
}

/** 1 ヘックスの画像・説明文を決める。Perl 版 landString。 */
function cellView(
  kind: LandKind,
  value: number,
  mode: IslandMapMode,
  turn: number,
  config: GameConfig,
): CellView {
  switch (kind) {
    case LandKind.Sea:
      return value === 1
        ? { image: "land14.gif", desc: "海(浅瀬)" }
        : { image: "land0.gif", desc: "海" };
    case LandKind.Waste:
      return value === 1
        ? { image: "land13.gif", desc: "荒地" }
        : { image: "land1.gif", desc: "荒地" };
    case LandKind.Plains:
      return { image: "land2.gif", desc: "平地" };
    case LandKind.Forest:
      return mode === "owner"
        ? { image: "land6.gif", desc: `森(${value}${config.units.tree})` }
        : { image: "land6.gif", desc: "森" };
    case LandKind.Town: {
      let p: number;
      let n: string;
      if (value < 30) {
        p = 3;
        n = "村";
      } else if (value < 100) {
        p = 4;
        n = "町";
      } else {
        p = 5;
        n = "都市";
      }
      return { image: `land${p}.gif`, desc: `${n}(${value}${config.units.pop})` };
    }
    case LandKind.Farm:
      return { image: "land7.gif", desc: `農場(${value}0${config.units.pop}規模)` };
    case LandKind.Factory:
      return { image: "land8.gif", desc: `工場(${value}0${config.units.pop}規模)` };
    case LandKind.Base:
      if (mode === "visitor") {
        // 観光者の場合は森のふり。
        return { image: "land6.gif", desc: "森" };
      }
      return {
        image: "land9.gif",
        desc: `ミサイル基地 (レベル ${expToLevel(LandKind.Base, value, config)}/経験値 ${value})`,
      };
    case LandKind.Sbase:
      if (mode === "visitor") {
        // 観光者の場合は海のふり。
        return { image: "land0.gif", desc: "海" };
      }
      return {
        image: "land12.gif",
        desc: `海底基地 (レベル ${expToLevel(LandKind.Sbase, value, config)}/経験値 ${value})`,
      };
    case LandKind.Defence:
      return { image: "land10.gif", desc: "防衛施設" };
    case LandKind.Haribote:
      // 観光者の場合は防衛施設のふり。
      return { image: "land10.gif", desc: mode === "visitor" ? "防衛施設" : "ハリボテ" };
    case LandKind.Oil:
      return { image: "land16.gif", desc: "海底油田" };
    case LandKind.Mountain:
      return value > 0
        ? { image: "land15.gif", desc: `山(採掘場${value}0${config.units.pop}規模)` }
        : { image: "land11.gif", desc: "山" };
    case LandKind.Monument: {
      const monument = monuments[value];
      return { image: monument?.image ?? "monument0.gif", desc: monument?.name ?? "" };
    }
    case LandKind.Monster: {
      const { kind, name, hp } = monsterSpec(value);
      const spec = monsters[kind];
      const hardened = isHardened(kind, turn);
      const image = (hardened ? spec?.hardenedImage : undefined) ?? spec?.image ?? "land0.gif";
      return { image, desc: `怪獣${name}(体力${hp})` };
    }
    default:
      return { image: "land0.gif", desc: "" };
  }
}

/** 島の地図。Perl 版 islandMap。 */
export function IslandMap({ terrain, mode, turn, config, commands }: IslandMapProps) {
  const size = terrain.size;
  const labels = buildCommandLabels(mode === "owner" ? commands : undefined, size);
  const rows = Array.from({ length: size }, (_, y) => y);
  const cols = Array.from({ length: size }, (_, x) => x);

  return (
    <div class="map">
      <img src="/images/xbar.gif" width={400} height={16} />
      <br />
      {rows.map((y) => (
        <div class="map-row" key={y}>
          {y % 2 === 0 ? <img src={`/images/space${y}.gif`} width={16} height={32} /> : ""}
          {cols.map((x) => {
            const hex = terrain.get(x, y);
            const { image, desc } = cellView(hex.kind, hex.value, mode, turn, config);
            const label = labels[y]?.[x] ?? "";
            const tooltip = `(${x},${y}) ${desc} ${label}`;
            const cell = (
              <img src={`/images/${image}`} alt={tooltip} title={tooltip} width={32} height={32} />
            );
            return mode === "owner" ? (
              <a href="#" class="map-cell" data-x={x} data-y={y}>
                {cell}
              </a>
            ) : (
              cell
            );
          })}
          {y % 2 === 1 ? <img src={`/images/space${y}.gif`} width={16} height={32} /> : ""}
          <br />
        </div>
      ))}
    </div>
  );
}
