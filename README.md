# 箱庭諸島

徳岡宏樹氏による Web ブラウザゲーム「箱庭諸島２」を、TypeScript (Node.js + Hono + `node:sqlite`) で書き直したものです。
ゲームロジックと HTTP 層をランタイムから独立させてあり、将来的に Cloudflare Workers (Durable Objects SQLite) でも動かせる構成にしています。

プレイヤーは自分の島を発見し、開発計画 (整地、農場整備、ミサイル発射など) を登録します。
一定時間 (既定 6 時間) ごとにターンが進み、すべての島で計画の実行、人口の増減、災害、怪獣の出現などが処理されます。

このリポジトリは [neguse/hakoniwa](https://github.com/neguse/hakoniwa) の fork です。fork 元は、オリジナルの Perl スクリプトを UTF-8 化し、モジュール分割と Plack 対応を施して現代の Perl で動くようにしたものでした。本リポジトリではその Perl 版をもとに TypeScript へ移植し、Perl 版のコードは削除しています (履歴は git log で辿れます)。

## 構成

pnpm workspace によるモノレポです。パッケージ化しているのは差し替え単位となる Adapter だけで、ゲーム本体は 1 パッケージです。

| パッケージ                                             | 役割                                                                                                                                                                                                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/game` (`@hakoniwa/game`)                     | ゲーム本体。ランタイム非依存で、Node や Cloudflare 固有の API を使いません。`core` (ゲームロジック)、`app` (ユースケース)、`storage` (SQLite 用ストレージ抽象)、`web` (Hono + hono/jsx の画面)、`bootstrap` (組み立て) と、画像や CSS などの `public` を含みます |
| `packages/server-node` (`@hakoniwa/server-node`)       | Node.js 向け Adapter。`node:sqlite` によるストレージ、HTTP サーバー、ファイルバックアップ、CLI                                                                                                                                                                   |
| `packages/server-workers` (`@hakoniwa/server-workers`) | Cloudflare Workers (Durable Objects SQLite) 向け Adapter。現時点では型定義のみのスケルトンです                                                                                                                                                                   |

## 必要なツール

Node.js、pnpm、[Vite+](https://viteplus.dev/) (`vp`) は [mise](https://mise.jdx.dev/) で管理しています。

```sh
mise install
mise exec -- vp install
```

シェルで mise を有効化していない場合は、以降のコマンドにも `mise exec -- ` を付けて実行してください。

## 開発

```sh
vp run dev
```

開発サーバーが http://localhost:5173/ で起動します。初回はデータが未初期化なので、次のいずれかで作成してください。

- ブラウザで `/admin` を開き、マスターパスワードを入力して「新しいデータを作る」を実行する
- CLI で初期化する: `vp run --filter ./packages/server-node cli -- db init`

管理画面を使うには環境変数 `HAKONIWA_MASTER_PASSWORD` の設定が必要です。

## ビルドと起動

```sh
vp run build
HAKONIWA_MASTER_PASSWORD=xxxx node packages/server-node/dist/server.js
```

`packages/server-node/dist/` にサーバー (`server.js`)、CLI (`cli.js`)、静的ファイルが生成されます。

### CLI

```sh
node packages/server-node/dist/cli.js --help
node packages/server-node/dist/cli.js db init          # データの新規作成
node packages/server-node/dist/cli.js db status        # ターン数、最終更新時刻、島数など
node packages/server-node/dist/cli.js turn check       # 期限が来ていればターンを進める
node packages/server-node/dist/cli.js turn advance     # 強制的に 1 ターン進める
node packages/server-node/dist/cli.js time set <unix|ISO8601>
node packages/server-node/dist/cli.js backup list|create [label]|restore <label>|delete <label>
```

### ターン進行の仕組み

ターンは「最終更新時刻から 1 ターン分の時間が経過しているか」で判定します。判定はリクエスト時に行われるほか、Node サーバーでは一定間隔のタイマーからも呼ばれるため、アクセスがなくてもターンが進みます。

## 環境変数

| 環境変数                           | 既定値                              | 用途                                                         |
| ---------------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| `PORT`                             | `3000`                              | サーバーの待受ポート                                         |
| `HAKONIWA_DB_PATH`                 | `./data/hakoniwa.sqlite`            | SQLite データベースファイル                                  |
| `HAKONIWA_BACKUP_DIR`              | `./data/backups`                    | バックアップの出力先                                         |
| `HAKONIWA_TURN_CHECK_INTERVAL_SEC` | `60`                                | ターン進行判定のタイマー間隔 (秒)。`0` で無効                |
| `HAKONIWA_MASTER_PASSWORD`         | (なし)                              | 管理画面のパスワード。全島のパスワードの代用にもなる         |
| `HAKONIWA_SPECIAL_PASSWORD`        | (なし)                              | 設定変更フォームで使うと資金と食料が最大になる特殊パスワード |
| `HAKONIWA_DEBUG`                   | `false`                             | `true` でトップに「ターンを進める」ボタンを表示              |
| `HAKONIWA_ADMIN_ENABLED`           | `true`                              | 管理画面 (`/admin`) の有効 / 無効                            |
| `HAKONIWA_USE_LBBS`                | `false`                             | 島ごとのローカル掲示板の有効 / 無効                          |
| `HAKONIWA_UNIT_TIME_SEC`           | `21600`                             | 1 ターンの長さ (秒)                                          |
| `HAKONIWA_MAX_CATCH_UP_TURNS`      | `1`                                 | 1 回の判定で進める最大ターン数                               |
| `HAKONIWA_SITE_TITLE`              | `箱庭諸島２`                        | サイトタイトル                                               |
| `HAKONIWA_ADMIN_NAME`              | `管理者の名前`                      | フッタの管理者名                                             |
| `HAKONIWA_EMAIL`                   | `管理者@どこか.どこか.どこか`       | フッタの連絡先                                               |
| `HAKONIWA_BBS_URL`                 | `http://サーバー/掲示板.cgi`        | フッタの掲示板リンク                                         |
| `HAKONIWA_TOPPAGE_URL`             | `http://サーバー/ホームページ.html` | フッタのトップページリンク                                   |

## テストと静的検査

```sh
vp test    # Vitest
vp check   # フォーマット、lint、型チェック
vp fmt     # フォーマットの自動修正
```

## ライセンス

このリポジトリはオリジナルの「箱庭諸島２」の利用条件に従います。素晴らしいゲームを作られた原作者の方々、および Perl 版を現代の環境で動くよう整備してくださった fork 元 ([neguse/hakoniwa](https://github.com/neguse/hakoniwa)) の作者に感謝します。

- 字: 徳岡宏樹
- 絵: 小川克人
- 題字: 稲葉修吾
- テストプレイ他協力: 井上友博、小澤武史、さかもと、ほえほえ、ありづか

### スクリプトについて

オリジナルの readme (`hako-readme.txt` に同梱) では、改変版を配布する際の条件として次を定めています。

- 無料で配布すること
- ゲーム画面の最上部にある、スクリプト配布元 (http://www.bekkoame.ne.jp/~tokuoka/hakoniwa.html) へのリンクを消さないこと。それ以外の改造は自由
- 改変版も同じ条件で再配布を許可すること
- 配布ページに、オリジナルの配布元へのリンクを置くこと

この移植版でも画面最上部の配布元リンクは維持しています。なお原作者のサイトは現在アクセスできないため、最後の条件は実質的に満たせない状態です。

### 画像について

同梱の画像 (`packages/game/public/images`) は小川克人氏の著作物です。原作者サイトのアーカイブにある FAQ によれば、その後の許諾により「商用でない限り、箱庭諸島以外の用途でも配布・改変可」とされています。商用利用はできません。何か問題が起きても画像の原作者は関知しない、とのことです。

## 参考にしたサイト

- 再配布: [箱庭諸島の保管庫](http://www.hakoniwa.net/hako/)、[箱庭なページ](http://hako.gob.jp/)、[Neo-INO](http://neo-sub.sakura.ne.jp/ino/hako/download.html)
- 解説: [箱庭解体新書](http://qqmh3psd.web.fc2.com/sadoga/)
- 原作者サイトのアーカイブ: [Wayback Machine](https://web.archive.org/web/20070113153728/http://t.pos.to/hako/)
