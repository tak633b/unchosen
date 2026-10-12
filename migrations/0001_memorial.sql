-- 追悼館 (Cloudflare D1)。欄は server/server.mjs の memorial と同じに、非表示の欄を足したもの
CREATE TABLE IF NOT EXISTS memorial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  rural INTEGER NOT NULL DEFAULT 0,
  birth_year INTEGER NOT NULL DEFAULT 0,
  job TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL,
  sex TEXT NOT NULL,
  age INTEGER NOT NULL,
  cause TEXT NOT NULL,
  line TEXT NOT NULL,
  message TEXT NOT NULL,
  candles INTEGER NOT NULL DEFAULT 0,
  lang TEXT NOT NULL DEFAULT 'ja',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  gen INTEGER NOT NULL DEFAULT 1,
  family TEXT NOT NULL DEFAULT '',
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS memorial_visible ON memorial (hidden, lang, id);

-- 送信量の制限: 固定の時間窓ごとの回数。k = 種類:IPのHMAC:窓の番号、exp を過ぎた行は消す
CREATE TABLE IF NOT EXISTS rate (
  k TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  exp INTEGER NOT NULL
);
