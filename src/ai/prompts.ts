// AI に渡す文章。統計で決まった事実を渡し、それに矛盾しない肉付けだけを頼む。
import { jobName, majorName } from '../engine/jobs';
import { ERA_NOW, byCode } from '../engine/countries';
import { formatMoney } from '../engine/economy';
import { currentIncome } from '../engine/events/common';
import { EDU_LABEL, countryOf, eduLevel, type Person, type Relative } from '../engine/person';
import { isEn, L, regionName, religionName } from '../i18n';
import type { Msg } from './client';
import { kindNote } from './words';
import type { BondAsk } from './apply';
import type { Role, Tie } from '../engine/person';

const RULES = `あなたは、実際の統計にもとづく人生シミュレーション「Unchosen」の語り手です。
- 渡された事実(国・年齢・家族・仕事・お金・健康)に矛盾することは書かない。
- 主人公を死なせない。結婚・出産・離婚・移住・引っ越し・転勤・転職・病気の診断は書かない(それはシミュレーションが決める)。
- 事実にない家族(夫・妻・子ども・兄弟)を登場させない。
- 自殺・自傷は扱わない。性的な描写をしない。
- その国・地域・宗教・暮らし向きの現実に即した、具体的で小さな出来事を書く。観光案内のような紋切り型は避ける。
- 日本語。常体の過去形(〜た。)で、短く具体的に。感嘆符・絵文字・ダッシュを使わない。「かけがえのない」「実現」「さらに」のような言い回しを避ける。
- 出力は JSON だけ。前置きや説明は書かない。`;

const RULES_EN = `You are the narrator of "Unchosen", a life simulator built on real statistics.
- Never contradict the facts given (country, age, family, work, money, health).
- Do not let the main character die. Do not write about marriage, childbirth, divorce, emigrating, moving house, job transfers, changing jobs, or being diagnosed with an illness (the simulation decides those).
- Do not introduce family members who are not in the facts (husband, wife, children, siblings).
- No suicide or self-harm. No sexual content.
- Write small, concrete events true to the realities of that country, region, religion and standard of living. Avoid tourist-brochure clichés.
- English. Past tense, third person, short and concrete. No exclamation marks, emoji or dashes. Avoid words like "journey", "testament", "tapestry", "vibrant", "cherish".
- Output JSON only. No preamble or explanation.`;
const rules = () => (isEn ? RULES_EN : RULES);
const sexWord = (s: 'F' | 'M') => (s === 'F' ? L('女性', 'female') : L('男性', 'male'));
const PET_EN: Record<string, string> = { 犬: 'dog', 猫: 'cat' };

function factsEn(p: Person): string {
  const c = countryOf(p);
  const born = byCode(p.birthCountry);
  const income = currentIncome(p);
  const rel = (r: Relative) => `${r.name ?? 'unnamed'} (${r.alive ? `age ${r.age}` : 'deceased'})`;
  const kids = p.children.map(rel).join(', ') || 'none';
  const recent = p.log.slice(-10).map((e) => `Age ${e.age}: ${e.text}`).join('\n');
  return [
    `Name: ${p.name} (goes by ${p.given}), ${sexWord(p.sex)}, age ${p.age}, year ${p.birthYear + p.age}`,
    ...(p.birthYear + p.age > ERA_NOW ? ['This year is in the future. The figures follow UN projections. Do not name specific future events, products or technologies; describe everyday life plainly.'] : []),
    `Born in: ${born.name} (${regionName(born.region)})${p.country !== p.birthCountry ? `, now lives in ${c.name}` : ''}. Lives in: ${p.city ?? 'a rural area'}. Religion: ${religionName(p.religion)}`,
    `Country: GDP per person $${Math.round(c.gdp).toLocaleString()} (PPP), life expectancy ${(p.sex === 'F' ? c.leF : c.leM).toFixed(0)}`,
    `Family of birth: income percentile ${Math.round(p.familyP * 100)} within the country`,
    `Education: ${p.school.enrolled ? 'in school' : EDU_LABEL[eduLevel(p)]}${p.school.major ? ` (${majorName(p.school.major)})` : ''}`,
    `Work: ${p.retired ? 'retired' : p.working ? (p.unemployed ? 'looking for work' : p.job ? jobName(p.job) : '') : 'none'}${income ? `, income ${formatMoney(income)} a year` : ''}`,
    `Family: mother ${rel(p.mother)}, father ${rel(p.father)}, partner ${p.spouse ? rel(p.spouse) : p.dating ? `dating ${p.dating.name}` : 'none'}, children ${kids}${p.pet ? `, a ${PET_EN[p.pet.kind] ?? p.pet.kind} named ${p.pet.name}` : ''}`,
    `Friend: ${p.friend ?? 'none'}. Likes: ${p.hobbies.join(', ') || 'nothing in particular'}${p.smoker ? '. Smokes' : ''}${p.illness ? `. Being treated for ${p.illness.name}` : ''}`,
    `State (0-100): health ${Math.round(p.stats.health)}, happiness ${Math.round(p.stats.happy)}, learning ${Math.round(p.stats.learn)}, connection ${Math.round(p.stats.bond)}`,
    `Recent events:\n${recent}`,
  ].join('\n');
}

