// AI に渡す文章。統計で決まった事実を渡し、それに矛盾しない肉付けだけを頼む。
import { byCode } from '../engine/countries';
import { formatMoney } from '../engine/economy';
import { currentIncome } from '../engine/events/common';
import { EDU_LABEL, eduLevel, type Person } from '../engine/person';
import type { Msg } from './client';

const RULES = `あなたは、実際の統計にもとづく人生シミュレーション「Unchosen」の語り手です。
- 渡された事実(国・年齢・家族・仕事・お金・健康)に矛盾することは書かない。
- 主人公を死なせない。結婚・出産・離婚・移住・引っ越し・転勤・転職・病気の診断は書かない(それはシミュレーションが決める)。
- 事実にない家族(夫・妻・子ども・兄弟)を登場させない。
- 自殺・自傷は扱わない。性的な描写をしない。
- その国・地域・宗教・暮らし向きの現実に即した、具体的で小さな出来事を書く。観光案内のような紋切り型は避ける。
- 日本語。常体の過去形(〜た。)で、短く具体的に。感嘆符・絵文字・ダッシュを使わない。「かけがえのない」「実現」「さらに」のような言い回しを避ける。
- 出力は JSON だけ。前置きや説明は書かない。`;

function facts(p: Person): string {
  const c = byCode(p.country);
  const born = byCode(p.birthCountry);
  const income = currentIncome(p);
  const kids = p.children.map((k) => `${k.name}(${k.alive ? `${k.age}歳` : '他界'})`).join('、') || 'なし';
  const recent = p.log.slice(-10).map((e) => `${e.age}歳: ${e.text}`).join('\n');
  return [
    `名前: ${p.name}(呼び名 ${p.given})・${p.sex === 'F' ? '女性' : '男性'}・${p.age}歳・${p.birthYear + p.age}年`,
    `生まれ: ${born.name}${p.country !== p.birthCountry ? ` → 今は${c.name}に住む` : ''}・住まい: ${p.city ?? '農村'}・宗教: ${p.religion}`,
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

export interface YearAsk { moments: number; event: boolean; decision: boolean }

// 1年分をまとめて1回で頼む
export function yearPrompt(p: Person, ask: YearAsk): Msg[] {
  const parts = [`「${p.age}歳の1年」に起きることを考えてください。`, `moments: その年の小さな出来事を${ask.moments}つ。それぞれ1文、60字以内。`];
  if (ask.event) parts.push('event: 予想していなかった出来事を1つ(良いことでも悪いことでもよい。事故・災害・幸運・人との出会い・失せ物など)。暮らしの目盛りへの影響を付ける。');
  if (ask.decision) parts.push('decision: この人がこの年に迫られる、その状況ならではの選択を1つ。選択肢は2〜3個で、それぞれに結果の一文と影響を付ける。');
  const schema = `{
  "moments": [{"text": "…"}],
  ${ask.event ? `"event": {"text": "…", "effects": {"health": 0, "happy": 0, "bond": 0, "learn": 0}, "money": 0},` : ''}
  ${ask.decision ? `"decision": {"title": "短い見出し", "text": "状況の説明(1〜2文)", "options": [{"label": "選択肢(15字以内)", "hint": "見込み(20字以内)", "result": "選んだあとに起きたこと(1文)", "effects": {"health": 0, "happy": 0, "bond": 0, "learn": 0}, "money": 0}]},` : ''}
  "_": 0
}`;
  return [
    { role: 'system', content: RULES },
    {
      role: 'user',
      content: `${facts(p)}\n\n${parts.join('\n')}\neffects は -10〜10 の整数。money は年収に対する割合(-0.5〜0.3、たとえば -0.05 は年収の5%の出費)。\n次の形の JSON で答えてください:\n${schema}`,
    },
  ];
}

export function storyPrompt(p: Person): Msg[] {
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

export function othersPrompt(others: Person[]): Msg[] {
  const list = others.map((o, i) => `${i}: ${o.name}・${byCode(o.country).name}・${o.sex === 'F' ? '女性' : '男性'}・${o.age}歳・${o.alive ? (o.job ?? (o.school.enrolled ? '学生' : '家で暮らす')) : `${o.age}歳で他界`}\n   最近: ${o.log.slice(-4).map((e) => e.text).join(' / ')}`).join('\n');
  return [
    { role: 'system', content: RULES },
    { role: 'user', content: `同じ1秒に生まれた4人の、いまの様子を一言ずつ(30字以内)。亡くなった人は、残された人の様子で。\n${list}\n次の形の JSON で答えてください: {"lines": ["…", "…", "…", "…"]}` },
  ];
}
