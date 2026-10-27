// この人生の手ざわり: 死亡記録と前世の記録に置く欄、共有カード、「手ざわりを決める」の画面
import { ADULT, degree, nameIndex, turned, type Texture, type Vec } from '../engine/texture';
import type { Person } from '../engine/person';
import { people } from '../engine/bonds';
import { byCode } from '../engine/countries';
import { jobName } from '../engine/jobs';
import { bornIn } from '../engine/polity';
import { FONT, SERIF, shareCard, wrap } from './cards';
import { esc, load, save } from './dom';
import { isEn, L } from '../i18n';
import type { PastLife } from './death';

// 組ごとに [-のことば, +のことば, 意味]
export const PAIRS: [[string, string], [string, string], [string, string]][] = [
  [['そば', 'Close'], ['仕事', 'Work'], ['家族や近しい人と過ごした時間か、働くことに注いだ時間か。', 'Time spent with family and the people close by, or time given to work.']],
  [['根', 'Roots'], ['風', 'Wind'], ['同じ土地・同じ仕事にとどまったか、暮らしや仕事を移していったか。', 'Staying in one place and one line of work, or moving home and work along.']],
  [['凪', 'Calm'], ['波', 'Waves'], ['穏やかな年が続いたか、苦しい時期・病・別れ・転機の多い年月だったか。', 'Mostly quiet years, or years full of hardship, illness, loss and upheaval.']],
  [['今日', 'Today'], ['明日', 'Tomorrow'], ['その日その日を味わうことに使ったか、学びや蓄えなど先のために積み上げたか。', 'Savoring each day as it came, or building for later through study and savings.']],
];
const w = (k: number, side: 0 | 1) => L(...PAIRS[k][side]);
const word = (k: number, z: number) => w(k, z > 0 ? 1 : 0);

// 16の名前。番号は組ごとに + (仕事・風・波・明日) なら 1 << 組
export const NAMES: [string, string][] = [
  ['縁側', 'The Porch'], ['工房', 'The Workshop'], ['渡り鳥', 'Migrating Birds'], ['行商', 'The Peddler’s Road'],
  ['囲炉裏', 'The Hearth'], ['灯台', 'The Lighthouse'], ['焚き火', 'The Campfire'], ['野分', 'The Gale'],
  ['苗床', 'The Seedbed'], ['年輪', 'Tree Rings'], ['綿毛', 'Dandelion Seeds'], ['航路', 'The Sea Lane'],
  ['石垣', 'The Stone Wall'], ['防波堤', 'The Breakwater'], ['小舟', 'The Little Boat'], ['開拓', 'The Frontier'],
];
export const texName = (z: Vec): string | undefined => { const i = nameIndex(z); return i === undefined ? undefined : L(...NAMES[i]); };
// 前世の記録で名前を出す (追われた人生と、二組以上が半々の人生は undefined)
export const lifeTexName = (t?: Texture): string | undefined => (t && !t.displaced ? texName(t.z) : undefined);

export function degreeWord(k: number, z: number): string {
  const d = degree(z);
  if (!d) return L('半々', 'Even');
  return Math.abs(d) === 2 ? L(`大きく${word(k, z)}`, `Strongly ${word(k, z)}`) : L(`少し${word(k, z)}`, `Slightly ${word(k, z)}`);
}
const picture = (z: Vec) => z.map((v, k) => word(k, v)).join(L('・', ' · '));

