// 死亡記録: 一生のまとめ、数字、この人への一言、同じ1秒に生まれた人たちの結末。
import { ERA_NOW, byCode, countriesAt, countryAt, type BirthBasis } from '../engine/countries';
import { formatMoney, monthlyYen, yen } from '../engine/economy';
import { netWorth } from '../engine/events/money';
import { bornTable } from '../engine/lifetable';
import { EDU_LABEL, eduLevel, type Person, type Tie, genderOf, genderWord } from '../engine/person';
import { lifeStory } from '../engine/summary';
import { drawCard, shareCard } from './cards';
import { paintScenes, sceneAttr, sceneOf, toData, type SceneData } from './pixel';
import { lastWords, lastWordsAi, lifeStoryAi, type LastWord } from '../ai/director';
import { aiOn } from '../ai/settings';
import { $, esc, load, pct, save } from './dom';
import { isEn, L, lang } from '../i18n';
import { jobName, majorName } from '../engine/jobs';
import { causeName } from '../engine/causes';
import { people } from '../engine/bonds';
import { lastWordsHtml, mountRing, paintFaces, personCard } from './ring';

const MAX_PAST = 10;

export interface PastLife {
  seed: number; basis: BirthBasis; name: string; given: string; sex: Person['sex']; gender?: 'X';
  birthCountry: string; country: string; birthYear: number; age: number; cause: string;
  story: string; log: Person['log']; kinds: Person['kinds']; happyByAge: number[];
  questions: Person['questions']; facts: [string, string][]; others: { name: string; country: string; age: number; story: string }[];
  message?: string; date: string;
  scene?: SceneData;
  aiStory?: { title: string; story: string };
  words?: LastWord[];          // 最後にそばにいた人の言葉
  circle?: CircleTie[];        // 人の輪の要約 (顔と輪を描くだけの分。mem は持たない)
  religion?: string;           // 顔を描くのに使う
  spouse?: { id: number; sex: Person['sex'] };
}

export type CircleTie = Pick<Tie, 'id' | 'name' | 'role' | 'sex' | 'age' | 'alive' | 'bond' | 'diedAt' | 'since' | 'until'>;
const toCircle = (p: Person): CircleTie[] =>
  people(p).map(({ id, name, role, sex, age, alive, bond, diedAt, since, until }) => ({ id, name, role, sex, age, alive, bond, diedAt, since, until }));

// 前世の記録から顔を描くための、主人公の代わり。lookOfMe / lookOfRel と人の輪が読む欄だけを持つ
function standIn(l: PastLife): Person {
  return { seed: l.seed, given: l.given, sex: l.sex, gender: l.gender, age: l.age, alive: false, birthCountry: l.birthCountry, country: l.country, religion: l.religion ?? '', spouse: l.spouse } as unknown as Person;
}

export const pastLives = () => load<PastLife[]>('lives', []);

// 世界全体で見た所得の位置 (購買力平価ドル)。世界銀行の分布 (今の時代) をおおまかに折れ線で近似。
// ほかの年は、世界の1人当たりGDP (人口加重) の比で今の時代に直してから当てる
const worldGdp = (year: number) => { const list = countriesAt(year); return list.reduce((s, c) => s + c.gdp * c.pop, 0) / list.reduce((s, c) => s + c.pop, 0); };
const worldIncomeTopAt = (ppp: number, year: number) => worldIncomeTop(ppp * worldGdp(ERA_NOW) / worldGdp(year));
function worldIncomeTop(ppp: number): number {
  const pts: [number, number][] = [[500, 0.95], [1500, 0.8], [3000, 0.6], [6000, 0.4], [12000, 0.22], [25000, 0.1], [45000, 0.04], [80000, 0.01]];
  if (ppp <= pts[0][0]) return 0.97;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (ppp <= x1) return y0 + ((y1 - y0) * (Math.log(ppp) - Math.log(x0))) / (Math.log(x1) - Math.log(x0));
  }
  return 0.005;
}

