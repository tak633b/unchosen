// 「この人生をシェア」の5つの形: 4コマ・同じ1秒・ひとこと・幸せグラフ・記録。
// 人生ごとに似合う形を pickCard で選び、PastLife.card に残す。どの形も 4:5 (1080×1350) と 9:16 (1080×1920) で描ける
import type { PastLife } from './death';
import type { Person, Tie } from '../engine/person';
import { byCode } from '../engine/countries';
import { bornIn } from '../engine/polity';
import { FONT, SERIF, wrap } from './cards';
import { drawScene, fromData, H as SH, W as SW, type SceneData } from './pixel';
import { landXY, MAP_H, MAP_W, xy } from './worldmap';
import { pickMoments } from './album';
import { roleName } from './ring';
import { load } from './dom';
import { storeLives } from './past';
import { happiestAge, shareCardOf, TAGS } from './share';
import { isEn, L } from '../i18n';

export type CardKind = 'frames' | 'second' | 'word' | 'happy' | 'record';
export const CARD_KINDS: CardKind[] = ['frames', 'second', 'word', 'happy', 'record'];
export const cardLabel = (k: CardKind): string => ({
  frames: L('4コマ', 'Four frames'), second: L('同じ1秒', 'Same second'), word: L('ひとこと', 'One line'), happy: L('幸せグラフ', 'Happiness'), record: L('記録', 'Record'),
})[k];

type Picked = Pick<PastLife, 'seed' | 'age' | 'others' | 'message' | 'words' | 'album' | 'happyByAge'>;

// 「ひとこと」に出す言葉: 自分で残した一言か、最後にそばにいた人の言葉。どちらも無ければ undefined
export const wordOf = (l: Pick<PastLife, 'message' | 'words'>): { text: string; id?: number; name?: string } | undefined =>
  l.message ? { text: l.message } : l.words?.[0] ? { text: l.words[0].text, id: l.words[0].id, name: l.words[0].name } : undefined;

// 同じ1秒に生まれた人たち (自分も含む) の寿命の最小と最大
export const ageSpread = (l: Pick<PastLife, 'age' | 'others'>): [number, number] => {
  const ages = [l.age, ...l.others.map((o) => o.age)];
  return [Math.min(...ages), Math.max(...ages)];
};
export const SPREAD_BIG = 40;

export const cardKinds = (l: Picked): CardKind[] => CARD_KINDS.filter((k) => k !== 'word' || wordOf(l));

// 似合う形。幼くして終わった人生は記録、寿命が60年以上分かれていれば同じ1秒。
// それ以外は、似合う形 (40年以上分かれていれば同じ1秒・言葉があればひとこと・場面が4枚あれば4コマ・20年以上生きたなら幸せグラフ) の中から
// seed で一つに決める (言葉と場面はほとんどの人生にあるので、順に見ると同じ形ばかりになる。実測は zztmp の報告を見る)
export function pickCard(l: Picked): CardKind {
  if (l.age < 3) return 'record';
  const [lo, hi] = ageSpread(l);
  if (hi - lo >= SPREAD_BIG + 20) return 'second';
  const pool: CardKind[] = [
    ...(hi - lo >= SPREAD_BIG ? ['second' as const] : []),
    ...(wordOf(l) ? ['word' as const] : []),
    ...((l.album?.length ?? 0) >= 4 ? ['frames' as const] : []),
    ...(l.age >= 20 ? ['happy' as const] : []),
  ];
  return pool.length ? pool[(Math.abs(l.seed) % 1000003) * 7919 % pool.length] : 'record';
}

// 選んだ形をこの人生に残す (前世の記録の同じ人生も書き換える)
export function setCard(l: PastLife, kind: CardKind): void {
  l.card = kind;
  const lives = load<PastLife[]>('lives', []);
  if (lives.some((x) => x.seed === l.seed && x.date === l.date)) storeLives(lives.map((x) => (x.seed === l.seed && x.date === l.date ? { ...x, card: kind } : x)));
}

// ---- 描く ----
const BG = '#11141d', INK = '#ebe5d8', SUB = '#a7a193', ACCENT = '#e9a64c', LINE = '#2d3446';
const W = 1080, M = 48; // 幅と余白

