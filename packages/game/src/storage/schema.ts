// tmp/04-database.md 「スキーマ」節の DDL。
// 設計書との差異: 設計書は `packages/game/schema.sql` を正としてここへ文字列として埋め込む
// 想定だが、schema.sql (人が読むためのコピー) と schema.ts (実際に読まれる文字列) の二重管理を
// 避けるため、schema.sql は置かず本ファイルのみを正とする (Vite の `?raw` import は
// Workers/テストで扱いが揺れるため使わない、という設計書の指示に従った結果の選択)。
export const schemaSql = `
CREATE TABLE schema_version (
  version INTEGER NOT NULL
) STRICT;

-- Perl: hakojima.dat 先頭 4 行。常に 1 行
CREATE TABLE game (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  turn            INTEGER NOT NULL,
  last_time       INTEGER NOT NULL,
  next_island_id  INTEGER NOT NULL
) STRICT;

-- Perl: hakojima.dat の島ブロック + island.N
CREATE TABLE islands (
  id              INTEGER PRIMARY KEY,
  rank            INTEGER NOT NULL UNIQUE,
  name            TEXT    NOT NULL UNIQUE,
  password_hash   TEXT    NOT NULL,
  comment         TEXT    NOT NULL DEFAULT '',
  score           INTEGER NOT NULL DEFAULT 0,
  absent          INTEGER NOT NULL DEFAULT 0,
  money           INTEGER NOT NULL,
  food            INTEGER NOT NULL,
  pop             INTEGER NOT NULL DEFAULT 0,
  area            INTEGER NOT NULL DEFAULT 0,
  farm            INTEGER NOT NULL DEFAULT 0,
  factory         INTEGER NOT NULL DEFAULT 0,
  mountain        INTEGER NOT NULL DEFAULT 0,
  prize_flags     INTEGER NOT NULL DEFAULT 0,
  prize_monsters  INTEGER NOT NULL DEFAULT 0,
  prize_turns     TEXT    NOT NULL DEFAULT '[]',
  terrain         TEXT    NOT NULL,
  commands        TEXT    NOT NULL,
  created_turn    INTEGER NOT NULL
) STRICT;

-- Perl: island.N 末尾の lbbs 行。position 0 が最新
-- 外部キーは張らない (DO の PRAGMA 制限を避け、削除はリポジトリが明示的に行う)
CREATE TABLE lbbs_posts (
  island_id   INTEGER NOT NULL,
  position    INTEGER NOT NULL,
  author      TEXT    NOT NULL CHECK (author IN ('visitor', 'owner')),
  name        TEXT    NOT NULL,
  message     TEXT    NOT NULL,
  turn        INTEGER NOT NULL,
  PRIMARY KEY (island_id, position)
) STRICT;

-- Perl: hakojima.logN (N = 何ターン前か)。turn 列で代替
CREATE TABLE logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  turn        INTEGER NOT NULL,
  seq         INTEGER NOT NULL,
  secret      INTEGER NOT NULL DEFAULT 0,
  island_id   INTEGER NOT NULL DEFAULT 0,
  target_id   INTEGER NOT NULL DEFAULT 0,
  html        TEXT    NOT NULL
) STRICT;
CREATE INDEX logs_turn_seq ON logs(turn, seq);
CREATE INDEX logs_island   ON logs(island_id, turn);
CREATE INDEX logs_target   ON logs(target_id, turn);

-- Perl: hakojima.his
CREATE TABLE history (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  turn    INTEGER NOT NULL,
  html    TEXT    NOT NULL
) STRICT;

-- Workers 版のみ使用 (PITR ブックマークの台帳)。Node 版では空のまま
CREATE TABLE backups (
  label       TEXT    PRIMARY KEY,
  bookmark    TEXT    NOT NULL,
  turn        INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
) STRICT;
`;
