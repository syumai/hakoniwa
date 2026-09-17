# TypeScript 版

このリポジトリでは、オリジナルの Perl 版に加えて、TypeScript (Node.js + Hono) で書き直した版を提供しています。
将来 Cloudflare Workers (Durable Objects) にも載せ替えられるよう、ゲームロジックと HTTP 層をランタイムから
独立させて実装しています。

## 構成

モノレポ (pnpm workspace) 構成になっています。

| パッケージ | 役割 |
| --- | --- |
| `packages/game` (`@hakoniwa/game`) | ゲーム本体。ランタイム非依存 (Node/Cloudflare 固有 API を使わない)。ゲームロジック (`core`)、ユースケース (`app`)、ストレージ抽象 (`storage`)、Web 層 (`web`、Hono + hono/jsx) を含む |
| `packages/server-node` (`@hakoniwa/server-node`) | Node.js 向け Adapter。`node:sqlite` によるストレージ実装、HTTP サーバー起動、CLI (`cli.ts`) |
| `packages/server-workers` (`@hakoniwa/server-workers`) | Cloudflare Workers (Durable Objects SQLite) 向け Adapter。現時点では型定義のみのスケルトンで、実装は今後のフェーズで行う |

Perl 版のソース (`lib/`, `cgi/`, `t/`, `app.psgi`, `cpanfile*`) はそのまま残しています。設計書は `tmp/` 配下にありますが
`.gitignore` 対象です。

## 必要なツール

