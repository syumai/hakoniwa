// Perl 版 Turn.pm tempNewIslandHead + islandInfo + islandMap(owner) の移植。
import type { GameConfig } from "../../core/config.ts";
import type { NewIslandVM } from "../../app/view-models.ts";
import { buildMoneyDisplay } from "../../app/view-models.ts";
import { IslandInfo } from "./island-info.tsx";
import { IslandMap } from "./island-map.tsx";
import { BackLink } from "./messages.tsx";

export function NewIslandPage({
  vm,
  config,
  gameId,
}: {
  vm: NewIslandVM;
  config: GameConfig;
  /** NewIslandVM 自体はゲーム ID を持たないため、ルート (`/games/:gameId/islands`) から渡す。 */
  gameId: number;
}) {
  return (
    <div class="new-island-page">
      <p class="big">島を発見しました！！</p>
      <p class="big">
        <span class="island-name">「{vm.name}島」</span>と命名します。
      </p>
      <BackLink gameId={gameId} />
      <hr />
      <h1>島の状況</h1>
      <div class="table-scroll">
        <IslandInfo detail={vm} money={buildMoneyDisplay(vm.money, config, true)} config={config} />
      </div>
      <IslandMap terrain={vm.terrain} mode="owner" turn={vm.turn} config={config} />
    </div>
  );
}
