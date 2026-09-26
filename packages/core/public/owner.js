// 座標選択の補助スクリプト。
// Perl 版 lib/Hako/Map.pm tempOwner の ps(x, y) / ns(x) (inline onclick) に相当する。
// inline script を使わず、DOMContentLoaded 後にイベント委譲でクリックを拾う。
// モジュールではない素の ES2020 として <script src="/owner.js" defer> から読み込む。
(function () {
  "use strict";

  /** name 属性が一致する select の value を書き換える。見つからなければ何もしない。 */
  function setSelectValue(name, value) {
    if (value === null) {
      return;
    }
    var select = document.querySelector('select[name="' + name + '"]');
    if (select === null) {
      return;
    }
    select.value = value;
  }

  function handleClick(event) {
    var target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    // 地図のヘックスをクリック → 座標セレクト (x, y) を書き換える。
    var mapCell = target.closest(".map-cell");
    if (mapCell !== null) {
      event.preventDefault();
      setSelectValue("x", mapCell.getAttribute("data-x"));
      setSelectValue("y", mapCell.getAttribute("data-y"));
      return;
    }

    // 計画一覧の番号をクリック → 計画番号セレクト (number) を書き換える。
    var commandNumber = target.closest(".command-number");
    if (commandNumber !== null) {
      event.preventDefault();
      setSelectValue("number", commandNumber.getAttribute("data-number"));
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.addEventListener("click", handleClick);
  });
})();
