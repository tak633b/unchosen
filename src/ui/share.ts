// 終わった人生を SNS に出す: 縦長カード・ひとことの感想・用意した文・3つのボタン・この人生へのリンク (/s/<id>)。
// リンクは押したときに初めて作る (/api/share)。作れなくても、画像と文はそのまま出せる
import type { PastLife } from './death';
import type { Person } from '../engine/person';
import { EDU_LABEL } from '../engine/person';
import { byCode, countryAt } from '../engine/countries';
import { incomeAt } from '../engine/economy';
import { homeWord } from '../engine/life';
import { jobName } from '../engine/jobs';
import { causeName } from '../engine/causes';
import { worldIncomeTopAt } from './worldrank';
import { lifeMapCells } from './lifemap';
import { download, drawShareCard, toPng } from './cards';
import { bornIn } from '../engine/polity';
import { lifeTexName } from './texture';
import { ageSpread, cardKinds, cardLabel, lifeCard, pickCard, setCard, SPREAD_BIG, type CardKind } from './sharecards';
import { isEn, L, lang } from '../i18n';

export const TAGS = L('#Unchosen #生まれは選べない', '#Unchosen');
const SEP = L('・', ', ');

// 生まれた家の1人あたり所得 (購買力平価) を、生まれた年の世界の人と比べる。
// 返すのは「この家より所得の低い暮らしをしていた人」の割合 (1–99)。生まれの記録が無い古い人生は undefined
export function poorerShare(l: Pick<PastLife, 'birthCountry' | 'birthYear' | 'me'>): number | undefined {
  if (l.me?.familyP === undefined) return undefined;
  const top = worldIncomeTopAt(incomeAt(countryAt(l.birthCountry, l.birthYear), l.me.familyP), l.birthYear);
  return Math.min(99, Math.max(1, Math.round((1 - top) * 100)));
}

// いちばん幸せだった年齢 (同じなら早い方)。記録が無ければ undefined
export function happiestAge(h: number[]): number | undefined {
  let best: number | undefined;
  h.forEach((v, i) => { if (typeof v === 'number' && (best === undefined || v > h[best])) best = i; });
  return best;
}

const place = (l: PastLife) => {
  const c = byCode(l.birthCountry).name;
  if (l.city === undefined) return c;
  return isEn ? (l.city ? `${l.city}, ${c}` : `rural ${c}`) : `${c}${l.city ? `の${l.city}` : 'の農村'}`;
};
const spouses = (l: PastLife) => (l.circle ?? []).filter((t) => t.role === 'spouse').map((t) => t.name ?? '').filter(Boolean);
const deathLine = (l: PastLife) => {
  const en = l.age === 0 ? 'Died before turning 1' : `Died at ${l.age}`;
  const ja = l.age === 0 ? '1歳になる前に' : `${l.age}歳`;
  return l.cause ? L(`${ja}、${causeName(l.cause)}で亡くなった。`, `${en}. Cause: ${causeName(l.cause)}.`) : L(`${l.age === 0 ? ja : `${ja}で`}亡くなった。`, `${en}.`);
};

// 用意した文の本体 (感想・問い・リンクを除いた4〜6行)。リンクの先のページにも同じ行を出す。
// いちばん目を引くことから: 同じ1秒の寿命が大きく分かれていればその一文が先頭。手ざわりの名前と、1950年より前なら生きた時代も足す
export function shareLines(l: PastLife): string[] {
  const home = l.me ? homeWord(l.me.familyP) : '';
  const span = `${l.birthYear}–${l.birthYear + l.age}`;
  const happy = happiestAge(l.happyByAge);
  const stat = poorerShare(l);
  const art = /^[aeiou]/.test(home) ? 'an' : 'a';
  const [lo, hi] = ageSpread(l);
  const n = l.others.length + 1;
  const tex = lifeTexName(l.tex);
  const polity = bornIn(l.birthCountry, l.birthYear, l.birthSide);
  return [
    ...(hi - lo >= SPREAD_BIG ? [L(`同じ1秒に生まれた${n}人は、${lo}歳から${hi}歳まで、生きた長さが大きく分かれた。`, `The ${n} born in the same second lived from ${lo} to ${hi} years. A wide gap.`)] : []),
    L(`${l.name}(${span})。${place(l)}の${home || '家'}に生まれた。`, `${l.name} (${span}). Born into ${home ? `${art} ${home}` : 'a family'} in ${place(l)}.`),
    ...(l.birthYear < 1950 ? [L(`${polity}に生まれ、${l.birthYear}年から${l.birthYear + l.age}年の世界を生きた。`, `Born in ${polity}, and lived through the world of ${l.birthYear}–${l.birthYear + l.age}.`)] : []),
    ...(l.job ? [L(`${jobName(l.job.replace('(リーダー)', ''))}として働いた。`, `Work: ${jobName(l.job.replace('(リーダー)', ''))}.`)] : []),
    ...(happy !== undefined && l.age >= 3 ? [L(`いちばん幸せだったのは${happy}歳のころ。`, `Happiest around age ${happy}.`)] : []),
    ...(tex ? [L(`この人生の手ざわりは「${tex}」。`, `The texture of this life: ${tex}.`)] : []),
    deathLine(l),
    ...(stat !== undefined ? [L(`生まれた年、世界の${stat}%はこの家より貧しかった。`, `In the birth year, ${stat}% of the world was poorer than this family.`)] : []),
  ];
}

