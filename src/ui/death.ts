// 死亡記録: 一生のまとめ、数字、この人への一言、同じ1秒に生まれた人たちの結末。
import { byCode, type BirthBasis } from '../engine/countries';
import { formatMoney, monthlyYen, yen } from '../engine/economy';
import { netWorth } from '../engine/events/money';
import { lifeTable } from '../engine/lifetable';
import { EDU_LABEL, eduLevel, type Person } from '../engine/person';
import { lifeStory } from '../engine/summary';
import { drawCard, shareCard } from './cards';
import { paintScenes, sceneAttr, sceneOf, toData, type SceneData } from './pixel';
import { $, esc, load, pct, save } from './dom';

const MAX_PAST = 10;

export interface PastLife {
  seed: number; basis: BirthBasis; name: string; given: string; sex: Person['sex'];
  birthCountry: string; country: string; birthYear: number; age: number; cause: string;
  story: string; log: Person['log']; kinds: Person['kinds']; happyByAge: number[];
  questions: Person['questions']; facts: [string, string][]; others: { name: string; country: string; age: number; story: string }[];
  message?: string; date: string;
  scene?: SceneData;
}

export const pastLives = () => load<PastLife[]>('lives', []);

// 世界全体で見た所得の位置 (購買力平価ドル)。世界銀行の分布をおおまかに折れ線で近似
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
      ['生きた時間', p.age === 0 ? '1年に満たない' : `${p.age}年`],
      ['家族', `母 ${p.mother.name ?? ''}・父 ${p.father.name ?? ''}${sibs ? `・きょうだい${sibs}人` : ''}`],
      ['生まれた場所', `${p.city ?? '農村'}・${byCode(p.birthCountry).name}`],
    ];
  }
  const edu = eduLevel(p);
  return [
    ['最終学歴', `${EDU_LABEL[edu]}${p.school.major ? `・${p.school.major}` : ''}`],
    ['最後の仕事', p.job ? `${p.job}${p.retired ? '・引退' : ''}` : 'なし'],
    ['いちばん稼いだ年', p.peakIncome ? `${formatMoney(p.peakIncome)}・世界の所得の上位${Math.max(1, Math.round(worldIncomeTop(p.peakIncome) * 100))}%・日本の感覚で月${monthlyYen(p.peakIncome)}` : '—'],
    ['残した財産(日本の物価で)', p.age >= 18 ? yen(netWorth(p)) : '—'],
    ['子ども', p.children.length ? `${p.children.length}人` : 'なし'],
    ['暮らした国', p.countriesLived.map((c) => byCode(c).name).join(' → ')],
    ['自分で決めたこと', `${p.decisions}回`],
    ['好きだったこと', p.hobbies.join('・') || '—'],
  ];
}

function toPast(p: Person, others: Person[], basis: BirthBasis): PastLife {
  return {
    seed: p.seed, basis, name: p.name, given: p.given, sex: p.sex, birthCountry: p.birthCountry, country: p.country,
    birthYear: p.birthYear, age: p.age, cause: p.cause ?? '', story: lifeStory(p), log: p.log, kinds: p.kinds, happyByAge: p.happyByAge,
    questions: p.questions, facts: factsOf(p),
    others: others.map((o) => ({ name: o.name, country: o.birthCountry, age: o.age, story: lifeStory(o) })),
    date: new Date().toISOString(),
    scene: toData(sceneOf(p)),
  };
}