// ---- その人生の記録から一、二文 (亡くなった時に作り、前世の記録に残す) ----
const listJa = (xs: string[]) => xs.join('と');
const listEn = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
function phrase(p: Person, k: number, plus: boolean, calmToo = false): string {
  const kids = p.children.map((c) => c.name).filter((n): n is string => !!n).slice(0, 2);
  const spouse = p.spouse?.name;
  const country = byCode(p.country).name;
  const lived = p.countriesLived.map((c) => byCode(c).name);
  const adultHard = p.kinds.slice(ADULT).filter((x) => x === 'hard' || x === 'ill' || x === 'loss').length;
  const gone = people(p).find((t) => !t.alive && t.diedAt !== undefined && t.diedAt >= ADULT && t.name && ['spouse', 'child', 'mother', 'father', 'sibling', 'friend'].includes(t.role));
  const hobby = p.hobbies[0];
  if (k === 0 && !plus) {
    const names = [...(spouse ? [spouse] : []), ...kids];
    const first = p.children[0]?.alive ? p.birthYear + Math.max(0, p.age - p.children[0].age) : undefined;
    return names.length
      ? L(`${listJa(names)}のそばで過ごした時間が、この人生のいちばん大きなところを占めた${first && kids[0] ? `。${kids[0]}が生まれた${first}年から、それは続いた` : ''}。`, `Time beside ${listEn(names)} filled the largest part of this life${first && kids[0] ? `, from the year ${kids[0]} was born in ${first}` : ''}.`)
      : L('仕事より、近しい人と過ごす時間のほうが長く残った。', 'More of the years went to the people close by than to work.');
  }
  const job = p.job && jobName(p.job.replace('(リーダー)', ''));
  if (k === 0) return job
    ? L(`${job}として${p.jobYears}年。働く時間が、この人生の多くを占めた。`, `${p.jobYears} years as ${job}. Work took up much of this life.`)
    : L('働くことに、多くの年を注いだ。', 'Many of the years were given to work.');
  if (k === 1 && !plus) return lived.length === 1
    ? L(`${p.city ? `${p.city}のある${country}` : `${country}の村`}を、一度も離れなかった。`, `Never left ${country}; ${p.city ?? 'the village'} stayed home.`)
    : L(`最後は${country}に根を下ろし、そこを離れなかった。`, `In the end put down roots in ${country} and stayed.`);
  if (k === 1) return lived.length > 1
    ? L(`${lived.join('から')}へと、暮らす場所を移していった。`, `Moved on from ${listEn(lived.slice(0, -1))} to ${lived[lived.length - 1]}.`)
    : L('同じ国の中で、仕事や暮らしの形を何度も変えた。', 'Within one country, work and home changed shape again and again.');
  if (k === 2 && !plus) return hobby
    ? L(`大きな嵐は少なく、${hobby}に向かう静かな年が多かった。`, `Few great storms; many quiet years, with ${hobby} in them.`)
    : L('大きな嵐の少ない年月が続いた。', 'The years ran on without many great storms.');
  if (k === 2 && !adultHard) return L('転機の多い、揺れの大きな年月だった。', 'The years were full of turns and upheaval.');
  if (k === 2) return gone
    ? L(`${gone.name}を見送った年を含め、${adultHard}年の苦しい時期をくぐり抜けた。`, `Came through ${adultHard} hard ${adultHard === 1 ? 'year' : 'years'}, including the year ${gone.name} died.`)
    : L(`大人になってから、${adultHard}年の苦しい時期をくぐり抜けた。`, `Came through ${adultHard} hard ${adultHard === 1 ? 'year' : 'years'} as an adult.`);
  const daily = calmToo ? p.hobbies[1] : hobby; // 凪にも趣味を出したら、二つ目の趣味だけ
  if (!plus) return daily
    ? L(`${daily}など、その日その日を味わうことに時間を使った。`, `Time went to savoring each day, ${daily} among it.`)
    : L('先のことより、その日その日を生きた。', 'Lived day by day more than for later.');
  const built = [p.school.uni === 'done' && L('大学で学び', 'a degree'), (p.house || p.mortgage) && L('家を持ち', 'a home'), p.invest && L('お金を育て', 'savings put to work'), p.business && L('自分の店を開き', 'a business of their own')].filter((x): x is string => !!x);
  return built.length
    ? L(`${built.join('、')}、先の日々のために積み上げた。`, `Built for the years ahead: ${listEn(built)}.`)
    : L('今日より、先の日々のために積み上げることを選んだ。', 'Chose to build for the years ahead over the day at hand.');
}

export function texLine(p: Person, t: Texture): string {
  const top = [0, 1, 2, 3].filter((k) => degree(t.z[k])).sort((a, b) => Math.abs(t.z[b]) - Math.abs(t.z[a])).slice(0, 2);
  const turn = turned(t)[0];
  const lines = top.map((k) => phrase(p, k, t.z[k] > 0, k === 3 && top.includes(2) && t.z[2] < 0));
  if (turn !== undefined) lines.push(L(`若いころは${word(turn, t.early![turn])}に、年を重ねてからは${word(turn, t.late![turn])}に傾いた。`, `Early on it leaned toward ${word(turn, t.early![turn])}; later, toward ${word(turn, t.late![turn])}.`));
  return lines.join(isEn ? ' ' : '');
}

// ---- 死亡記録の欄 ----
const bar = (z: number) => `<span class="texbar"><i style="left:${(50 + Math.max(-1, Math.min(1, z / 2.4)) * 46).toFixed(1)}%"></i></span>`;
const rows = (z: Vec) => `<ol class="texrows">${z.map((v, k) => `<li><span>${esc(w(k, 0))}</span>${bar(v)}<span>${esc(w(k, 1))}</span><small>${esc(degreeWord(k, v))}</small></li>`).join('')}</ol>`;
export const pairsHelp = (open = false) => `<details class="texhelp"${open ? ' open' : ''}><summary>${L('四つの組の意味', 'What the four pairs mean')}</summary><dl class="kv">${PAIRS.map(([a, b, m]) => `<dt>${esc(L(...a))}${L('・', ' / ')}${esc(L(...b))}</dt><dd>${esc(L(...m))}</dd>`).join('')}</dl></details>`;
export const TEX_WHAT = L('手ざわりは、大人になってから実際に過ごした時間が、四つの組のどちらへどれほど傾いたか。どちらの人生がよいということはない。', 'Texture is how the time actually lived as an adult leaned within four pairs. Neither side is better.');