Node、pnpm、[Vite+](https://viteplus.dev/) (`vp`) は [mise](https://mise.jdx.dev/) で管理しています。

```sh
mise install
mise exec -- vp install   # 全ワークスペースの依存をインストール (pnpm install 相当)
```

シェルで mise を activate していない場合は、以降のコマンドもすべて `mise exec -- ` を付けて実行してください。

## 開発

```sh
vp run dev
```

`packages/server-node` の開発サーバーが起動し、http://localhost:5173/ で確認できます。

初回起動時はデータが未初期化の状態です。次のいずれかの方法で新しいデータを作成してください。

- ブラウザで `/admin` を開き、「新しいデータを作る」を実行する
- CLI で初期化する: `vp run --filter ./packages/server-node cli -- db init`

## ビルドと起動

```sh
vp run build
HAKONIWA_MASTER_PASSWORD=好きなパスワード node packages/server-node/dist/server.js
```

`vp run build` で `packages/server-node/dist/server.js` (サーバー) と `dist/cli.js` (CLI) が生成されます。

CLI は `node packages/server-node/dist/cli.js <command>` または
`vp run --filter ./packages/server-node cli -- <command>` で実行できます (`--help` で使い方を表示)。

```sh
node packages/server-node/dist/cli.js db init
node packages/server-node/dist/cli.js db status
node packages/server-node/dist/cli.js turn advance
node packages/server-node/dist/cli.js backup create
```

## 環境変数

| 環境変数 | 既定値 | 用途 |
| --- | --- | --- |
| `PORT` | `3000` | Node サーバーの待受ポート |
| `HAKONIWA_DB_PATH` | `./data/hakoniwa.sqlite` | SQLite データベースファイルのパス |
| `HAKONIWA_BACKUP_DIR` | `./data/backups` | バックアップファイルの出力先ディレクトリ |
| `HAKONIWA_TURN_CHECK_INTERVAL_SEC` | `60` | ターン進行の外部トリガー間隔 (秒)。`0` で無効化 |
| `HAKONIWA_MASTER_PASSWORD` | (なし) | 管理画面 (`/admin`) と全島共通パスワードの代用 |
| `HAKONIWA_SPECIAL_PASSWORD` | (なし) | 名前/パスワード変更フォームの旧パスワード欄専用の代用パスワード |
| `HAKONIWA_DEBUG` | `false` | `true` で `POST /turn` (デバッグ用手動ターン進行) を有効化 |
| `HAKONIWA_ADMIN_ENABLED` | `true` | `/admin` (Web 管理画面) の有効/無効 |
| `HAKONIWA_USE_LBBS` | `false` | ローカル掲示板機能の有効/無効 |
| `HAKONIWA_UNIT_TIME_SEC` | `21600` | 1 ターンの長さ (秒) |
| `HAKONIWA_MAX_CATCH_UP_TURNS` | `1` | 1 回の判定で進められる最大ターン数 |
| `HAKONIWA_SITE_TITLE` | `箱庭諸島２` | サイトタイトル |
| `HAKONIWA_ADMIN_NAME` | `管理者の名前` | フッタに表示する管理者名 |
| `HAKONIWA_EMAIL` | `管理者@どこか.どこか.どこか` | フッタに表示する管理者連絡先 |
| `HAKONIWA_BBS_URL` | `http://サーバー/掲示板.cgi` | フッタに表示する掲示板 URL |
| `HAKONIWA_TOPPAGE_URL` | `http://サーバー/ホームページ.html` | フッタに表示するトップページ URL |

## テスト・lint

```sh
vp test    # Vitest によるテスト一式
vp check   # フォーマット + lint + 型チェック
vp fmt     # フォーマット (自動修正)
```

# これはなにか

箱庭諸島2をベースに、今風のPerlで動くようにする版です。TypeScript (Node.js + Hono) への移植版も上記の通り用意しています。

# ライセンス

オリジナルの箱庭諸島2に準じます。
素晴らしいゲームを制作された原作者の方々に敬意を表します。

>  箱庭諸島 ver2.3
> 
>    字: 徳岡宏樹
>    絵: 小川克人
>  題字: 稲葉修吾
>  テストプレイ他協力: 井上友博、小澤武史、さかもと、ほえほえ、ありづか
>  箱庭諸島のページ: http://www.bekkoame.ne.jp/~tokuoka/hakoniwa.html

## スクリプトについて

以下、オリジナルのreadme.txtより。

> 箱庭諸島2のスクリプトを改変し、それを他人に譲渡、配布する場合には、
> 以下の制約を課します。
> 
> ・無料配布であること。
> ・ゲーム画面のトップに表示される、スクリプトの配布元へのリンクを
>   消すのを禁止すること。また、それ以外の改造は許可すること。
> ・本条件と同等に、改造したものの配布を許可すること。
> ・配布するページにおいて、オリジナルスクリプトの配布元として当サイトへ
>   のリンクを置くこと。

…といっても、オリジナルの作者である[徳岡宏樹さんのWebサイト](http://t.pos.to/hako/)は
現時点でアクセスできない状態になってしまっているため、4つめの制約はあまり意味のないものになってしまっています。

## 画像ファイルについて

以下、[徳岡宏樹さんのWebサイトサイトのアーカイブ](https://web.archive.org/web/20070113153728/http://t.pos.to/hako/)より。

> [Q3] オリジナルに付属していた画像については、再配布や改変は可能ですか？
> 
> [A3] 商用利用を除いて、許可するものとします。
> オリジナルスクリプトに付属していた文書では「箱庭諸島以外の用途に使用してはならない」と書いてありました。
> しかし、その後原作者より「商用でない限り、箱庭諸島以外でも配布・改変可」という許可を得ています。
> 従って、商用利用でなければ配布も改変も可能です。
> もちろん何らかの問題が発生したとしても画像の原作者は関知しません。
> 自己責任でお願いします。

# 参考にさせていただいたWebサイト

* 再配布
    * [箱庭諸島の保管庫](http://www.hakoniwa.net/hako/)
    * [箱庭なページ](http://hako.gob.jp/)
    * [Neo-INO](http://neo-sub.sakura.ne.jp/ino/hako/download.html)
* 解説
    * [箱庭解体新書](http://qqmh3psd.web.fc2.com/sadoga/)
* jcode.pl
    * [ftp.iij.ad.jp](ftp://ftp.iij.ad.jp/pub/IIJ/dist/utashiro/perl/)