export function deathRecord(l: PastLife): string {
  const b = byCode(l.birthCountry);
  const e0 = l.sex === 'F' ? b.leF : b.leM;
  const outlive = 1 - lifeTable(b, l.sex).l[Math.min(110, l.age + 1)];
  const longer = lifeTable(b, l.sex).l[Math.min(110, l.age + 1)];
  const diff = l.age - e0;
  const real = load<string | null>('realCountry', null);
  const r = real ? byCode(real) : null;
  const rl = r ? lifeTable(r, l.sex).l[Math.min(110, l.age + 1)] : 0;
  const five = [{ name: l.name, country: l.birthCountry, age: l.age, story: '' }, ...l.others].sort((a, c) => a.age - c.age);
  const answers = l.questions.filter((q) => q.a);
  return `
  <article class="record">
    <header><span>死亡記録</span><span>No. ${l.birthCountry}-${l.birthYear}-${String(l.age).padStart(3, '0')}</span></header>
    ${l.scene ? `<canvas class="pixscene" data-scene="${sceneAttr(l.scene)}"></canvas>` : ''}
    <p class="kicker">${esc(b.name)}・${l.sex === 'F' ? '女性' : '男性'}</p>
    <h1>${esc(l.name)}</h1>
    <p class="kicker">${l.birthYear} – ${l.birthYear + l.age}・享年${l.age}歳</p>
    <p class="story">${esc(l.story)}</p>
    <div class="cause"><b>死因 ${esc(l.cause)}</b>
      <p>同じ年に${esc(b.name)}で生まれた${l.sex === 'F' ? '女の子' : '男の子'}のうち、約${pct(longer)}がこの人より長く生きる(${pct(outlive)}はこれより早く亡くなる)。${esc(b.name)}の${l.sex === 'F' ? '女性' : '男性'}の平均寿命${e0.toFixed(1)}歳より${Math.abs(diff).toFixed(1)}年${diff >= 0 ? '長く' : '短く'}生きた。</p></div>
    <dl class="kv facts">${l.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${r && r.code !== b.code ? `<p class="note">あなたの生まれた${esc(r.name)}では、同じ年に生まれた人の${pct(rl)}が${l.age}歳を越えて生きる。${esc(b.name)}では${pct(longer)}。</p>` : ''}
    ${answers.length ? `<h3>止まった時間に書いたこと</h3><ul class="answers">${answers.map((q) => `<li><small>${q.age}歳・${esc(q.q)}</small><br>${esc(q.a)}</li>`).join('')}</ul>` : ''}
    ${l.message ? `<p class="message">「${esc(l.message)}」</p>` : ''}
  </article>
  <section class="panel">
    <h3>同じ1秒に生まれた5人 <small>短く生きた順</small></h3>
    <ol class="five">${five.map((o) => `<li><span class="age">${o.age}歳</span><div><b>${esc(o.name)}</b>・${esc(byCode(o.country).name)}${o.story ? '' : '・この人生のあなた'}${o.story ? `<p class="note">${esc(o.story)}</p>` : ''}</div></li>`).join('')}</ol>
    <p class="note">同じ1秒に生まれた5人は、それぞれ${five.map((o) => o.age).join('歳、')}歳まで生きた。誰も、どこに生まれるかを選んでいない。</p>
  </section>`;
}

export function deathCard(l: PastLife): HTMLCanvasElement {
  const b = byCode(l.birthCountry);
  return drawCard({ kicker: `${b.name}・${l.birthYear}–${l.birthYear + l.age}`, title: `${l.name}、${l.age}歳`, lines: [l.story], foot: 'Unchosen — 生まれは、選べない', scene: l.scene });
}

export function showDeath(p: Person, others: Person[], basis: BirthBasis, onExit: () => void): void {
  const life = toPast(p, others, basis);
  const lives = [life, ...pastLives()].slice(0, MAX_PAST);
  save('lives', lives);
  const app = $('#app');
  app.innerHTML = `<main class="home wide">
    ${deathRecord(life)}
    <section class="panel">
      <h3>${esc(p.given)}に一言</h3>
      <textarea id="msg" maxlength="200" rows="2" placeholder="おつかれさま、など。記録カードと前世の記録に残る"></textarea>
      <label class="toggle"><input type="checkbox" id="share" checked> 「みんなの人生」と追悼館に残す(名前・連絡先は残らない)</label>
      <div class="choices">
        <button class="primary" data-d="done">見送る</button>
        <button data-d="card">記録カードを保存</button>
      </div>
    </section></main>`;
  window.scrollTo(0, 0);
  paintScenes(app);
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
      body: JSON.stringify({ rural: p.rural, name: l.name, country: l.birthCountry, sex: l.sex, age: l.age, cause: l.cause, line: l.story, message: l.message ?? '', birthYear: l.birthYear, job: p.job ?? '' }),
    });
  } catch {
    // 届かなくても、前世の記録には残っている
  }
}