function base(story: boolean, head: string) {
  const H = story ? 1920 : 1350;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  g.fillStyle = ACCENT;
  g.fillRect(0, 0, W, 84);
  g.fillStyle = '#1a1408';
  g.font = `bold 34px ${FONT}`;
  g.fillText('UNCHOSEN', M, 55);
  g.font = `24px ${FONT}`;
  g.fillText(head, W - M - g.measureText(head).width, 53);
  return { cv, g, H };
}

function foot(g: CanvasRenderingContext2D, H: number, closing: string): void {
  g.fillStyle = INK;
  g.font = `bold 30px ${SERIF}`;
  wrap(g, closing, M, H - 76, W - M * 2, 38, 1);
  g.fillStyle = SUB;
  g.font = `22px ${FONT}`;
  g.fillText(`${location.host}  ${TAGS}`, M, H - 34);
}

const span = (l: PastLife) => L(`${bornIn(l.birthCountry, l.birthYear, l.birthSide)}・${l.birthYear}–${l.birthYear + l.age}・${l.age}歳まで`, `${bornIn(l.birthCountry, l.birthYear, l.birthSide)} · ${l.birthYear}–${l.birthYear + l.age} · lived to ${l.age}`);
// 名前と生没年の2行。返すのは次の y
function nameBlock(g: CanvasRenderingContext2D, l: PastLife, y: number, center = false): number {
  g.fillStyle = INK;
  g.font = `bold 44px ${SERIF}`;
  const nx = center ? (W - Math.min(W - M * 2, g.measureText(l.name).width)) / 2 : M;
  wrap(g, l.name, nx, y, W - M * 2, 52, 1);
  g.fillStyle = SUB;
  g.font = `26px ${FONT}`;
  const s = span(l);
  wrap(g, s, center ? (W - Math.min(W - M * 2, g.measureText(s).width)) / 2 : M, y + 42, W - M * 2, 34, 1);
  return y + 42 + 34;
}

// 文字列を幅に収まる行に分ける (英語は単語で折る)
function split(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const ch of isEn ? text.split(/(?<= )/) : text) {
    // 句読点や閉じかっこは行頭に置かない
    if (line && g.measureText(line + ch).width > maxW && !/^[、。」』）!?！？,.]/.test(ch)) { out.push(line.trimEnd()); line = ch; } else line += ch;
  }
  if (line) out.push(line.trimEnd());
  return out;
}

const CLOSING = L('誰も、どこに生まれるかを選んでいない。', 'No one chooses where they are born.');

// ---- 4コマ ----
interface Frame { age: number; year: number; text: string; scene?: SceneData }
// アルバムに4枚あればそこから。無ければ記録の節目 (誕生・学校か仕事・家族・最期) から
export function framesOf(l: PastLife): Frame[] {
  if ((l.album?.length ?? 0) >= 4) return pickMoments(l.album!, 4);
  const log = l.log;
  const firstOf = (ok: (e: PastLife['log'][number]) => boolean) => log.find((e) => e.big && ok(e)) ?? log.find(ok);
  const picks = [log[0], firstOf((e) => e.kind === 'school' || e.kind === 'work'), firstOf((e) => e.kind === 'family' || e.kind === 'love'), log[log.length - 1]]
    .filter((e): e is PastLife['log'][number] => !!e);
  const seen = new Set<number>();
  const fr: Frame[] = [];
  for (const e of picks) if (!seen.has(e.age)) { seen.add(e.age); fr.push({ age: e.age, year: l.birthYear + e.age, text: e.text }); }
  for (const m of l.album ?? []) if (fr.length < 4 && !seen.has(m.age)) { seen.add(m.age); fr.push(m); }
  fr.sort((a, b) => a.age - b.age);
  if (fr.length && l.scene) fr[fr.length - 1].scene ??= l.scene;
  return fr;
}