function facts(p: Person): string {
  if (isEn) return factsEn(p);
  const c = countryOf(p);
  const born = byCode(p.birthCountry);
  const income = currentIncome(p);
  const kids = p.children.map((k) => `${k.name}(${k.alive ? `${k.age}歳` : '他界'})`).join('、') || 'なし';
  const recent = p.log.slice(-10).map((e) => `${e.age}歳: ${e.text}`).join('\n');
  return [
    `名前: ${p.name}(呼び名 ${p.given})・${p.sex === 'F' ? '女性' : '男性'}・${p.age}歳・${p.birthYear + p.age}年`,
    ...(p.birthYear + p.age > ERA_NOW ? ['この年は未来。数字は国連の予測にもとづく。未来の具体的な出来事・製品・技術の名前は作らず、ふだんの暮らしとして書く。'] : []),
    `生まれ: ${born.name}${p.country !== p.birthCountry ? ` → 今は${c.name}に住む` : ''}・住まい: ${p.city ?? '農村'}・宗教: ${religionName(p.religion)}`,
    `国の暮らし: 1人当たりGDP $${Math.round(c.gdp).toLocaleString()}(購買力平価)・平均寿命 ${(p.sex === 'F' ? c.leF : c.leM).toFixed(0)}歳`,
    `生まれた家: 国内の所得分位 ${Math.round(p.familyP * 100)}%`,
    `学歴: ${p.school.enrolled ? '在学中' : EDU_LABEL[eduLevel(p)]}${p.school.major ? `(${p.school.major})` : ''}`,
    `仕事: ${p.retired ? '引退' : p.working ? (p.unemployed ? '求職中' : p.job ?? '') : 'なし'}${income ? `・年収 ${formatMoney(income)}` : ''}`,
    `家族: 母 ${p.mother.name}(${p.mother.alive ? `${p.mother.age}歳` : '他界'})・父 ${p.father.name}(${p.father.alive ? `${p.father.age}歳` : '他界'})・連れ合い ${p.spouse ? `${p.spouse.name}(${p.spouse.alive ? `${p.spouse.age}歳` : '他界'})` : p.dating ? `恋人 ${p.dating.name}` : 'なし'}・子ども ${kids}${p.pet ? `・${p.pet.kind}の${p.pet.name}` : ''}`,
    `友だち: ${p.friend ?? 'なし'}・好きなこと: ${p.hobbies.join('、') || 'なし'}${p.smoker ? '・喫煙' : ''}${p.illness ? `・闘病中(${p.illness.name})` : ''}`,
    `状態(0-100): 健康 ${Math.round(p.stats.health)}・幸福 ${Math.round(p.stats.happy)}・学び ${Math.round(p.stats.learn)}・つながり ${Math.round(p.stats.bond)}`,
    `最近の出来事:\n${recent}`,
  ].join('\n');
}

export interface YearAsk { moments: number; event: boolean; decision: boolean; bond?: BondAsk }

const ROLE_JA: Record<Role, string> = { mother: '母', father: '父', sibling: 'きょうだい', spouse: '連れ合い', partner: '恋人', child: '子ども', friend: '友だち', mentor: '恩師', rival: 'ライバル', ex: '昔の恋人', grandchild: '孫' };
const ROLE_EN: Record<Role, string> = { mother: 'mother', father: 'father', sibling: 'sibling', spouse: 'spouse', partner: 'partner', child: 'child', friend: 'friend', mentor: 'mentor', rival: 'rival', ex: 'former partner', grandchild: 'grandchild' };
const WHY_JA: Record<BondAsk['why'], string> = { moved: 'この1年で関係が大きく動いた', long: 'しばらく一緒に過ごしていない', old: '年老いた親', lost: '連絡が途絶えている', close: 'いま近しい人' };
const WHY_EN: Record<BondAsk['why'], string> = { moved: 'the relationship shifted a lot this past year', long: 'they have not spent time together in years', old: 'an aging parent', lost: 'they have lost touch', close: 'one of the closest people now' };
const TONE_LIST = 'warm, help, reunion, reconcile, worry, distant, quarrel, hurt';

