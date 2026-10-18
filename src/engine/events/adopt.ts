// 養子を迎える: 子を授からなかった夫婦が機関に相談し、研修と待機を経て、赤ん坊を迎えるか、縁がないまま終わる。
// 乱数は showRng (crisis.ts) で引き、人生の乱数の並びを変えない
import { L } from '../../i18n';
import { freshName, newId, shared } from '../bonds';
import { showRng } from '../crisis';
import { earnings, formatMoney } from '../economy';
import { makeName } from '../identity';
import type { Sex } from '../lifetable';
import { bump, childWord, countryOf, decide, log, yearOf, type Person } from '../person';

// 血縁のない家に赤ん坊を迎えることが制度としてふつうにある国 (roots.ts の DOMESTIC と、同じ型の制度を持つ西欧・北欧・オセアニア)
const ADOPT = new Set(['USA', 'GBR', 'CAN', 'AUS', 'NZL', 'IRL', 'SWE', 'NOR', 'DNK', 'FIN', 'NLD', 'BEL', 'FRA', 'DEU', 'CHE', 'ESP', 'ITA']);

const roll = (p: Person, salt: number) => showRng(p.seed, p.age, salt)();

// 毎年、household() のあとに呼ぶ
export function adoption(p: Person): void {
  if (p.recent.adoptDone !== undefined) return;
  const at = p.recent.adopt;
  if (at === undefined) { consult(p); return; }
  if (!p.spouse?.alive) { p.recent.adoptDone = p.age; return; }
  const years = p.age - at;
  if (years === 1) { log(p, L('家庭調査と親になるための研修を終え、あとは待つ番になった。', 'The home study and the parenting course were done. Now came the waiting.'), 'family'); return; }
  if (years < 2) return;
  if (roll(p, 0x4d01) < 0.3) { welcome(p); return; }
  if (years >= 4) {
    p.recent.adoptDone = p.age;
    log(p, L('今回は養子縁組に至らなかった。待っている家庭がたくさんあった。', 'The adoption did not come through this time. There were many families waiting.'), 'family');
    bump(p, { happy: -5 });
  }
}

// 子を授からなかった夫婦 (love.ts の tryForChild で noMoreKids)、または35〜45歳で子のいない夫婦が、機関に相談するか決める
function consult(p: Person): void {
  if (!p.spouse?.alive || p.age > 50 || p.spouse.age > 50 || p.children.some((k) => k.alive)) return;
  if (p.recent.noMoreKids === undefined && (p.age < 35 || p.age > 45)) return;
  const c = countryOf(p);
  if (roll(p, 0x4d02) >= (ADOPT.has(c.code) ? 0.03 : 0.003)) return;
  const fee = earnings(c, p.working ? p.incomeP : p.familyP) * 0.1;
  decide(p, {
    title: L('養子縁組の機関に相談する？', 'Ask an adoption agency?'),
    text: L(`${p.spouse.name}と話して、養子を迎えることを考え始めた。相談には家庭調査と研修があり、費用は${formatMoney(fee)}ほど。`, `Talked it over with ${p.spouse.name} and began to think about adopting. There would be a home study and a course, costing about ${formatMoney(fee)}.`),
    options: [
      { label: L('相談を申し込む', 'Apply'), apply: (q) => { q.wealth -= fee; q.recent.adopt = q.age; log(q, L(`養子縁組の機関に相談を申し込んだ。家庭調査と、親になるための研修を受けることになった(−${formatMoney(fee)})。`, `Applied to an adoption agency. A home study and a parenting course lay ahead (−${formatMoney(fee)}).`), 'family', true); } },
      { label: L('二人で生きていく', 'Stay as two'), apply: (q) => { q.recent.adoptDone = q.age; } },
    ],
    auto: (q) => (showRng(q.seed, q.age, 0x4d03)() < 0.6 ? 0 : 1),
  });
}

// 赤ん坊を迎える。子の記録は生まれた子と同じ形で、adopted の印だけ付く
function welcome(p: Person): void {
  const r = showRng(p.seed, p.age, 0x4d04);
  const sex: Sex = r() < 0.512 ? 'M' : 'F';
  const name = freshName(() => makeName(r, p.country, sex, { pool: p.pool, index: p.familyIndex }, undefined, yearOf(p)), (p.nameKeys ??= [])).given;
  const kid = { alive: true, age: 0, sex, name, id: newId(p), bond: 70, since: p.age, country: p.country, adopted: true };
  p.children.push(kid);
  p.recent.adoptDone = p.age;
  shared(p, [kid, p.spouse!], L(`養子縁組が決まり、生まれて間もない${childWord(sex)}を迎えた。名前は${name}。`, `The adoption came through: a newborn ${sex === 'F' ? 'girl' : 'boy'} joined the family, named ${name}.`), 'family', 5, true, undefined, 'birth');
  bump(p, { happy: 8, bond: 8 });
}