function frame(g: CanvasRenderingContext2D, f: Frame, x: number, y: number, w: number): number {
  const pad = 12, sw = w - pad * 2, sh = Math.round((sw / SW) * SH), cap = 86;
  g.fillStyle = INK;
  g.fillRect(x, y, w, sh + pad * 2 + cap);
  if (f.scene) {
    const sc = document.createElement('canvas');
    drawScene(sc, fromData(f.scene));
    g.drawImage(sc, x + pad, y + pad, sw, sh);
  } else {
    g.fillStyle = '#1b2030';
    g.fillRect(x + pad, y + pad, sw, sh);
    g.fillStyle = ACCENT;
    g.font = `bold ${Math.round(sh * 0.5)}px ${SERIF}`;
    const t = String(f.year);
    g.fillText(t, x + pad + (sw - g.measureText(t).width) / 2, y + pad + sh / 2 + sh * 0.18);
  }
  g.fillStyle = '#1a1408';
  g.font = `bold 22px ${FONT}`;
  const age = L(`${f.age}歳・${f.year}`, `Age ${f.age} · ${f.year}`);
  g.fillText(age, x + pad, y + pad + sh + 32);
  g.fillStyle = '#3a3426';
  g.font = `20px ${FONT}`;
  wrap(g, f.text, x + pad, y + pad + sh + 62, sw, 24, 1);
  return sh + pad * 2 + cap;
}

function framesCard(l: PastLife, story: boolean): HTMLCanvasElement {
  const { cv, g, H } = base(story, L('この人生の4つの場面', 'Four moments of a life'));
  const fr = framesOf(l);
  let y = nameBlock(g, l, 84 + 88);
  const frameH = (w: number) => Math.round(((w - 24) / SW) * SH) + 24 + 86;
  if (story) {
    // 縦に4枚 (幅を少し狭めて、下の一行まで収める)
    const w = 760, gap = 16, x = (W - w) / 2;
    y += Math.max(24, (H - 120 - y - fr.length * (frameH(w) + gap)) / 2);
    for (const f of fr) y += frame(g, f, x, y, w) + gap;
  } else {
    // 2×2。名前と下の一行のあいだの真ん中に
    const gap = 20, w = (W - M * 2 - gap) / 2, rows = Math.ceil(fr.length / 2);
    y += Math.max(24, (H - 120 - y - rows * (frameH(w) + gap)) / 2);
    fr.forEach((f, i) => frame(g, f, M + (i % 2) * (w + gap), y + Math.floor(i / 2) * (frameH(w) + gap), w));
  }
  foot(g, H, CLOSING);
  return cv;
}

