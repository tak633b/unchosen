export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T => root.querySelector(sel) as T;

export function setHTML(sel: string, html: string): void {
  const el = $(sel);
  if (el) el.innerHTML = html;
}

// localStorage は壊れていたり使えなかったりするので、読めなければ既定値を返す
export function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function save(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 保存できなくても遊べる */ }
}

export const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;
