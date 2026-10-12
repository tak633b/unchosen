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

// いま遊ばれている人生 (/api/life/*)。id は crypto.randomUUID()、ほかは人生のことだけ
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const lifeId = (v) => (typeof v === 'string' && UUID.test(v) ? v : null);
export const lifeAge = (v) => (Number.isInteger(v) && v >= 0 && v <= 130 ? v : null);
export const countryCode = (v) => (typeof v === 'string' && /^[A-Z]{3}$/.test(v) ? v : null);

export function validLife(b) {
  if (!b || typeof b !== 'object') return null;
  const id = lifeId(b.id), country = countryCode(b.country), age = lifeAge(b.age);
  const birthYear = b.birthYear;
  if (!id || !country || age === null || !['F', 'M', 'X'].includes(b.sex) || !Number.isInteger(birthYear) || birthYear < 1800 || birthYear > 2200) return null;
  return { id, country, birthYear, sex: b.sex, age };
}
