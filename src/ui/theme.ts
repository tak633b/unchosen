// 明るい画面と暗い画面 (◐)。既定は暗いまま。選んだ方はこの端末に残す (style.css の [data-theme=light])
import { load, save } from './dom';
import { L } from '../i18n';

export type Theme = 'dark' | 'light';
const KEY = 'theme';

export const theme = (): Theme => (load<Theme>(KEY, 'dark') === 'light' ? 'light' : 'dark');

export function applyTheme(t: Theme = theme()): void {
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector<HTMLMetaElement>('meta[name=theme-color]');
  if (meta) meta.content = t === 'light' ? '#f3efe6' : '#11141d';
}

export function toggleTheme(): void {
  const t: Theme = theme() === 'light' ? 'dark' : 'light';
  save(KEY, t);
  applyTheme(t);
}

export const themeBtn = (): string => `<button class="themebtn" data-theme-toggle aria-label="${L('明るい画面と暗い画面を切り替える', 'Switch light and dark')}" title="${L('明るい / 暗い', 'Light / dark')}">◐</button>`;