// ---- 同じ1秒 ----
function secondCard(l: PastLife, story: boolean): HTMLCanvasElement {
  const { cv, g, H } = base(story, L('同じ1秒に生まれた人たち', 'Born in the same second'));
  const all = [{ name: l.name, country: l.birthCountry, age: l.age, me: true }, ...l.others.map((o) => ({ name: o.name, country: o.country, age: o.age, me: false }))].sort((a, b) => a.age - b.age);
  const [lo, hi] = ageSpread(l);
  // 題・地図・5人の並びをまとめて、上の帯と下の一行のあいだの真ん中へ
  const rowH = story ? 68 : 58, mapH = Math.round(MAP_H * ((W - M * 2) / MAP_W));
  const block = 186 + mapH + 56 + all.length * rowH;
  let y = 84 + Math.max(60, (H - 120 - 84 - block) / 2 + 50);
  g.fillStyle = INK;
  g.font = `bold 40px ${SERIF}`;
  const t = L(`同じ1秒に生まれた${all.length}人は`, `${all.length} people born in the same second`);
  g.fillText(t, (W - g.measureText(t).width) / 2, y);
  y += 96;
  g.fillStyle = ACCENT;
  g.font = `bold 96px ${FONT}`;
  const big = L(`${lo}歳 〜 ${hi}歳`, `${lo} – ${hi}`);
  g.fillText(big, (W - g.measureText(big).width) / 2, y);
  g.fillStyle = SUB;
  g.font = `28px ${FONT}`;
  const sub = L('まで生きた', 'years lived');
  g.fillText(sub, (W - g.measureText(sub).width) / 2, y + 46);
  y += 90;
  // 地図 (worldmap.ts と同じ正距円筒図法の座標)
  const mw = W - M * 2, s = mw / MAP_W, mh = Math.round(MAP_H * s), mx = M, my = y;
  g.fillStyle = '#161a26';
  g.fillRect(mx, my, mw, mh);
  g.fillStyle = LINE;
  for (const [x, yy] of landXY()) { g.beginPath(); g.arc(mx + x * s, my + yy * s, 3, 0, Math.PI * 2); g.fill(); }
  const used = new Map<string, number>();
  const spots = all.map((o) => {
    const at = xy(o.country) ?? [MAP_W / 2, MAP_H / 2];
    const n = used.get(o.country) ?? 0;
    used.set(o.country, n + 1);
    // 同じ国に何人もいれば、少しずらして重ねない
    const a = (n * Math.PI * 2) / 3, r = n ? 22 : 0;
    return { ...o, x: mx + at[0] * s + Math.cos(a) * r, y: my + at[1] * s + Math.sin(a) * r };
  });
  for (const o of spots) {
    g.fillStyle = o.me ? ACCENT : INK;
    g.beginPath();
    g.arc(o.x, o.y, o.me ? 13 : 10, 0, Math.PI * 2);
    g.fill();
  }
  // 年齢の札。点や他の札に重なるなら、右→左→上→下の順でずらす
  g.font = `bold 26px ${FONT}`;
  const taken: [number, number, number, number][] = spots.map((o) => [o.x - 14, o.y - 14, 28, 28]);
  const hits = (r: [number, number, number, number]) => taken.some((t) => r[0] < t[0] + t[2] && t[0] < r[0] + r[2] && r[1] < t[1] + t[3] && t[1] < r[1] + r[3]);
  for (const o of spots) {
    const lab = String(o.age), w = g.measureText(lab).width;
    const cands: [number, number][] = [[o.x + 16, o.y + 10], [o.x - 16 - w, o.y + 10], [o.x - w / 2, o.y - 18], [o.x - w / 2, o.y + 40]];
    const [lx, ly] = cands.find(([x, yy]) => !hits([x, yy - 24, w, 28])) ?? cands[0];
    taken.push([lx, ly - 24, w, 28]);
    g.fillStyle = BG;
    g.fillText(lab, lx + 2, ly + 2);
    g.fillStyle = o.me ? ACCENT : INK;
    g.fillText(lab, lx, ly);
  }
  y = my + mh + 56;
  // 5人の並び (短く生きた順)
  for (const o of all) {
    g.fillStyle = o.me ? ACCENT : INK;
    g.font = `bold 32px ${FONT}`;
    const age = L(`${o.age}歳`, String(o.age));
    g.fillText(age, M + 80 - g.measureText(age).width, y);
    g.font = `${o.me ? 'bold ' : ''}26px ${FONT}`;
    wrap(g, `${o.name}${L('・', ' · ')}${byCode(o.country).name}${o.me ? L('・この人生のあなた', ' · you, this life') : ''}`, M + 110, y, W - M * 2 - 110, 30, 1);
    g.fillStyle = LINE;
    g.fillRect(M, y + 16, W - M * 2, 2);
    y += rowH;
  }
  foot(g, H, CLOSING);
  return cv;
}

// ---- ひとこと ----
function wordCard(l: PastLife, story: boolean): HTMLCanvasElement {
  const { cv, g, H } = base(story, L('この人生に残った言葉', 'Words left from a life'));
  const w = wordOf(l)!;
  const tie = w.id !== undefined ? l.circle?.find((t) => t.id === w.id) : undefined;
  const who = w.id === undefined ? L(`${l.name}に残した一言`, `A word left for ${l.name}`)
    : `${w.name ?? ''}${tie ? L(`(${roleName(tie as Tie, { age: l.age } as Person)})`, ` (${roleName(tie as Tie, { age: l.age } as Person)})`) : ''}`;
  const text = L(`「${w.text}」`, `“${w.text}”`);
  // 大きく、でも5行に収まる大きさで
  let fs = 76, lines: string[] = [];
  do { g.font = `bold ${fs}px ${SERIF}`; lines = split(g, text, W - M * 2); } while (lines.length > 5 && (fs -= 4) > 30);
  const lh = Math.round(fs * 1.5), blockH = lines.length * lh;
  const top = 84, bottom = H - 220;
  let y = top + (bottom - top - blockH) / 2 + fs;
  g.fillStyle = INK;
  for (const ln of lines) { g.fillText(ln, (W - g.measureText(ln).width) / 2, y); y += lh; }
  g.fillStyle = ACCENT;
  g.font = `28px ${FONT}`;
  const by = `— ${who}`;
  g.fillText(by, (W - g.measureText(by).width) / 2, y + 10);
  nameBlock(g, l, H - 190, true);
  foot(g, H, CLOSING);
  return cv;
}