export function textureHtml(l: PastLife): string {
  const t = l.tex;
  if (!t || l.age < ADULT) return '';
  const name = lifeTexName(t);
  const turn = turned(t)[0];
  return `<section class="panel texture"><h3>${L('この人生の手ざわり', 'The texture of this life')}</h3>
    <p class="note">${esc(TEX_WHAT)}</p>
    <p class="texname">${name ? `<b>${esc(name)}</b> <small>${L('いちばん近い名前', 'the nearest name')}</small>` : `<small>${t.displaced ? L('追われて故郷を離れた人生には、名前をつけない。', 'A life forced from home is not given a name.') : L('二組以上が半々なので、ひとつの名前にまとめない。', 'Two or more pairs are even, so no single name fits.')}</small>`}</p>
    <p class="texpic">${esc(picture(t.z))}</p>
    ${rows(t.z)}
    ${turn !== undefined ? `<p class="note">${L(`年を重ねて、${esc(w(turn, 0))}・${esc(w(turn, 1))}の傾きが入れかわった。`, `With age, the lean between ${esc(w(turn, 0))} and ${esc(w(turn, 1))} turned around.`)}</p>` : ''}
    ${l.texLine ? `<p class="texline">${esc(l.texLine)}</p>` : ''}
    ${t.want ? `<div class="texwant"><small>${L('決めておいた手ざわり', 'The texture you chose')}: ${esc(texName(t.want) ?? L('名前なし', 'no name'))}</small>${rows(t.want)}</div>` : ''}
    ${pairsHelp()}
    <div class="choices"><button data-tex="45">${L('この手ざわりをシェア (4:5)', 'Share this texture (4:5)')}</button><button data-tex="916">${L('ストーリー (9:16)', 'Story (9:16)')}</button></div>
  </section>`;
}

export function mountTexture(root: HTMLElement, l: PastLife): void {
  root.querySelector('.texture')?.addEventListener('click', (e) => {
    const r = (e.target as HTMLElement).closest<HTMLElement>('[data-tex]')?.dataset.tex;
    if (r) void shareCard(textureCard(l, r === '916'), `unchosen-texture-${l.birthCountry}-${l.birthYear}.png`);
  });
}

