// 一生を数行にまとめる。死亡記録・追悼館・同じ1秒の人たちの結末に使う。
import { byCode } from './countries';
import { homeWord } from './life';
import { childWord, eduLevel, type Person } from './person';

export function lifeStory(p: Person): string {
  const c = byCode(p.birthCountry);
  const where = p.city && p.country === p.birthCountry ? `${c.name}の${p.city}` : `${c.name}${p.rural ? 'の農村' : ''}`;
  const parts = [`${where}の${p.familyP >= 0.8 ? 'いちばん裕福な層の家' : homeWord(p.familyP)}に${childWord(p.sex)}として生まれた。`];
  if (p.age < 6) {
    parts.push(p.age === 0 ? `最初の誕生日を迎えられず、${p.cause}で亡くなった。` : `${p.age}歳で、${p.cause}で亡くなった。`);
    return parts.join('');
  }
  const edu = eduLevel(p);
  const major = p.school.major ? `で${p.school.major}を学んだ` : 'を出た';
  parts.push(edu === 5 ? `大学と大学院${major}。` : edu === 4 ? `大学${major}。` : edu === 3 ? '高校を卒業した。' : edu === 2 ? '中学校まで通った。' : edu === 1 ? '小学校を出た。' : p.school.years > 0 ? '学校は途中でやめた。' : '学校には通えなかった。');
  if (p.childMarriage) parts.push('子どものうちに結婚させられた。');
  if (p.job) parts.push(`${p.job.replace('(リーダー)', '')}として働き${p.retired ? '、引退した' : 'つづけた'}。`);
  const kids = p.children.length;
  const lost = p.children.filter((k) => !k.alive).length;
  if (kids) parts.push(`子どもを${kids}人育て${lost ? `、そのうち${lost}人を先に亡くした` : 'た'}。`);
  if (p.countriesLived.length > 1) parts.push(`${p.countriesLived.slice(1).map((k) => byCode(k).name).join('、')}でも暮らした。`);
  parts.push(`${p.age}歳で、${p.cause}で亡くなった。`);
  return parts.join('');
}

// 生きている途中の人のいまを一言で
export function nowLine(p: Person): string {
  if (!p.alive) return `${p.age}歳で亡くなった(${p.cause})`;
  if (p.age < 6) return '幼い日々';
  if (p.school.enrolled) return '学校に通っている';
  if (p.school.uni === 'studying' || p.school.grad === 'studying') return '大学で学んでいる';
  if (p.military === 'serving') return '兵役中';
  if (p.retired) return '引退して暮らす';
  if (p.unemployed) return '仕事を探している';
  if (p.working && p.job) return p.job;
  return '家で暮らす';
}
