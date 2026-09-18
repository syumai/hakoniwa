# 箱庭諸島２

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

v2 (better-auth によるログイン) では、島の作成やログインにはユーザー認証が必須です。ローカル開発では
「開発ログイン」(任意のメールアドレスでログインできる機能) を使うのが手軽です。

```sh
cp .env.example .env
```

`.env` を開き、少なくとも次の 2 つを設定してください。

- `HAKONIWA_AUTH_SECRET`: `openssl rand -base64 32` などで生成した 32 バイト以上のランダム文字列
- `HAKONIWA_DEV_LOGIN=true`: 開発ログインを有効化
- `HAKONIWA_ADMIN_EMAILS=自分のメールアドレス`: 管理画面 (`/admin`) に入れるようにする (開発ログインでそのままログインすれば管理者になれる)

mise 経由 (`mise exec -- ...` や `mise activate` 済みのシェル) であれば、リポジトリ直下の `.env` は自動的に読み込まれます。mise を使わない場合は、同じシェルで環境変数を指定してください。

環境変数を変更したときは、開発サーバー (`vp run dev`) を再起動しないと反映されません。

```sh
vp run dev
```

開発サーバーが http://localhost:5173/ で起動します。初回はデータが未初期化なので、次のいずれかで作成してください。

- `/login` を開き、開発ログインのフォームに任意のメールアドレス (`HAKONIWA_ADMIN_EMAILS` に指定したもの) を入力してログインし、`/admin` で「新しいデータを作る」を実行する
- CLI で初期化する: `vp run --filter ./packages/server-node cli -- db init`

v1 (パスワード認証) のデータベースファイルが残っている場合はスキーマに互換性が無いため、
`vp run --filter ./packages/server-node cli -- db reset --yes` で一度削除してから
初期化し直してください (`HAKONIWA_DB_PATH` を新しいパスにして作り直しても構いません)。

X (Twitter) / Discord ログインを試したい場合は `HAKONIWA_X_CLIENT_ID`/`HAKONIWA_X_CLIENT_SECRET`
や `HAKONIWA_DISCORD_CLIENT_ID`/`HAKONIWA_DISCORD_CLIENT_SECRET` を設定してください
(OAuth アプリ側のコールバック URL は `${HAKONIWA_BASE_URL}/api/auth/callback/twitter`・
`.../callback/discord`)。メールログインは `HAKONIWA_RESEND_API_KEY` を設定しない限り
コンソールにリンクを出力するだけの開発用 Mailer で動きます。

## ビルドと起動

```sh
vp run build
HAKONIWA_AUTH_SECRET=xxxx HAKONIWA_DEV_LOGIN=true HAKONIWA_ADMIN_EMAILS=you@example.com node packages/server-node/dist/server.js
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

| 環境変数                                                        | 既定値                              | 用途                                                                           |
| --------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| `PORT`                                                          | `3000`                              | サーバーの待受ポート                                                           |
| `HAKONIWA_DB_PATH`                                              | `./data/hakoniwa.sqlite`            | SQLite データベースファイル                                                    |
| `HAKONIWA_BACKUP_DIR`                                           | `./data/backups`                    | バックアップの出力先                                                           |
| `HAKONIWA_TURN_CHECK_INTERVAL_SEC`                              | `60`                                | ターン進行判定のタイマー間隔 (秒)。`0` で無効                                  |
| `HAKONIWA_BASE_URL`                                             | `http://localhost:5173`             | better-auth の baseURL。OAuth コールバックと Origin 検査に使う                 |
| `HAKONIWA_AUTH_SECRET`                                          | (なし、**必須**)                    | better-auth の secret と CSRF トークンの鍵。`openssl rand -base64 32` 等       |
| `HAKONIWA_X_CLIENT_ID` / `HAKONIWA_X_CLIENT_SECRET`             | (なし)                              | 両方設定すると X (Twitter) ログインが有効になる                                |
| `HAKONIWA_DISCORD_CLIENT_ID` / `HAKONIWA_DISCORD_CLIENT_SECRET` | (なし)                              | 両方設定すると Discord ログインが有効になる                                    |
| `HAKONIWA_DEV_LOGIN`                                            | `false`                             | `true` で開発ログイン (任意のメールアドレスでログイン) を有効化                |
| `HAKONIWA_ADMIN_EMAILS`                                         | (なし)                              | 管理者とみなすメールアドレス (カンマ区切り)                                    |
| `HAKONIWA_RESEND_API_KEY`                                       | (なし)                              | メール送信 (Resend)。未設定ならコンソールにリンクを出力するだけの開発用 Mailer |
| `HAKONIWA_MAIL_FROM`                                            | `hakoniwa@example.com`              | メールの送信元アドレス                                                         |
| `HAKONIWA_NG_WORDS`                                             | (なし)                              | 追加の NG ワード (カンマ区切り)                                                |
| `HAKONIWA_DEBUG`                                                | `false`                             | `true` でトップに「ターンを進める」ボタンを表示 (管理者ログイン必須)           |
| `HAKONIWA_ADMIN_ENABLED`                                        | `true`                              | 管理画面 (`/admin`) の有効 / 無効                                              |
| `HAKONIWA_USE_LBBS`                                             | `false`                             | 島ごとのローカル掲示板の有効 / 無効                                            |
| `HAKONIWA_UNIT_TIME_SEC`                                        | `21600`                             | 1 ターンの長さ (秒)                                                            |
| `HAKONIWA_MAX_CATCH_UP_TURNS`                                   | `1`                                 | 1 回の判定で進める最大ターン数                                                 |
| `HAKONIWA_SITE_TITLE`                                           | `箱庭諸島２`                        | サイトタイトル                                                                 |
| `HAKONIWA_ADMIN_NAME`                                           | `管理者の名前`                      | フッタの管理者名                                                               |
| `HAKONIWA_EMAIL`                                                | `管理者@どこか.どこか.どこか`       | フッタの連絡先                                                                 |
| `HAKONIWA_BBS_URL`                                              | `http://サーバー/掲示板.cgi`        | フッタの掲示板リンク                                                           |
| `HAKONIWA_TOPPAGE_URL`                                          | `http://サーバー/ホームページ.html` | フッタのトップページリンク                                                     |

v1 にあった `HAKONIWA_MASTER_PASSWORD` / `HAKONIWA_SPECIAL_PASSWORD` は v2 で廃止されました (パスワード認証を全廃し、better-auth によるログインに置き換えたため)。管理画面へは管理者メールでログインします。資金・食料の最大化は管理画面の操作 (`/admin` の「資金・食料の最大化」) として引き継いでいます。

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
