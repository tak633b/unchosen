// その人の一生: 輪の人それぞれの、生まれてから亡くなるまで。主人公と一緒の出来事と、主人公が亡くなった後 (その後) に印を付ける
import { byCode } from '../engine/countries';
import { people } from '../engine/bonds';
import { lifeOf, type KinEntry } from '../engine/kin';
import type { Person } from '../engine/person';
import { esc } from './dom';
import { L } from '../i18n';

const item = (e: KinEntry, given: string) =>
  `<li class="k-${e.kind}${e.big ? ' big' : ''}${e.shared ? ' shared' : ''}${e.me ? ' me' : ''}${e.after ? ' after' : ''}"><span class="age">${L(`${e.age}歳`, `${e.age}`)}<small>${e.year}</small></span><span>${e.shared ? `<i class="kintag">${L(`${esc(given)}の記録`, `${esc(given)}'s record`)}</i>` : ''}${esc(e.text)}${e.stat ? `<small class="stat">${esc(e.stat)}</small>` : ''}${e.why ? `<small class="why">${esc(e.why)}</small>` : ''}</span></li>`;

const divider = (text: string, cls = '') => `<li class="kindiv${cls}"><span>${text}</span></li>`;

export function lifeHtml(p: Person, id: number): string {
  const l = lifeOf(p, id);
  if (!l) return '';
  const c = byCode(l.country).name;
  const given = p.given;
  const head = l.full
    ? L(`${l.born}–${l.born + l.age}・${c}生まれ・享年${l.age}歳${l.cause ? `・死因 ${l.cause}` : ''}`, `${l.born}–${l.born + l.age} · born in ${c} · died at ${l.age}${l.cause ? ` · ${l.cause}` : ''}`)
    : L(`${l.born}年・${c}生まれ・今${l.age}歳`, `Born ${l.born} in ${c} · ${l.age} now`);
  const rows: string[] = [];
  let before = false, met = false, after = false;
  for (const e of l.entries) {
    if (e.year < p.birthYear) before = true;
    else if (before && !met) { met = true; rows.push(divider(L(`ここから、${esc(given)}が生まれてからの年`, `From here on, ${esc(given)} is alive`))); }
    if (e.after && !after) { after = true; rows.push(divider(L(`その後 (${esc(given)}が亡くなってから)`, `Afterward (after ${esc(given)} died)`), ' after')); }
    rows.push(item(e, given));
  }
  const tie = people(p).find((t) => t.id === id);
  const lost = tie?.until !== undefined;
  // 連絡が途絶えたあとに亡くなった人。主人公の輪の上では、まだ生きていることになっている
  const unheard = l.full && lost && tie!.alive && l.born + l.age <= p.birthYear + p.age;
  const tail = l.full ? '' : `<p class="note">${lost ? L('連絡が途絶えてからのことは、まだ分からない。', 'Nothing is known yet about the years after they lost touch.') : L('この先は、まだ分からない。', 'What comes next is not known yet.')}</p>`;
  return `<section class="kinlife"><h3>${L('その人の一生', 'Their whole life')} <small>${esc(head)}</small></h3>
    <p class="rlegend kinlegend"><span class="kinkey shared"></span>${L(`${esc(given)}の記録にある一緒の出来事 (${esc(given)}の側の文)`, `Shared moments from ${esc(given)}'s record (in ${esc(given)}'s words)`)}${after ? `<span class="kinkey after"></span>${L('その後', 'Afterward')}` : ''}</p>
    ${unheard ? `<p class="note">${L(`${esc(given)}は、この人が亡くなったことを知らなかった。`, `${esc(given)} never learned of this death.`)}</p>` : ''}
    <ol class="log kinlist">${before ? divider(L(`${esc(given)}が生まれる前`, `Before ${esc(given)} was born`)) : ''}${rows.join('')}</ol>${tail}</section>`;
}
