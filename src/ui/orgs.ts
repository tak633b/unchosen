// 「この活動をしている団体」: この人生に実際にあった困難 (3つまで) に、いまの世界の数字と団体へのリンクを1行ずつ
import type { PastLife } from './death';
import { esc } from './dom';
import { L } from '../i18n';

interface Org { key: string; test: (l: PastLife) => boolean; label: string; now: string; org: string; url: string }

const has = (l: PastLife, re: RegExp) => l.log.some((e) => re.test(e.text));
const childDied = (l: PastLife) => (l.circle ?? []).some((t) => t.role === 'child' && !t.alive && t.diedAt !== undefined && t.diedAt - t.since < 5);

// 数字の出典: UN IGME 2024 (5歳未満の死 480万人/年、2023年)、WHO/UNICEF JMP 2023 (安全な水 22億人)、
// UNHCR Global Trends 2024 (強制移動 1億2,320万人)、WHO 2025 (妊産婦死亡 26万人/年、2023年)、UNESCO 2024 (学校に通えない子 2億5,100万人)
const ORGS: Org[] = [
  { key: 'u5', test: childDied, label: L('5歳になる前に子を亡くす', 'Losing a child before age 5'), now: L('世界で年に約480万人の子どもが5歳の誕生日を迎えられない', 'About 4.8 million children a year do not reach their fifth birthday'), org: 'UNICEF', url: 'https://www.unicef.org/' },
  { key: 'water', test: (l) => has(l, /下痢|脱水|汚れた水|diarrh|dehydrat|unsafe water/i) || /下痢|diarrh/i.test(l.cause), label: L('安全な水が飲めない', 'No safe drinking water'), now: L('約22億人が安全に管理された飲み水を使えない', 'About 2.2 billion people lack safely managed drinking water'), org: 'WHO / UNICEF (WASH)', url: 'https://www.unicef.org/wash' },
  { key: 'flee', test: (l) => has(l, /飢饉|飢え|食べ物がな|避難|難民|逃れ|famine|hunger|fled|refugee|displaced/i) || /飢饉|famine/i.test(l.cause), label: L('飢えや戦争で家を追われる', 'Driven from home by hunger or war'), now: L('強制的に家を追われた人は約1億2,300万人', 'About 123 million people have been forced from their homes'), org: 'UNHCR / WFP', url: 'https://www.unhcr.org/' },
  { key: 'maternal', test: (l) => /出産|childbirth/i.test(l.cause) || has(l, /出産で亡くな|died in childbirth/i), label: L('出産で命を落とす', 'Dying in childbirth'), now: L('年に約26万人の女性が妊娠・出産で亡くなる', 'About 260,000 women a year die from pregnancy or childbirth'), org: 'UNFPA', url: 'https://www.unfpa.org/' },
  { key: 'school', test: (l) => (l.me ? l.me.edu === 0 && l.age >= 12 : false) || has(l, /通えなかった|could not go/i), label: L('学校に通えない', 'No schooling'), now: L('学校に通えない子どもと若者は約2億5,100万人', 'About 251 million children and youth are out of school'), org: 'Malala Fund / UNICEF', url: 'https://malala.org/' },
];

export function orgsHtml(l: PastLife): string {
  const rows = ORGS.filter((o) => o.test(l)).slice(0, 3);
  if (!rows.length) return '';
  return `<section class="panel orgs"><h3>${L('この活動をしている団体', 'Organizations working on this')} <small>${L('この人生に実際にあったこと', 'what this life actually faced')}</small></h3>
    <table class="cmp orgtable">${rows.map((o) => `<tr><td>${esc(o.label)}</td><td>${esc(o.now)}</td><td><a href="${o.url}" rel="noopener" target="_blank">${esc(o.org)}</a></td></tr>`).join('')}</table></section>`;
}
