-- みんなの人生への反応: 「心に留める」の数、通報の数 (3件で非表示)、残した本人だけが消せる鍵 (token は残した端末にだけ返す)
ALTER TABLE memorial ADD COLUMN hearts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memorial ADD COLUMN reports INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memorial ADD COLUMN token TEXT NOT NULL DEFAULT '';