// ---- 共有カード: 4つの言葉の絵・名前・度合い・国と年齢 ----
export function textureCard(l: PastLife, story = false): HTMLCanvasElement {
  const t = l.tex!;
  const W = 1080, H = story ? 1920 : 1350;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#11141d';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#e9a64c';
  g.fillRect(0, 0, W, 84);
  g.fillStyle = '#1a1408';
  g.font = `bold 34px ${FONT}`;
  g.fillText('UNCHOSEN', 48, 55);
  g.font = `24px ${FONT}`;
  const head = L('この人生の手ざわり', 'The texture of a life');
  g.fillText(head, W - 48 - g.measureText(head).width, 53);
  // 9:16 は同じ並びを縦の真ん中へ寄せる
  let y = 196 + (story ? 285 : 0);
  const name = lifeTexName(t);
  g.fillStyle = '#ebe5d8';
  const title = name ?? L('名前のない手ざわり', 'A texture without a name');
  let fs = 88;
  do g.font = `bold ${fs}px ${SERIF}`; while (g.measureText(title).width > W - 96 && (fs -= 4) > 40);
  g.fillText(title, (W - g.measureText(title).width) / 2, y);
  // 4つの言葉の絵: 2×2 のます。傾きが強いほど明るい
  const cell = 260, gap = 20, gx = (W - cell * 2 - gap) / 2;
  y += 54;
  t.z.forEach((v, k) => {
    const x = gx + (k % 2) * (cell + gap), yy = y + Math.floor(k / 2) * (cell + gap);
    const a = [0.12, 0.28, 0.5][Math.abs(degree(v))];
    g.fillStyle = `rgba(233,166,76,${a})`;
    g.fillRect(x, yy, cell, cell);
    g.fillStyle = '#ebe5d8';
    g.font = `bold ${isEn ? 56 : 100}px ${SERIF}`;
    const s = word(k, v);
    g.fillText(s, x + (cell - g.measureText(s).width) / 2, yy + cell / 2 + (isEn ? 22 : 38));
    g.fillStyle = '#a7a193';
    g.font = `24px ${FONT}`;
    const d = degreeWord(k, v);
    g.fillText(d, x + (cell - g.measureText(d).width) / 2, yy + cell - 26);
  });
  y += cell * 2 + gap + 70;
  // 組ごとの帯
  t.z.forEach((v, k) => {
    const yy = y + k * 56;
    g.fillStyle = '#a7a193';
    g.font = `26px ${FONT}`;
    const a = w(k, 0), b = w(k, 1);
    g.fillText(a, 230 - g.measureText(a).width, yy);
    g.fillText(b, W - 230, yy);
    g.fillStyle = '#2d3446';
    g.fillRect(260, yy - 10, W - 520, 4);
    g.fillStyle = '#e9a64c';
    const px = 260 + (W - 520) * (0.5 + Math.max(-1, Math.min(1, v / 2.4)) * 0.46);
    g.beginPath();
    g.arc(px, yy - 8, 12, 0, Math.PI * 2);
    g.fill();
  });
  y += 4 * 56 + 30;
  g.fillStyle = '#ebe5d8';
  g.font = `bold 44px ${SERIF}`;
  wrap(g, l.name, 48, y, W - 96, 52, 1);
  g.fillStyle = '#a7a193';
  g.font = `28px ${FONT}`;
  wrap(g, L(`${bornIn(l.birthCountry, l.birthYear, l.birthSide)}・${l.birthYear}–${l.birthYear + l.age}・${l.age}歳まで`, `${bornIn(l.birthCountry, l.birthYear, l.birthSide)} · ${l.birthYear}–${l.birthYear + l.age} · lived to ${l.age}`), 48, y + 48, W - 96, 36, 1);
  g.fillStyle = '#ebe5d8';
  g.font = `bold 30px ${SERIF}`;
  wrap(g, L('手ざわりは選ぶものではなく、生まれた人生が決める。', 'No one chooses the texture. The life they were born into does.'), 48, H - 76, W - 96, 38, 1);
  g.fillStyle = '#a7a193';
  g.font = `22px ${FONT}`;
  g.fillText(`${location.host}  #Unchosen`, 48, H - 34);
  return cv;
}

// ---- 手ざわりを決める (3つ以上の人生を生きたあと) ----
export const TEX_UNLOCK = 3;
export const wantTexture = (): Vec | undefined => { const v = load<Vec | null>('texWant', null); return v && v.some((x) => x) ? v : undefined; };

export function textureSettings(app: HTMLElement, back: () => void): void {
  let want: Vec = wantTexture() ?? [0, 0, 0, 0];
  const draw = () => {
    const name = texName(want);
    app.innerHTML = `<main class="home"><h1>${L('手ざわりを決める', 'Choose a texture')}</h1>
      <p class="note">${esc(TEX_WHAT)}</p>
      <p>${L('おまかせで決めるとき、どちらの手ざわりのほうへ選ぶかを組ごとに傾けられる。どこでどんな暮らしに生まれたかや、そばにいる人たちも一緒に決めるので、人生がそのとおりになるわけではない。', 'When decisions are left to auto, you can tilt each pair toward one side. Where and into what you are born, and the people around you, still decide most of it, so the life will not simply follow.')}</p>
      ${pairsHelp(true)}
      <ol class="texset">${PAIRS.map((_, k) => `<li><div class="seg">${[-2, -1, 0, 1, 2].map((v) => `<button data-k="${k}" data-v="${v}" class="${want[k] === v ? 'on' : ''}">${v === 0 ? L('決めない', 'Either') : `${Math.abs(v) === 2 ? L('大きく', 'Strongly ') : L('少し', 'Slightly ')}${esc(w(k, v < 0 ? 0 : 1))}`}</button>`).join('')}</div></li>`).join('')}</ol>
      <p class="texname">${name ? `${L('いちばん近い名前', 'Nearest name')}: <b>${esc(name)}</b>` : `<small>${L('二組以上が「決めない」なので、まだ名前にならない。', 'Two or more pairs are left open, so there is no name yet.')}</small>`}</p>
      <p class="note">${L('人生が終わると、決めておいた手ざわりが「この人生の手ざわり」の下に一緒に出る。', 'When a life ends, the texture you chose is shown under the one it actually had.')}</p>
      <div class="choices"><button class="primary" data-go="home">${L('戻る', 'Back')}</button></div></main>`;
  };
  draw();
  app.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-k]');
    if (b) { want = want.map((x, k) => (k === Number(b.dataset.k) ? Number(b.dataset.v) : x)) as Vec; save('texWant', want.some((x) => x) ? want : null); draw(); return; }
    if ((e.target as HTMLElement).closest('[data-go=home]')) back();
  };
}
