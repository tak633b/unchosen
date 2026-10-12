-- いま遊ばれている人生 (本物のプレイヤーの、本人の人生だけ)。id は人生ごとにクライアントが作る乱数で、保存データと一緒に持つ。
-- 人生のこと (生まれた国・年・性別・年齢) だけを持ち、IP や利用者の印は持たない。
-- 「いま生きている」 = ended_at が NULL で、last_seen (ミリ秒) が15分以内
CREATE TABLE IF NOT EXISTS life (
  id TEXT PRIMARY KEY,
  country TEXT NOT NULL,
  birth_year INTEGER NOT NULL,
  sex TEXT NOT NULL,
  age INTEGER NOT NULL,
  start_age INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  ended_at INTEGER,
  death_age INTEGER
);
-- 生きている数 (国ごとも) と、最近の死
CREATE INDEX IF NOT EXISTS life_live ON life (ended_at, last_seen, country);
-- 最近の誕生
CREATE INDEX IF NOT EXISTS life_started ON life (started_at);

-- 合計は表を数えずに、国ごとの1行に足していく (D1 の読む行数を増やさないため)
CREATE TABLE IF NOT EXISTS life_agg (
  country TEXT PRIMARY KEY,
  born INTEGER NOT NULL DEFAULT 0,
  finished INTEGER NOT NULL DEFAULT 0,
  age_sum INTEGER NOT NULL DEFAULT 0
);
