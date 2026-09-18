// Perl 版 Turn.pm tempNewIslandHead + islandInfo + islandMap(owner) の移植。
import type { GameConfig } from "../../core/config.ts";
import type { NewIslandVM } from "../../app/view-models.ts";
import { buildMoneyDisplay } from "../../app/view-models.ts";
import { IslandInfo } from "./island-info.tsx";
import { IslandMap } from "./island-map.tsx";
import { BackLink } from "./messages.tsx";

export function NewIslandPage({ vm, config }: { vm: NewIslandVM; config: GameConfig }) {
  return (
    <div class="new-island-page">
      <p class="big">島を発見しました！！</p>
      <p class="big">
        <span class="island-name">「{vm.name}島」</span>と命名します。
      </p>
      <BackLink />
      <section class="card">
        <h2>島の状況</h2>
        <div class="table-scroll">
          <IslandInfo
            detail={vm}
            money={buildMoneyDisplay(vm.money, config, true)}
            config={config}
          />
        </div>
        <IslandMap terrain={vm.terrain} mode="owner" turn={vm.turn} config={config} />
      </section>
    </div>
  );
}