export function shareText(lines: string[], feelings: string, url: string): string {
  return [...(feelings ? [feelings, ''] : []), ...lines, `${L('あなたはどこに生まれると思う？', 'Where do you think you would be born?')} ${TAGS}`, url].join('\n');
}

const recordNo = (l: PastLife) => `No. ${l.birthCountry}-${l.birthYear}-${String(l.age).padStart(3, '0')}`;

// 顔だけを描くための主人公の代わり。SNS では色のある顔にする (死亡記録の白黒とは分ける)
const faceOf = (l: PastLife) => ({ seed: l.seed, given: l.given, sex: l.sex, gender: l.gender, age: l.age, alive: true, birthYear: l.birthYear, birthCountry: l.birthCountry, country: l.country, religion: l.religion ?? '', spouse: l.spouse }) as unknown as Person;

export function shareCardOf(l: PastLife, host = location.host): HTMLCanvasElement {
  const me = l.me;
  const stat = poorerShare(l);
  const happy = happiestAge(l.happyByAge);
  const sp = spouses(l);
  const dash = '—';
  return drawShareCard({
    brand: 'UNCHOSEN', tag: L('生まれは、選べない', 'No one chooses where they are born'), code: recordNo(l), face: faceOf(l), scene: l.scene, name: l.name,
    sub: [place(l), L(`${l.birthYear}–${l.birthYear + l.age}・享年${l.age}`, `${l.birthYear}–${l.birthYear + l.age} · died at ${l.age}`)],
    facts: [
      [L('生まれた家の暮らし向き', 'Family at birth'), me ? homeWord(me.familyP).replace(/^./, (c) => c.toUpperCase()) : dash],
      [L('学歴', 'Education'), me ? (me.edu < 0 ? L('就学前', 'Preschool') : EDU_LABEL[me.edu]) : dash],
      [L('仕事', 'Work'), l.job ? jobName(l.job.replace('(リーダー)', '')) : me ? L('なし', 'None') : dash],
      [L('連れ合い', 'Spouse'), sp.length ? sp.join(SEP) : l.circle ? L('いない', 'None') : dash],
      [L('子ども', 'Children'), me ? (me.kids ? L(`${me.kids}人`, String(me.kids)) : L('いない', 'None')) : dash],
      [L('いちばん幸せだった年', 'Happiest year'), happy !== undefined ? L(`${happy}歳 (${l.birthYear + happy}年)`, `Age ${happy} (${l.birthYear + happy})`) : dash],
      [L('亡くなった場所', 'Died in'), byCode(l.country).name],
      [L('死因', 'Cause of death'), l.cause ? causeName(l.cause) : dash],
    ],
    stat: stat === undefined ? undefined : {
      pct: stat, big: `${stat}%`,
      text: L(`生まれた${l.birthYear}年、世界の${stat}%の人は、この家より貧しい暮らしだった`, `In ${l.birthYear}, ${stat}% of the world lived on less than this family`),
      note: L('生まれた家の1人あたり所得 (購買力平価) を、その年の世界の人と比べたおおよその値', 'Household income per person at birth (PPP), compared with everyone in the world that year. Approximate.'),
    },
    closing: L('誰も、どこに生まれるかを選んでいない。', 'No one chooses where they are born.'),
    foot: `${host}  ${TAGS}`,
    years: lifeMapCells({ kinds: l.kinds, age: l.age, alive: false }).filter((c) => c.age <= l.age).map((c) => c.kind),
  });
}

// 死亡記録に置く欄。カードの形のボタン列と、カードそのもの (mountShare が描く) を上に置く
export const shareSection = (l: PastLife): string => `<section class="panel sharebox">
  <h3>${L('この人生を共有する', 'Share this life')}</h3>
  <div class="cardkinds" role="group" aria-label="${L('カードの形', 'Card style')}">${cardKinds(l).map((k) => `<button data-ck="${k}">${cardLabel(k)}</button>`).join('')}<span class="ratio"><button data-ratio="45">4:5</button><button data-ratio="916">9:16</button></span></div>
  <div class="cardprev"></div>
  <textarea id="feel" maxlength="200" rows="2" placeholder="${L('この人生を生きてみた、ひとことの感想(任意)', 'A few words on living this life (optional)')}"></textarea>
  <pre class="sharetext" aria-live="polite"></pre>
  <div class="choices">
    <button class="primary" data-sh="share">${L('画像を共有する', 'Share image')}</button>
    <button data-sh="save">${L('画像を保存', 'Save image')}</button>
    <button data-sh="copy">${L('テキスト・リンクをコピー', 'Copy text & link')}</button>
  </div>
  <p class="note shnote">${L('共有・コピーすると、この人生の要約と感想を載せたページ (リンク) ができる。本当の名前や連絡先は載らない。', 'Sharing or copying makes a public page with this summary and your words. No real name or contact is included.')}</p>
</section>`;