function factsOf(p: Person): [string, string][] {
  // 幼くして亡くなった子に、学歴や仕事の欄は似合わない
  if (p.age < 6) {
    const sibs = p.siblings.filter((s) => s.age >= 0).length;
    return [
      [L('生きた時間', 'Lived'), p.age === 0 ? L('1年に満たない', 'Less than a year') : L(`${p.age}年`, `${p.age} ${p.age === 1 ? 'year' : 'years'}`)],
      [L('家族', 'Family'), isEn
        ? `Mother ${p.mother.name ?? ''}, father ${p.father.name ?? ''}${sibs ? `, ${sibs} ${sibs === 1 ? 'sibling' : 'siblings'}` : ''}`
        : `母 ${p.mother.name ?? ''}・父 ${p.father.name ?? ''}${sibs ? `・きょうだい${sibs}人` : ''}`],
      [L('生まれた場所', 'Born in'), `${p.city ?? L('農村', 'a rural area')}${L('・', ', ')}${byCode(p.birthCountry).name}`],
    ];
  }
  const edu = eduLevel(p);
  return [
    [L('最終学歴', 'Education'), `${EDU_LABEL[edu]}${p.school.major ? `${L('・', ', ')}${majorName(p.school.major)}` : ''}`],
    [L('最後の仕事', 'Last job'), p.job ? `${jobName(p.job)}${p.retired ? L('・引退', ', retired') : ''}` : L('なし', 'None')],
    [L('いちばん稼いだ年', 'Best year'), p.peakIncome ? (isEn
      ? `${formatMoney(p.peakIncome)}, top ${Math.max(1, Math.round(worldIncomeTopAt(p.peakIncome, p.peakYear ?? ERA_NOW) * 100))}% of world incomes in ${p.peakYear ?? ERA_NOW}`
      : `${formatMoney(p.peakIncome)}・${p.peakYear ?? ERA_NOW}年の世界の所得の上位${Math.max(1, Math.round(worldIncomeTopAt(p.peakIncome, p.peakYear ?? ERA_NOW) * 100))}%・日本の感覚で月${monthlyYen(p.peakIncome)}`) : '—'],
    [L('残した財産(日本の物価で)', 'Net worth left'), p.age >= 18 ? yen(netWorth(p)) : '—'],
    [L('子ども', 'Children'), p.children.length ? L(`${p.children.length}人`, `${p.children.length}`) : L('なし', 'None')],
    [L('暮らした国', 'Countries'), p.countriesLived.map((c) => byCode(c).name).join(' → ')],
    [L('自分で決めたこと', 'Own decisions'), L(`${p.decisions}回`, `${p.decisions}`)],
    [L('好きだったこと', 'Liked'), p.hobbies.join(L('・', ', ')) || '—'],
  ];
}

function toPast(p: Person, others: Person[], basis: BirthBasis): PastLife {
  return {
    seed: p.seed, basis, name: p.name, given: p.given, sex: p.sex, ...(p.gender ? { gender: p.gender } : {}), birthCountry: p.birthCountry, country: p.country,
    birthYear: p.birthYear, age: p.age, cause: p.cause ?? '', story: lifeStory(p), log: p.log, kinds: p.kinds, happyByAge: p.happyByAge,
    questions: p.questions, facts: factsOf(p),
    others: others.map((o) => ({ name: o.name, country: o.birthCountry, age: o.age, story: lifeStory(o) })),
    date: new Date().toISOString(),
    scene: toData(sceneOf(p)),
    words: lastWords(p),
    circle: toCircle(p),
    religion: p.religion,
    spouse: p.spouse?.id !== undefined ? { id: p.spouse.id, sex: p.spouse.sex } : undefined,
  };
}

