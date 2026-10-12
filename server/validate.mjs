// 追悼館に残す1件の確かめ方。Node 版 (server.mjs) と Cloudflare 版 (cf-api.mjs) で共有する
export const langOf = (v) => (v === 'en' ? 'en' : 'ja');

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function validEntry(b) {
  if (!b || typeof b !== 'object') return null;
  const country = str(b.country, 3);
  const age = Number(b.age);
  if (!/^[A-Z]{3}$/.test(country) || !['F', 'M', 'X'].includes(b.sex) || !Number.isInteger(age) || age < 0 || age > 120) return null;
  const cause = str(b.cause, 40);
  if (!cause) return null;
  if (b.lang !== undefined && !['ja', 'en'].includes(b.lang)) return null;
  const birthYear = Number(b.birthYear);
  const gen = Number(b.gen);
  return {
    rural: b.rural ? 1 : 0, name: str(b.name, 60), birthYear: Number.isInteger(birthYear) ? birthYear : 0, job: str(b.job, 40),
    country, sex: b.sex, age, cause, line: str(b.line, 400), message: str(b.message, 200), lang: langOf(b.lang),
    gen: Number.isInteger(gen) && gen >= 1 && gen <= 999 ? gen : 1, family: str(b.family, 400),
  };
}

// 共有のリンク (/api/share) に載せる1件。本文は短い要約だけ (名前は作り物、連絡先は無い)。
// image は 1200×630 の PNG を base64 で。頭の8バイト (PNG の印) と大きさを確かめる
export const SHARE_IMAGE_MAX = 512 * 1024;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngOf(v) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string' || v.length > Math.ceil(SHARE_IMAGE_MAX / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(v)) return null;
  let head;
  try { head = atob(v.slice(0, 12)); } catch { return null; }
  return PNG.every((b, i) => head.charCodeAt(i) === b) ? v : null;
}

export function validShare(b) {
  if (!b || typeof b !== 'object') return null;
  const age = Number(b.age), birthYear = Number(b.birthYear);
  const name = str(b.name, 60);
  if (!name || !Number.isInteger(age) || age < 0 || age > 120 || !Number.isInteger(birthYear) || birthYear < 1700 || birthYear > 2300) return null;
  if (b.lang !== undefined && !['ja', 'en'].includes(b.lang)) return null;
  if (!Array.isArray(b.lines) || b.lines.length < 1 || b.lines.length > 6) return null;
  const lines = b.lines.map((l) => str(l, 160));
  if (lines.some((l) => !l)) return null;
  const stat = b.stat === null || b.stat === undefined ? null : Number(b.stat);
  if (stat !== null && (!Number.isInteger(stat) || stat < 0 || stat > 100)) return null;
  const image = pngOf(b.image);
  if (image === null) return null;
  return { lang: langOf(b.lang), name, birthYear, age, lines: lines.join('\n'), stat, feelings: str(b.feelings, 200), image };
}