async function b64(blob: Blob): Promise<string> {
  const u = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

// ogCard: リンクの先で使う横長の画像 (1200×630) を描く関数
export function mountShare(root: HTMLElement, l: PastLife, ogCard: () => HTMLCanvasElement): void {
  const box = root.querySelector<HTMLElement>('.sharebox');
  if (!box) return;
  const feel = box.querySelector<HTMLTextAreaElement>('#feel')!;
  const pre = box.querySelector<HTMLElement>('.sharetext')!;
  const note = box.querySelector<HTMLElement>('.shnote')!;
  const lines = shareLines(l);
  const fallbackUrl = `${location.origin}/`;
  let link: { feelings: string; url: string } | undefined;
  let card: Blob | null = null;
  const render = () => { pre.textContent = shareText(lines, feel.value.trim(), link?.feelings === feel.value.trim() ? link.url : fallbackUrl); };
  render();
  feel.addEventListener('input', render);

  // カードの形 (この人生に残す) と、4:5 か 9:16 か
  let kind: CardKind = l.card ?? pickCard(l);
  let story = false;
  const prev = box.querySelector<HTMLElement>('.cardprev')!;
  const showCard = () => {
    card = null;
    box.querySelectorAll<HTMLElement>('[data-ck]').forEach((b) => b.classList.toggle('on', b.dataset.ck === kind));
    box.querySelectorAll<HTMLElement>('[data-ratio]').forEach((b) => b.classList.toggle('on', (b.dataset.ratio === '916') === story));
    const cv = lifeCard(l, kind, story);
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', cardLabel(kind));
    prev.replaceChildren(cv);
  };
  showCard();
  box.querySelector('.cardkinds')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ck],[data-ratio]');
    if (!b) return;
    if (b.dataset.ck) { kind = b.dataset.ck as CardKind; setCard(l, kind); } else story = b.dataset.ratio === '916';
    showCard();
  });

  // リンクを作る (感想が変わったら作り直す)。だめなら null
  const permalink = async (): Promise<string | null> => {
    const feelings = feel.value.trim();
    if (link?.feelings === feelings) return link.url;
    try {
      const og = await toPng(ogCard());
      const r = await fetch('/api/share', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang, name: l.name, birthYear: l.birthYear, age: l.age, lines, stat: poorerShare(l) ?? null, feelings, ...(og ? { image: await b64(og) } : {}) }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.data?.id) {
        note.textContent = j?.error === 'blocked' ? L('感想に載せられない言葉があったので、リンクは作らなかった。', 'Your words contain something we cannot post, so no link was made.') : L('リンクを作れなかったので、サイトの入口を付けた。', 'Could not make a link, so the site address is used.');
        return null;
      }
      link = { feelings, url: `${location.origin}/s/${j.data.id}` };
      render();
      return link.url;
    } catch {
      return null;
    }
  };
  const text = async () => shareText(lines, feel.value.trim(), (await permalink()) ?? fallbackUrl);
  const image = async () => (card ??= await toPng(lifeCard(l, kind, story)));
  const filename = () => `unchosen-${l.birthCountry}-${l.birthYear}-${kind}${story ? '-story' : ''}.png`;

  const copy = async (t: string) => {
    try { await navigator.clipboard.writeText(t); return true; } catch {
      // 古いブラウザ: 選んでコピー
      const ta = Object.assign(document.createElement('textarea'), { value: t });
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  };

  box.addEventListener('click', async (e) => {
    const d = (e.target as HTMLElement).closest<HTMLElement>('[data-sh]')?.dataset.sh;
    if (!d) return;
    if (d === 'save') { const b = await image(); if (b) download(b, filename()); return; }
    if (d === 'copy') { note.textContent = (await copy(await text())) ? L('文とリンクをコピーした。', 'Copied the text and link.') : L('コピーできなかった。上の文を選んでコピーしてください。', 'Could not copy. Please select the text above.'); return; }
    const [b, t] = await Promise.all([image(), text()]);
    if (!b) return;
    const files = [new File([b], filename(), { type: 'image/png' })];
    try {
      if (navigator.canShare?.({ files, text: t })) await navigator.share({ files, text: t });
      else if (navigator.share) await navigator.share({ text: t });
      else {
        download(b, filename());
        note.textContent = (await copy(t)) ? L('画像を保存し、文とリンクをコピーした。', 'Saved the image and copied the text and link.') : L('画像を保存した。', 'Saved the image.');
      }
    } catch (err) {
      // リンクを作る間に「押した直後」でなくなると共有を断られる。リンクはもうあるので、もう一度で通る
      if ((err as Error)?.name === 'NotAllowedError') note.textContent = L('準備ができた。もう一度「画像を共有する」を押してください。', 'Ready. Please press "Share image" again.');
    }
  });
}
