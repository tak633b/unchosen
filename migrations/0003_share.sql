-- 共有のリンク (/s/<id>)。終わった人生の短い要約と、遊んだ人のひとことの感想。
-- image は OGP 用の 1200x630 PNG を base64 の文字で (D1 の1行は 2MB まで。上限は server/validate.mjs の SHARE_IMAGE_MAX)
CREATE TABLE IF NOT EXISTS share (
  id TEXT PRIMARY KEY,
  lang TEXT NOT NULL DEFAULT 'ja',
  name TEXT NOT NULL,
  birth_year INTEGER NOT NULL,
  age INTEGER NOT NULL,
  lines TEXT NOT NULL,
  stat INTEGER,
  feelings TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