// 場面に出てくる人と、その人と過ごした出来事
function personJa(t: Tie): string {
  const mem = (t.mem ?? []).map((m) => `  ${m.age}歳: ${m.text}${kindNote(m.k) ? `[${kindNote(m.k)}]` : ''}`).join('\n') || '  (記録なし)';
  return `${t.name ?? ROLE_JA[t.role]}(${ROLE_JA[t.role]}・${t.age}歳・近さ ${Math.round(t.bond ?? 50)}/100・主人公が${t.since}歳の時から${t.until !== undefined ? `・${t.until}歳から疎遠` : ''})\n一緒に過ごした出来事:\n${mem}`;
}
function personEn(t: Tie): string {
  const mem = (t.mem ?? []).map((m) => `  Age ${m.age}: ${m.text}${kindNote(m.k) ? ` [${kindNote(m.k)}]` : ''}`).join('\n') || '  (nothing recorded)';
  return `${t.name ?? ROLE_EN[t.role]} (${ROLE_EN[t.role]}, age ${t.age}, closeness ${Math.round(t.bond ?? 50)}/100, known since the main character was ${t.since}${t.until !== undefined ? `, out of touch since ${t.until}` : ''})\nWhat they went through together:\n${mem}`;
}

function bondPartsJa(b: BondAsk): string[] {
  const n = b.t.name ?? ROLE_JA[b.t.role];
  const out = [`この年に関わる人: ${personJa(b.t)}\n選んだ理由: ${WHY_JA[b.why]}`];
  if (b.dead.length) out.push(`亡くなった人(生きている人として書かない・場面に出さない): ${b.dead.join('、')}`);
  if (!b.household) out.push(`${n}とは一緒に暮らしていない。同居している書き方をしない。`);
  if (b.scene) out.push(`scene: ${n}と主人公の短い場面を1つ(1〜2文、80字以内)。上の出来事と矛盾させず、その国・時代・暮らし向きに即して具体的に。tone は場面の種類を次から1つ: ${TONE_LIST}`);
  if (b.decision) out.push(`decision: ${n}が関わる、この年ならではの一回きりの決断を1つ(お金を貸すか・引き取るか・連絡を取るか など)。選択肢は2〜3個。それぞれに結果の一文、その後の二人の関係を表す tone(${TONE_LIST} から1つ)、幸福への影響 effects.happy と money を付ける。`);
  return out;
}
function bondPartsEn(b: BondAsk): string[] {
  const n = b.t.name ?? ROLE_EN[b.t.role];
  const out = [`Person involved this year: ${personEn(b.t)}\nWhy them: ${WHY_EN[b.why]}`];
  if (b.dead.length) out.push(`People who have died (never write them as alive, keep them out of the scene): ${b.dead.join(', ')}`);
  if (!b.household) out.push(`${n} does not live with the main character. Do not write them as living together.`);
  if (b.scene) out.push(`scene: one short scene between ${n} and the main character (1 or 2 sentences, at most 25 words). Do not contradict the events above; keep it concrete and true to the country, period and standard of living. tone is the kind of scene, one of: ${TONE_LIST}`);
  if (b.decision) out.push(`decision: one choice involving ${n} that comes up this year (lend money, take them in, get back in touch, and so on). 2 or 3 options, each with a one-sentence result, a tone for how things stand between them afterwards (one of ${TONE_LIST}), an effect on happiness (effects.happy) and money.`);
  return out;
}
const bondSchema = (b?: BondAsk) => (b?.scene ? `"scene": {"text": "…", "tone": "…"},` : '');
const decisionSchema = (b: BondAsk | undefined, label: string, hint: string, result: string) =>
  b?.decision ? `"options": [{"label": "${label}", "hint": "${hint}", "result": "${result}", "tone": "…", "effects": {"happy": 0}, "money": 0}]` : `"options": [{"label": "${label}", "hint": "${hint}", "result": "${result}", "effects": {"health": 0, "happy": 0, "bond": 0, "learn": 0}, "money": 0}]`;