// ---- 幸せグラフ ----
function happyCard(l: PastLife, story: boolean): HTMLCanvasElement {
  const { cv, g, H } = base(story, L('毎年の幸せ', 'Happiness, year by year'));
  const h = l.happyByAge.slice(0, l.age + 1);
  let prev = 50;
  const v = Array.from({ length: l.age + 1 }, (_, i) => { const x = h[i]; if (typeof x === 'number') prev = x; return Math.max(0, Math.min(100, prev)); });
  let y = 84 + (story ? 260 : 110);
  g.fillStyle = INK;
  g.font = `bold 40px ${SERIF}`;
  const t = L('どれだけ幸せだったか', 'How happy each year was');
  g.fillText(t, (W - g.measureText(t).width) / 2, y);
  const best = happiestAge(l.happyByAge);
  y += 70;
  // 面グラフ: 山の稜線のように
  const gx = M, gw = W - M * 2, gh = story ? 900 : 660, gy = y, base0 = gy + gh;
  const px = (i: number) => gx + (l.age ? (i / l.age) * gw : gw / 2);
  const py = (val: number) => base0 - (val / 100) * gh;
  const grad = g.createLinearGradient(0, gy, 0, base0);
  grad.addColorStop(0, 'rgba(233,166,76,0.75)');
  grad.addColorStop(1, 'rgba(233,166,76,0.08)');
  g.beginPath();
  g.moveTo(gx, base0);
  v.forEach((val, i) => g.lineTo(px(i), py(val)));
  g.lineTo(px(l.age), base0);
  g.closePath();
  g.fillStyle = grad;
  g.fill();
  g.beginPath();
  v.forEach((val, i) => (i ? g.lineTo(px(i), py(val)) : g.moveTo(px(i), py(val))));
  g.strokeStyle = ACCENT;
  g.lineWidth = 5;
  g.lineJoin = 'round';
  g.stroke();
  g.fillStyle = LINE;
  g.fillRect(gx, base0, gw, 2);
  // 年齢の目盛りは少なめ: 0・20歳ごと・最期
  const step = l.age > 60 ? 20 : 10;
  const ticks = [...Array.from({ length: Math.floor(l.age / step) + 1 }, (_, i) => i * step).filter((a) => l.age - a >= step / 2), l.age];
  g.fillStyle = SUB;
  g.font = `22px ${FONT}`;
  for (const a of ticks) { const s = String(a); g.fillText(s, Math.min(W - M - g.measureText(s).width, Math.max(M, px(a) - g.measureText(s).width / 2)), base0 + 34); }
  if (best !== undefined && best <= l.age) {
    g.fillStyle = INK;
    g.beginPath();
    g.arc(px(best), py(v[best]), 10, 0, Math.PI * 2);
    g.fill();
    g.font = `bold 26px ${FONT}`;
    const s = L(`いちばん幸せ・${best}歳`, `Happiest · age ${best}`);
    const sw = g.measureText(s).width;
    // 札は点の上。山頂が上の縁に近ければ、点の横 (右に入らなければ左) へ
    if (py(v[best]) - 46 >= gy) g.fillText(s, Math.min(W - M - sw, Math.max(M, px(best) - sw / 2)), py(v[best]) - 26);
    else g.fillText(s, px(best) + 20 + sw <= W - M ? px(best) + 20 : px(best) - 20 - sw, py(v[best]) + 10);
  }
  nameBlock(g, l, base0 + 110);
  foot(g, H, CLOSING);
  return cv;
}

// ---- 記録 (今までのカード)。9:16 は同じカードを縦の真ん中に置く ----
function recordCard(l: PastLife, story: boolean): HTMLCanvasElement {
  const card = shareCardOf(l);
  if (!story) return card;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = 1920;
  const g = cv.getContext('2d')!;
  g.fillStyle = BG;
  g.fillRect(0, 0, W, 1920);
  g.drawImage(card, 0, (1920 - card.height) / 2);
  return cv;
}

export function lifeCard(l: PastLife, kind: CardKind = l.card ?? pickCard(l), story = false): HTMLCanvasElement {
  if (kind === 'word' && !wordOf(l)) kind = pickCard(l);
  return { frames: framesCard, second: secondCard, word: wordCard, happy: happyCard, record: recordCard }[kind](l, story);
}
