// ピクセルアートの場面と顔写真の入り口。Person から場面の材料を組み立て、描くのは scene.ts / portrait.ts。
// 見た目 (肌・髪・服) は look.ts から引くので、場面の家族と人の輪の顔写真は同じ人なら同じ色になる。
import { byCode, countryAt } from '../engine/countries';
import { countryOf, yearOf, type Person, type Relative, type Role } from '../engine/person';
import { makeRng } from '../engine/rng';
import { lookOfId, lookOfMe, lookOfRel, type Look } from './look';
import { hash } from './raster';
import { paintScene, type Figure, type Place, type Scene, type Tod } from './scene';

export { W, H, type Home, type Place, type Figure, type Scene, type Tod } from './scene';
export { drawPortrait, drawTiePortrait } from './portrait';

const kindOf = (age: number): Figure['kind'] => (age < 2 ? 'baby' : age < 13 ? 'child' : age >= 65 ? 'elder' : 'adult');
// 背丈は旧来の単位 (大人 15)。描くときに拡大する
const heightOf = (age: number) => (age < 2 ? 6 : age < 13 ? 8 + age * 0.25 : age < 16 ? 14 : 15);

function figureOf(l: Look, me = false): Figure {
  return {
    kind: kindOf(l.age), sex: l.sex, height: heightOf(l.age), skin: l.skin, hair: l.hair, shirt: l.cloth, pants: l.pants, me,
    style: l.style, cover: l.cover, skirt: l.skirt && l.age >= 5, beard: l.beard === 'full',
  };
}
const relFig = (p: Person, r: Relative, role: Role) => figureOf(lookOfRel(p, r, role));

// 時刻と季節は年ごとに変える (表示用の乱数。エンジンの乱数は消費しない)
const TODS: Tod[] = ['morning', 'day', 'day', 'dusk', 'dusk', 'night'];
function timeOf(seed: number, age: number): { tod: Tod; season: number } {
  const r = makeRng(hash(seed, age, 0x7173));
  return { tod: TODS[Math.floor(r() * TODS.length)], season: Math.floor(r() * 4) };
}

export function sceneOf(p: Person): Scene {
  const c = countryOf(p);
  const urban = p.city !== null;
  const poor = (p.working ? p.incomeP : p.familyP) < 0.35;
  const home = urban ? (c.gdp > 30000 && p.familyP > 0.75 && !p.migratedTo ? 'villa' : 'apartment') : poor && c.gdp < 8000 ? 'hut' : 'house';
  const place: Place = !p.alive ? 'grave'
    : p.illness ? 'hospital'
    : p.school.enrolled || p.school.uni === 'studying' || p.school.grad === 'studying' ? 'school'
    : p.retired ? 'bench'
    : p.working && p.unemployed === 0 ? (p.jobKind === 'farm' ? 'field' : p.jobKind === 'office' ? 'office' : p.selfEmployed ? 'stall' : 'factory')
    : 'none';
  // 家族: 若いうちは両親と、やがて連れ合いと子ども
  const withParents = p.age < 22 && !p.spouse?.alive;
  const figures: Figure[] = [];
  if (withParents && p.father.alive) figures.push(relFig(p, p.father, 'father'));
  if (withParents && p.mother.alive) figures.push(relFig(p, p.mother, 'mother'));
  if (!withParents && p.spouse?.alive) figures.push(relFig(p, p.spouse, 'spouse'));
  figures.push(figureOf(lookOfMe(p), true));
  for (const k of p.children.filter((k) => k.alive && k.age < 20).slice(0, 3)) figures.push(relFig(p, k, 'child'));
  if (withParents) for (const s of p.siblings.filter((s) => s.alive && s.age >= 0 && s.age < 18).slice(0, 2)) figures.push(relFig(p, s, 'sibling'));
  const time = p.alive ? timeOf(p.seed, p.age) : { tod: 'night' as Tod, season: timeOf(p.seed, p.age).season };
  return {
    seed: p.seed, country: c, urban, home, place, t: Math.min(1, p.age / 85), figures,
    pet: p.pet?.kind, car: p.car, poor, night: !p.alive, ...time, year: yearOf(p),
  };
}

// 1枚 1–3ms なのでキャッシュはしない
export function drawScene(cv: HTMLCanvasElement, s: Scene, tick = 0): void {
  paintScene(s, tick).put(cv);
}

// 小さなキャンバスを1つ作って描く (追悼館や共有カード用)
export function sceneCanvas(s: Scene): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  drawScene(cv, s);
  return cv;
}

// 追悼館のように Person が手元にないときの、ありあわせの場面
export function sceneFromSummary(o: { id: number; country: string; sex: 'F' | 'M'; age: number; rural: boolean; job?: string }): Scene {
  const c = byCode(o.country);
  const rng = makeRng(o.id * 2654435761);
  const me = figureOf(lookOfId(o.id, c, o.sex, o.age), true);
  const partner = figureOf(lookOfId(o.id, c, o.sex === 'F' ? 'M' : 'F', o.age, 1));
  const figures = o.age >= 20 ? [partner, me] : [me];
  const kind = o.job ? (/農|畑|漁|家畜/.test(o.job) ? 'field' : /店|露天|市場/.test(o.job) ? 'stall' : /工|建設|縫製|整備|電気/.test(o.job) ? 'factory' : 'office') : 'none';
  return {
    seed: o.id * 97, country: c, urban: !o.rural, home: o.rural ? (c.gdp < 8000 ? 'hut' : 'house') : 'apartment',
    place: o.age < 18 ? 'school' : (kind as Place), t: Math.min(1, o.age / 85), figures, pet: rng() < 0.3 ? '犬' : undefined, car: false, poor: c.gdp < 5000,
    ...timeOf(o.id, o.age),
  };
}

// 保存や HTML 埋め込みのための、国を国コードにした場面
export type SceneData = Omit<Scene, 'country'> & { country: string };
export const toData = (s: Scene): SceneData => ({ ...s, country: s.country.code });
export const fromData = (d: SceneData): Scene => ({ ...d, country: d.year ? countryAt(d.country, d.year) : byCode(d.country) });

// data-scene (SceneData の JSON) を持つキャンバスを、まとめて描く
export function paintScenes(root: ParentNode = document): void {
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-scene]').forEach((cv) => {
    try { drawScene(cv, fromData(JSON.parse(cv.dataset.scene!))); } catch { /* 古い記録で形が違えば描かない */ }
  });
}

export const sceneAttr = (d: SceneData) => JSON.stringify(d).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
