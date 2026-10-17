// 死亡記録の「振り返って」: 残したもの・守ったもの・失ったもの (Person から3行)、
// 「大人になってから時間を注いだこと」(p.kinds を18歳から数える)
import { yen } from '../engine/economy';
import { netWorth } from '../engine/events/money';
import { people } from '../engine/bonds';
import type { Person, YearKind } from '../engine/person';
import { esc } from './dom';
import { isEn, L, religionName } from '../i18n';

export interface Lookback { saved: string; kept: string; lost: string }
const join = (xs: (string | false | undefined)[]) => xs.filter((x): x is string => !!x).join(L('・', ', '));

// 前世の記録に残すので、亡くなった時に Person から作る
export function lookbackOf(p: Person): Lookback {
  const ties = people(p);
  const spouse = ties.filter((t) => t.role === 'spouse');
  const marriedYears = spouse.reduce((s, t) => s + Math.max(0, (t.until ?? t.diedAt ?? p.age) - t.since), 0);
  const friends = ties.filter((t) => t.role === 'friend' && t.alive && t.until === undefined).length;
  const kids = p.children.filter((k) => k.alive).length;
  const worth = p.age >= 18 ? netWorth(p) : 0;
  const faithKept = p.religion !== '無宗教' && !p.faith?.drifted && !p.faith?.converted;
  const gone = ties.filter((t) => !t.alive && t.diedAt !== undefined && t.role !== 'pet' && t.role !== 'rival' && t.role !== 'ex');
  const who = (role: string) => gone.filter((t) => t.role === role);
  return {
    saved: join([
      worth > 0 && L(`財産 ${yen(worth)}`, `Savings ${yen(worth)}`),
      (p.house || p.mortgage) && L('自分の家', 'A home of their own'),
      worth < 0 && L(`借金 ${yen(-worth)}`, `Debt ${yen(-worth)}`),
    ]) || L('手元に残ったものは、ほとんどなかった', 'Almost nothing was left'),
    kept: join([
      marriedYears > 0 && L(`結婚生活 ${marriedYears}年`, `${marriedYears} years of marriage`),
      kids > 0 && L(`子ども${kids}人`, `${kids} ${kids === 1 ? 'child' : 'children'}`),
      friends > 0 && L(`友だち${friends}人`, `${friends} ${friends === 1 ? 'friend' : 'friends'}`),
      faithKept && L(`${religionName(p.religion)}の信仰`, `The ${religionName(p.religion)} faith`),
      p.hobbies.length > 0 && p.hobbies[0],
    ]) || L('守りきれたものは少なかった', 'Little could be kept'),
    lost: join([
      who('child').length > 0 && L(`子ども${who('child').length}人`, `${who('child').length} ${who('child').length === 1 ? 'child' : 'children'}`),
      who('spouse').length > 0 && L('連れ合い', 'A spouse'),
      who('partner').length > 0 && L('恋人', 'A partner'),
      (who('mother').length > 0 || who('father').length > 0) && (who('mother').length && who('father').length ? L('両親', 'Both parents') : who('mother').length ? L('母', 'Mother') : L('父', 'Father')),
      who('sibling').length > 0 && L(`きょうだい${who('sibling').length}人`, `${who('sibling').length} ${who('sibling').length === 1 ? 'sibling' : 'siblings'}`),
      who('friend').length > 0 && L(`友だち${who('friend').length}人`, `${who('friend').length} ${who('friend').length === 1 ? 'friend' : 'friends'}`),
    ]) || L('近しい人を見送ることは、なかった', 'Never had to bury anyone close'),
  };
}

export function lookbackHtml(b: Lookback): string {
  return `<section class="panel lookback"><h3>${L('振り返って', 'Looking back')}</h3><dl class="kv">
    <dt>${L('残したもの', 'Left behind')}</dt><dd>${esc(b.saved)}</dd>
    <dt>${L('守ったもの', 'Kept')}</dt><dd>${esc(b.kept)}</dd>
    <dt>${L('失ったもの', 'Lost')}</dt><dd>${esc(b.lost)}</dd></dl></section>`;
}

// 18歳からの年を、その年の色で数える (おおよそ。1年に1つの色)
const GROUP: Partial<Record<YearKind, [string, string]>> = {
  family: ['家族', 'Family'], love: ['家族', 'Family'], work: ['仕事', 'Work'], school: ['学び', 'Study'], old: ['老後', 'Old age'],
  ill: ['病とたたかう', 'Illness'], hard: ['苦しい時期', 'Hard times'], loss: ['別れ', 'Loss'], move: ['移り住む', 'Moving'],
};
export function timeSpentHtml(kinds: (YearKind | undefined)[], age: number): string {
  if (age < 20) return '';
  const n = new Map<string, number>();
  let last: YearKind = 'family';
  for (let a = 18; a <= age; a++) {
    const k: YearKind = kinds[a] ?? last;
    if (k === 'death') break;
    if (['work', 'school', 'old', 'family'].includes(k)) last = k;
    const g = GROUP[k];
    if (g) { const name = L(g[0], g[1]); n.set(name, (n.get(name) ?? 0) + 1); }
  }
  const rows = [...n].sort((a, b) => b[1] - a[1]);
  if (!rows.length) return '';
  return `<section class="panel"><h3>${L('大人になってから時間を注いだこと', 'Where the adult years went')} <small>${L('18歳から、1年ずつ', 'from 18, one year at a time')}</small></h3>
    <p class="spent">${rows.map(([k, v]) => `<span>${esc(k)} <b>${isEn ? `${v} ${v === 1 ? 'yr' : 'yrs'}` : `${v}年`}</b></span>`).join('')}</p></section>`;
}
