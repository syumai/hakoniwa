// Perl 版 Map.pm tempPrintIslandHead + islandInfo + islandMap(0) + tempLbbs* + tempRecent(0) の移植。
// tmp/06-web-routes-and-views.md の views 一覧には明記されていないが、
// 観光画面 (GET /islands/:id) の合成に必要なため追加した (設計書との差異として報告)。
import type { GameConfig } from "../../core/config.ts";
import type { IslandPageVM } from "../../app/view-models.ts";
import type { FormDefaults } from "../middleware/defaults-cookie.ts";
import { IslandInfo } from "./island-info.tsx";
import { IslandMap } from "./island-map.tsx";
import { LbbsContents, LbbsHead, LbbsInputVisitor } from "./lbbs.tsx";
import { LogList } from "./logs.tsx";
import { BackLink, Notice } from "./messages.tsx";

export interface IslandPageProps {
  vm: IslandPageVM;
  config: GameConfig;
  defaults: FormDefaults;
  notice?: string;
}

/** 観光画面。Perl 版 printIslandMain。 */
export function IslandPage({ vm, config, defaults, notice }: IslandPageProps) {
  return (
    <div class="island-page">
      {notice !== undefined ? <Notice message={notice} /> : ""}
      <p class="big">
        <span class="island-name">「{vm.name}島」</span>へようこそ！！
      </p>
      <BackLink />
      <IslandInfo detail={vm} money={vm.moneyDisplay} config={config} />
      <IslandMap terrain={vm.terrain} mode="visitor" turn={vm.turn} config={config} />

      {config.useLbbs ? (
        <>
          <LbbsHead islandName={vm.name} />
          <LbbsInputVisitor islandId={vm.id} defaultName={defaults.lbbsName ?? ""} />
          <LbbsContents posts={vm.lbbs} />
        </>
      ) : (
        ""
      )}

      <hr />
      <p class="big">
        <span class="island-name">{vm.name}島</span>の近況
      </p>
      <LogList logs={vm.logs} />
    </div>
  );
}