// 1年分をまとめて1回で頼む
export function yearPrompt(p: Person, ask: YearAsk): Msg[] {
  if (isEn) return yearPromptEn(p, ask);
  const parts = [`「${p.age}歳の1年」に起きることを考えてください。`, `moments: その年の小さな出来事を${ask.moments}つ。それぞれ1文、60字以内。`];
  if (ask.event) parts.push('event: 予想していなかった出来事を1つ(良いことでも悪いことでもよい。事故・災害・幸運・人との出会い・失せ物など)。暮らしの目盛りへの影響を付ける。');
  if (ask.decision) parts.push('decision: この人がこの年に迫られる、その状況ならではの選択を1つ。選択肢は2〜3個で、それぞれに結果の一文と影響を付ける。');
  if (ask.bond) parts.push(...bondPartsJa(ask.bond));
  const schema = `{
  "moments": [{"text": "…"}],
  ${ask.event ? `"event": {"text": "…", "effects": {"health": 0, "happy": 0, "bond": 0, "learn": 0}, "money": 0},` : ''}
  ${bondSchema(ask.bond)}
  ${ask.decision || ask.bond?.decision ? `"decision": {"title": "短い見出し", "text": "状況の説明(1〜2文)", ${decisionSchema(ask.bond, '選択肢(15字以内)', '見込み(20字以内)', '選んだあとに起きたこと(1文)')}},` : ''}
  "_": 0
}`;
  return [
    { role: 'system', content: rules() },
    {
      role: 'user',
      content: `${facts(p)}\n\n${parts.join('\n')}\neffects は -10〜10 の整数。money は年収に対する割合(-0.5〜0.3、たとえば -0.05 は年収の5%の出費)。\n次の形の JSON で答えてください:\n${schema}`,
    },
  ];
}

function yearPromptEn(p: Person, ask: YearAsk): Msg[] {
  const parts = [`Think of what happens in "the year at age ${p.age}".`, `moments: ${ask.moments} small events from that year. One sentence each, at most 15 words.`];
  if (ask.event) parts.push('event: one unexpected event (good or bad: an accident, a disaster, a stroke of luck, meeting someone, losing something). Give its effect on the life meters.');
  if (ask.decision) parts.push('decision: one choice this person faces this year, specific to their situation. 2 or 3 options, each with a one-sentence result and its effects.');
  if (ask.bond) parts.push(...bondPartsEn(ask.bond));
  const schema = `{
  "moments": [{"text": "…"}],
  ${ask.event ? `"event": {"text": "…", "effects": {"health": 0, "happy": 0, "bond": 0, "learn": 0}, "money": 0},` : ''}
  ${bondSchema(ask.bond)}
  ${ask.decision || ask.bond?.decision ? `"decision": {"title": "short heading", "text": "the situation (1 or 2 sentences)", ${decisionSchema(ask.bond, 'option (at most 4 words)', 'likely outcome (at most 5 words)', 'what happened after choosing it (1 sentence)')}},` : ''}
  "_": 0
}`;
  return [
    { role: 'system', content: RULES_EN },
    {
      role: 'user',
      content: `${facts(p)}\n\n${parts.join('\n')}\neffects are integers from -10 to 10. money is a fraction of annual income (-0.5 to 0.3; for example -0.05 is a cost of 5% of a year's income).\nAnswer with JSON in this shape:\n${schema}`,
    },
  ];
}

export function storyPrompt(p: Person): Msg[] {
  if (isEn) return storyPromptEn(p);
  const all = p.log.filter((e) => e.big || e.kind === 'loss' || e.kind === 'love').map((e) => `${e.age}歳: ${e.text}`).slice(-60).join('\n');
  const answers = p.questions.filter((q) => q.a).map((q) => `${q.age}歳の問い「${q.q}」への答え: ${q.a}`).join('\n');
  return [
    { role: 'system', content: RULES.replace('主人公を死なせない。', '') },
    {
      role: 'user',
      content: `${facts(p)}\n\nこの人は${p.age}歳で亡くなりました(死因: ${p.cause})。\n人生の主な出来事:\n${all}\n${answers ? `本人が書き留めたこと:\n${answers}\n` : ''}
この一生を、3〜4段落の短い物語にしてください。出来事を並べるのではなく、その人が生きた土地と時代の手触りが残るように。最後の段落は、見送る人の一言で静かに終える。
次の形の JSON で答えてください: {"title": "物語の題(20字以内)", "story": "本文(段落の間は\\n\\n)"}`,
    },
  ];
}

