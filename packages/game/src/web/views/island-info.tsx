// Perl 版 Map.pm islandInfo の移植。
import type { GameConfig } from "../../core/config.ts";
import type { IslandDetailVM, MoneyDisplay } from "../../app/view-models.ts";

/** 農場/工場/採掘場規模の表示。Perl 版 islandInfo/tempTopPage 共通のロジック。 */
export function facilityScale(value: number, config: GameConfig): string {
  return value === 0 ? "保有せず" : `${value}0${config.units.pop}`;
}

function moneyText(money: MoneyDisplay, config: GameConfig): string | undefined {
  if (money.mode === "exact") {
    return `${money.value}${config.units.money}`;
  }
  if (money.mode === "about") {
    return money.text;
  }
  return undefined;
}

export interface IslandInfoProps {
  detail: IslandDetailVM;
  money: MoneyDisplay;
  config: GameConfig;
}

/** 観光/開発/新規発見画面共通の島情報テーブル。Perl 版 islandInfo。 */
export function IslandInfo({ detail, money, config }: IslandInfoProps) {
  const moneyStr = moneyText(money, config);
  return (
    <table class="info-table" border={1}>
      <tr>
        <th>順位</th>
        <th>人口</th>
        {moneyStr !== undefined ? <th>資金</th> : ""}
        <th>食料</th>
        <th>面積</th>
        <th>農場規模</th>
        <th>工場規模</th>
        <th>採掘場規模</th>
      </tr>
      <tr>
        <td class="rank-cell">{detail.rank}</td>
        <td>
          {detail.pop}
          {config.units.pop}
        </td>
        {moneyStr !== undefined ? <td>{moneyStr}</td> : ""}
        <td>
          {detail.food}
          {config.units.food}
        </td>
        <td>
          {detail.area}
          {config.units.area}
        </td>
        <td>{facilityScale(detail.farm, config)}</td>
        <td>{facilityScale(detail.factory, config)}</td>
        <td>{facilityScale(detail.mountain, config)}</td>
      </tr>
    </table>
  );
}
