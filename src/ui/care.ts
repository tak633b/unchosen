// 心のための三つ: 「怖い場面を除く」のスイッチ、「心がつらいとき」の欄、休むことをすすめる一言。
// 相談先の番号は engine/suicide.ts にだけ置き、ここでは並べるだけ
import { gentle, setGentle } from '../engine/gentle';
import { LINES_EN, LINES_JA, type Line } from '../engine/suicide';
import { esc, load, save } from './dom';
import { isEn, L } from '../i18n';

// ---- 怖い場面を除く --------------------------------------------------------
// このブラウザの設定。読めなければ OFF (dom.ts の load が try/catch で包んでいる)
setGentle(load<boolean>('gentle', false) === true);

export const gentleSwitch = (): string => `<label class="gentle"><input type="checkbox" data-gentle ${gentle() ? 'checked' : ''}> ${L('怖い場面を除く', 'Leave out frightening scenes')}
  <small class="note">${L('このブラウザで生きる人生で、自死・性暴力・薬物・暴力の場面が起きなくなる。亡くなる時期は統計どおりのまま、死因はほかの死因から決まる。', 'In lives played in this browser, suicide, sexual violence, drugs and violence will not happen. When people die still follows the statistics; the cause is drawn from the other causes.')}</small></label>`;

// どの画面のスイッチでも同じ設定を切り替え、ほかのスイッチの見た目もそろえる
document.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  if (!t.matches?.('[data-gentle]')) return;
  setGentle(t.checked);
  save('gentle', t.checked);
  document.querySelectorAll<HTMLInputElement>('[data-gentle]').forEach((x) => { x.checked = t.checked; });
});

// ---- 重ねて出す小さな窓 ----------------------------------------------------
// 人生の途中で開いたら、時間を止める (game.ts が止め方を渡す)。game.ts の ⋯ メニュー (前世の記録・アルバム・手ざわり) もこの窓で出す
let pause = (): void => {};
export function onCarePause(f: () => void): void { pause = f; }

export function overlay(html: string, cls = ''): HTMLElement {
  document.querySelector('.care')?.remove();
  pause();
  const back = document.createElement('div');
  back.className = 'modal-back care';
  back.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  back.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === back || t.closest('[data-care-close]')) back.remove();
  });
  document.body.append(back);
  back.querySelector<HTMLElement>('button')?.focus();
  return back;
}

// ---- 心がつらいとき ----------------------------------------------------------
const lineHtml = (l: Line) => `<li><b>${esc(l.name)}</b> ${l.tel ? `<a href="tel:${esc(l.tel.replace(/[^0-9]/g, ''))}">${esc(l.tel)}</a>` : `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url!.replace('https://', ''))}</a>`}<br><small class="note">${esc(l.note)}</small></li>`;

export const careLink = (): string => `<button class="link carelink" data-care>${L('心がつらいとき', 'If you are struggling')}</button>`;

export function openCare(): void {
  overlay(`<h2>${L('心がつらいとき', 'If you are struggling')}</h2>
    <p>${L('ひとりで抱えなくていい。話を聞いてくれる場所があります。うまく話せなくても大丈夫。', 'You do not have to carry it alone. There are people who will listen, even if the words do not come out right.')}</p>
    <ul class="carelines">${(isEn ? LINES_EN : LINES_JA).map(lineHtml).join('')}</ul>
    ${isEn ? '' : `<p class="note">${L('日本の外にいるときは、findahelpline.com でその国の窓口を探せる。', '')}</p>`}
    <p>${L('この人生の重い場面を見たくないときは:', 'If you would rather not see heavy scenes:')}</p>
    ${gentleSwitch()}
    <p class="note">${L('ここで閉じて休んでも、記録はこの端末にそのまま残る。', 'If you stop here and rest, everything stays saved on this device.')}</p>
    <div class="choices"><button data-care-close>${L('閉じる', 'Close')}</button></div>`);
}
document.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest?.('[data-care]')) openCare(); });

// ---- 休むことをすすめる ------------------------------------------------------
// このページで2時間を過ごしたとき、または夜遅く (0〜5時) に新しい人生を始めようとしたとき。たずねるのは1日に1回だけ
const OPENED = Date.now();
const LONG_MS = 2 * 3600 * 1000;
const today = () => new Date().toLocaleDateString('sv'); // 端末の時刻での YYYY-MM-DD
const askedToday = () => load<string>('restAsked', '') === today();
const lateNight = () => new Date().getHours() < 5;

function askRest(why: 'long' | 'late', go: () => void): void {
  save('restAsked', today());
  const back = overlay(`<h2>${L('少し休みませんか', 'Time for a rest?')}</h2>
    <p>${why === 'long' ? L('このページを開いてから、2時間がたちました。', 'This page has been open for two hours.') : L('もう夜遅い時間です。', 'It is late at night.')}${L('', ' ')}${L('休んでいるあいだも、記録はこの端末にそのまま残ります。', 'While you rest, everything stays saved on this device.')}</p>
    <div class="choices"><button class="primary" data-rest="go">${L('このまま続ける', 'Keep going')}</button><button data-rest="stop">${L('今日はここまでにする', 'Stop for today')}</button></div>`);
  back.addEventListener('click', (e) => {
    const r = (e.target as HTMLElement).closest<HTMLElement>('[data-rest]')?.dataset.rest;
    if (r === 'go') { back.remove(); go(); }
    if (r === 'stop') back.querySelector('.modal')!.innerHTML = `<p>${L('おやすみなさい。続きは、いつでもこの端末から。', 'Rest well. You can pick up where you left off on this device any time.')}</p><div class="choices"><button data-care-close>${L('閉じる', 'Close')}</button></div>`;
  });
}

// 新しい人生を始める前に呼ぶ。夜遅くでまだたずねていなければ、たずねて false を返す (続けるなら go が呼ばれる)
export function restOk(go: () => void): boolean {
  if (!lateNight() || askedToday()) return true;
  askRest('late', go);
  return false;
}

window.setInterval(() => { if (Date.now() - OPENED >= LONG_MS && !askedToday() && !document.querySelector('.care, .crisis')) askRest('long', () => {}); }, 60_000);