function storyPromptEn(p: Person): Msg[] {
  const all = p.log.filter((e) => e.big || e.kind === 'loss' || e.kind === 'love').map((e) => `Age ${e.age}: ${e.text}`).slice(-60).join('\n');
  const answers = p.questions.filter((q) => q.a).map((q) => `At ${q.age}, asked "${q.q}", they wrote: ${q.a}`).join('\n');
  return [
    { role: 'system', content: RULES_EN.replace('Do not let the main character die. ', '') },
    {
      role: 'user',
      content: `${facts(p)}\n\nThis person died at age ${p.age} (cause: ${p.cause}).\nMain events of their life:\n${all}\n${answers ? `What they wrote down:\n${answers}\n` : ''}
Turn this life into a short story of 3 or 4 paragraphs. Do not list events; let the feel of the place and time they lived in come through. End the last paragraph quietly, with a few words from someone seeing them off.
Answer with JSON in this shape: {"title": "title of the story (at most 6 words)", "story": "the text (\\n\\n between paragraphs)"}`,
    },
  ];
}

export function othersPrompt(others: Person[]): Msg[] {
  if (isEn) {
    const list = others.map((o, i) => `${i}: ${o.name}, ${byCode(o.country).name}, ${sexWord(o.sex)}, age ${o.age}, ${o.alive ? (o.job ? jobName(o.job) : (o.school.enrolled ? 'student' : 'at home')) : `died at ${o.age}`}\n   Recent: ${o.log.slice(-4).map((e) => e.text).join(' / ')}`).join('\n');
    return [
      { role: 'system', content: RULES_EN },
      { role: 'user', content: `Four people born in the same second. One line each on how they are now (at most 8 words). For someone who has died, describe those left behind.\n${list}\nAnswer with JSON in this shape: {"lines": ["…", "…", "…", "…"]}` },
    ];
  }
  const list = others.map((o, i) => `${i}: ${o.name}・${byCode(o.country).name}・${o.sex === 'F' ? '女性' : '男性'}・${o.age}歳・${o.alive ? (o.job ?? (o.school.enrolled ? '学生' : '家で暮らす')) : `${o.age}歳で他界`}\n   最近: ${o.log.slice(-4).map((e) => e.text).join(' / ')}`).join('\n');
  return [
    { role: 'system', content: RULES },
    { role: 'user', content: `同じ1秒に生まれた4人の、いまの様子を一言ずつ(30字以内)。亡くなった人は、残された人の様子で。\n${list}\n次の形の JSON で答えてください: {"lines": ["…", "…", "…", "…"]}` },
  ];
}

// 最後までそばにいた人たちの言葉。渡した出来事だけを根拠にさせる
export function wordsPrompt(p: Person, ts: Tie[]): Msg[] {
  if (isEn) {
    return [
      { role: 'system', content: RULES_EN.replace('Do not let the main character die. ', '') },
      {
        role: 'user',
        content: `${facts(p)}\n\nThis person died at age ${p.age}. The people who were closest at the end each say a few words about ${p.given}.\n\n${ts.map((t) => `id ${t.id}: ${t.name} is ${p.given}'s ${ROLE_EN[t.role]}. ${personEn(t)}`).join('\n\n')}
For each person, 2 or 3 sentences (at most 45 words) in their own voice, first person. Base them only on what is listed under "What they went through together" for that person. Do not add events, places, years or names that are not listed there. Write names of people and places exactly as given. The listed events are written from the main character's side; the note in [ ] says what happened as this person saw it. Speak from this person's side (for a child, the main character is their mother or father).
Answer with JSON in this shape: {"words": [{"id": 0, "text": "…"}]}`,
      },
    ];
  }
  return [
    { role: 'system', content: RULES.replace('主人公を死なせない。', '') },
    {
      role: 'user',
      content: `${facts(p)}\n\nこの人は${p.age}歳で亡くなりました。最後までそばにいた人たちが、${p.given}について短く語ります。\n\n${ts.map((t) => `id ${t.id}: ${t.name}は${p.given}の${ROLE_JA[t.role]}。${personJa(t)}`).join('\n\n')}
それぞれ2〜3文(120字以内)、その人の口から出る話し言葉で。根拠にしてよいのは、その人の「一緒に過ごした出来事」に書かれていることだけ。書かれていない出来事・地名・年・人名を足さない。人名・地名は渡した表記のまま書く(カタカナに直さない)。出来事の文は主人公の側から書かれている。[ ] の注はその人から見て何があったか。語る人の側から話す(子どもにとって主人公は母か父)。
次の形の JSON で答えてください: {"words": [{"id": 0, "text": "…"}]}`,
    },
  ];
}