export function deathRecord(l: PastLife): string {
  // 同じ年・同じ国に生まれた人たち (その後の各暦年の死亡率で生きた場合) と比べる。
  // 生まれた年の平均寿命 (その1年の死亡率から出す値) は、飢饉の年などに極端に短くなるので使わない
  const b = countryAt(l.birthCountry, l.birthYear);
  const born = bornTable(b, l.sex, l.birthYear);
  const e0 = born.e0;
  const longer = born.l[Math.min(110, l.age + 1)];
  const outlive = 1 - longer;
  const diff = l.age - e0;
  const real = load<string | null>('realCountry', null);
  const r = real ? countryAt(real, l.birthYear) : null;
  const rl = r ? bornTable(r, l.sex, l.birthYear).l[Math.min(110, l.age + 1)] : 0;
  const five = [{ name: l.name, country: l.birthCountry, age: l.age, story: '' }, ...l.others].sort((a, c) => a.age - c.age);
  const answers = l.questions.filter((q) => q.a);
  return `
  <article class="record">
    <header><span>${L('死亡記録', 'Death record')}</span><span>No. ${l.birthCountry}-${l.birthYear}-${String(l.age).padStart(3, '0')}</span></header>
    ${l.scene ? `<canvas class="pixscene" data-scene="${sceneAttr(l.scene)}"></canvas>` : ''}
    <p class="kicker">${esc(b.name)}${L('・', ' · ')}${genderWord(genderOf(l))}</p>
    <h1>${esc(l.name)}</h1>
    <p class="kicker">${l.birthYear} – ${l.birthYear + l.age}${L(`・享年${l.age}歳`, ` · died at ${l.age}`)}</p>
    <p class="story">${esc(l.story)}</p>
    <section id="aistory">${l.aiStory ? aiStoryHtml(l.aiStory) : ''}</section>
    <div class="cause"><b>${L('死因', 'Cause of death:')} ${esc(causeName(l.cause ?? ''))}</b>
      <p>${isEn
        ? `Of the ${l.gender === 'X' ? 'children' : l.sex === 'F' ? 'girls' : 'boys'} born in ${esc(b.name)} that year, about ${pct(longer)} live longer than this (${pct(outlive)} die sooner). On average they live to ${e0.toFixed(1)}; ${l.sex === 'F' ? 'she' : 'he'} lived ${Math.abs(diff).toFixed(1)} years ${diff >= 0 ? 'longer' : 'less'}.`
        : `同じ年に${esc(b.name)}で生まれた${l.gender === 'X' ? '子ども' : l.sex === 'F' ? '女の子' : '男の子'}のうち、約${pct(longer)}がこの人より長く生きる(${pct(outlive)}はこれより早く亡くなる)。その平均${e0.toFixed(1)}歳より${Math.abs(diff).toFixed(1)}年${diff >= 0 ? '長く' : '短く'}生きた。`}</p></div>
    <dl class="kv facts">${l.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${r && r.code !== b.code ? `<p class="note">${L(`あなたの生まれた${esc(r.name)}では、同じ年に生まれた人の${pct(rl)}が${l.age}歳を越えて生きる。${esc(b.name)}では${pct(longer)}。`, `In ${esc(r.name)}, where you were born, ${pct(rl)} of people born that year live past ${l.age}. In ${esc(b.name)}, ${pct(longer)}.`)}</p>` : ''}
    ${answers.length ? `<h3>${L('止まった時間に書いたこと', 'Written when time stopped')}</h3><ul class="answers">${answers.map((q) => `<li><small>${L(`${q.age}歳・`, `Age ${q.age} · `)}${esc(q.q)}</small><br>${esc(q.a)}</li>`).join('')}</ul>` : ''}
    ${l.message ? `<p class="message">${L(`「${esc(l.message)}」`, `"${esc(l.message)}"`)}</p>` : ''}
  </article>
  ${l.circle ? `<section class="panel">
    <h3>${L('最後にそばにいた人', 'Who was there at the end')}</h3>
    <div class="lastwords">${lastWordsHtml(standIn(l), l.circle as Tie[], l.words ?? [])}</div>
  </section>
  <section class="panel">
    <h3>${L('一生の輪', 'The whole circle')} <small>${L(`出会った${l.circle.length}人`, `${l.circle.length} people in one life`)}</small></h3>
    <div class="finalring"></div>
  </section>` : ''}
  <section class="panel">
    <h3>${L('同じ1秒に生まれた5人', 'Five born in the same second')} <small>${L('短く生きた順', 'shortest life first')}</small></h3>
    <ol class="five">${five.map((o) => `<li><span class="age">${L(`${o.age}歳`, `${o.age}`)}</span><div><b>${esc(o.name)}</b>${L('・', ' · ')}${esc(byCode(o.country).name)}${o.story ? '' : L('・この人生のあなた', ' · you, this life')}${o.story ? `<p class="note">${esc(o.story)}</p>` : ''}</div></li>`).join('')}</ol>
    <p class="note">${L(`同じ1秒に生まれた5人は、それぞれ${five.map((o) => o.age).join('歳、')}歳まで生きた。誰も、どこに生まれるかを選んでいない。`, `The five born in the same second lived to ${five.map((o) => o.age).join(', ')}. None of them chose where to be born.`)}</p>
  </section>`;
}

// deathRecord を置いたあとに呼ぶ: 場面・顔・輪を描く。
// 亡くなった直後で本人 (p) がいれば、輪の顔を押してその人の一生を読める
export function paintLife(root: HTMLElement, l: PastLife, p?: Person): void {
  paintScenes(root);
  if (!l.circle) return;
  const me = standIn(l);
  const ties = l.circle as Tie[];
  root.querySelectorAll<HTMLElement>('.lastwords').forEach((el) => paintFaces(el, me, ties));
  const ring = root.querySelector<HTMLElement>('.finalring');
  if (!ring) return;
  if (!p) return mountRing(ring, me, undefined, false, ties);
  ring.insertAdjacentHTML('afterend', `<p class="note">${L('顔を押すと、その人の一生が読める。', 'Tap a face to read that person\'s whole life.')}</p><div class="deathkin" id="deathkin"></div>`);
  const box = root.querySelector<HTMLElement>('#deathkin')!;
  let open = true;
  const show = (id?: number) => {
    mountRing(ring, p, id, true);
    box.innerHTML = id === undefined ? '' : personCard(p, id, open);
    box.dataset.sel = id === undefined ? '' : String(id);
    paintFaces(box, p);
  };
  show();
  ring.parentElement!.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (a?.dataset.act === 'person') show(a.dataset.v ? Number(a.dataset.v) : undefined);
    else if (a?.dataset.act === 'kinlife') { open = !open; show(Number(box.dataset.sel)); }
  });
}

