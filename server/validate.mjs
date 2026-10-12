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