const aiStoryHtml = (s: { title: string; story: string }) =>
  `<div class="aistory"><h3><i class="aitag">AI</i>${esc(s.title || L('この人の物語', 'This life'))}</h3>${s.story.split(/\n\n+/).map((t) => `<p>${esc(t)}</p>`).join('')}</div>`;

export function deathCard(l: PastLife): HTMLCanvasElement {
  const b = byCode(l.birthCountry);
  return drawCard({ kicker: `${b.name}${L('・', ' · ')}${l.birthYear}–${l.birthYear + l.age}`, title: L(`${l.name}、${l.age}歳`, `${l.name}, ${l.age}`), lines: [l.story], foot: L('Unchosen — 生まれは、選べない', 'Unchosen. No one chooses where they are born.'), scene: l.scene });
}

export function showDeath(p: Person, others: Person[], basis: BirthBasis, onExit: () => void): void {
  const life = toPast(p, others, basis);
  const lives = [life, ...pastLives()].slice(0, MAX_PAST);
  save('lives', lives);
  const app = $('#app');
  app.innerHTML = `<main class="home wide">
    ${deathRecord(life)}
    <section class="panel">
      <h3>${L(`${esc(p.given)}に一言`, `A word for ${esc(p.given)}`)}</h3>
      <textarea id="msg" maxlength="200" rows="2" placeholder="${L('おつかれさま、など。記録カードと前世の記録に残る', 'Rest well, or anything. Kept on the card and in past lives')}"></textarea>
      <label class="toggle"><input type="checkbox" id="share" checked> ${L('「みんなの人生」と追悼館に残す(名前・連絡先は残らない)', 'Add to "All lives" and the memorial (no name or contact kept)')}</label>
      <div class="choices">
        <button class="primary" data-d="done">${L('見送る', 'Say goodbye')}</button>
        <button data-d="card">${L('記録カードを保存', 'Save card')}</button>
      </div>
    </section></main>`;
  window.scrollTo(0, 0);
  paintLife(app, life, p);
  if (aiOn('story') && life.words?.length) {
    const box = app.querySelector<HTMLElement>('.lastwords')!;
    void lastWordsAi(p).then((words) => {
      if (!document.body.contains(box) || !words.some((w) => w.ai)) return;
      life.words = words;
      save('lives', [life, ...pastLives().slice(1)]);
      box.innerHTML = lastWordsHtml(standIn(life), life.circle as Tie[], words);
      paintFaces(box, standIn(life), life.circle as Tie[]);
    });
  }
  if (aiOn('story')) {
    const box = $('#aistory');
    box.innerHTML = `<p class="note"><i class="aitag">AI</i>${L('この人の一生を物語にしている…', 'Writing this life as a story…')}</p>`;
    void lifeStoryAi(p).then((s) => {
      if (!document.body.contains(box)) return;
      if (!s) { box.innerHTML = `<p class="note">${L('物語を書けなかった(AIの設定を確かめてください)。', 'Could not write the story (check the AI settings).')}</p>`; return; }
      life.aiStory = s;
      save('lives', [life, ...pastLives().slice(1)]);
      box.innerHTML = aiStoryHtml(s);
    });
  }
  app.onclick = async (e) => {
    const d = (e.target as HTMLElement).closest<HTMLElement>('[data-d]')?.dataset.d;
    if (!d) return;
    const message = $<HTMLTextAreaElement>('#msg').value.trim();
    if (message) { life.message = message; save('lives', [life, ...lives.slice(1)]); }
    if (d === 'card') { await shareCard(deathCard(life), 'life.png'); return; }
    if ($<HTMLInputElement>('#share').checked) await postMemorial(life, p);
    onExit();
  };
}

async function postMemorial(l: PastLife, p: Person): Promise<void> {
  try {
    await fetch('/api/memorial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rural: p.rural, name: l.name, country: l.birthCountry, sex: l.gender ?? l.sex, age: l.age, cause: l.cause, line: l.story, message: l.message ?? '', birthYear: l.birthYear, job: p.job ?? '', lang }),
    });
  } catch {
    // 届かなくても、前世の記録には残っている
  }
}
