// 背景の音楽。場面ごとに1曲を流し、場面が変わったら重ねて入れ替える (クロスフェード)。
// 曲は public/audio/ にあり、音楽を入れるまで読み込まない。出どころとライセンスは TRACKS (about と README に載せる)
import { load, save } from './dom';

export type Scene = 'title' | 'life' | 'life2' | 'crisis' | 'farewell';

export interface Track { file: string; title: string; artist: string; url: string; license: string; licenseUrl: string }
const BY = { artist: 'Kevin MacLeod', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' };
const im = (isrc: string) => `https://incompetech.com/music/royalty-free/index.html?isrc=${isrc}`;
export const TRACKS: Record<Scene, Track> = {
  title: { file: 'reawakening.mp3', title: 'Reawakening', url: im('USUAN1400017'), ...BY },
  life: { file: 'gymnopedie-no-1.mp3', title: 'Gymnopedie No. 1', url: im('USUAN1100787'), ...BY },
  life2: { file: 'meditation-impromptu-02.mp3', title: 'Meditation Impromptu 02', url: im('USUAN1100162'), ...BY },
  crisis: { file: 'thunder-dreams.mp3', title: 'Thunder Dreams', url: im('USUAN1200063'), ...BY },
  farewell: { file: 'sad-trio.mp3', title: 'Sad Trio', url: im('USUAN1100089'), ...BY },
};

const FADE = 2.5; // 秒

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let on = false;
let vol = clampVol(load('musicVol', 35)); // 0〜100
let scene: Scene = 'title';
let cur: { scene: Scene; el: HTMLAudioElement; gain: GainNode } | null = null;

function fadeTo(g: GainNode, v: number): void {
  const now = ctx!.currentTime;
  g.gain.cancelScheduledValues(now);
  g.gain.setValueAtTime(g.gain.value, now);
  g.gain.linearRampToValueAtTime(v, now + FADE);
}

function start(): void {
  if (!on || !ctx || !master || cur?.scene === scene) return;
  const old = cur;
  if (old) { fadeTo(old.gain, 0); window.setTimeout(() => old.el.pause(), FADE * 1000 + 100); }
  const el = new Audio(`${import.meta.env.BASE_URL}audio/${TRACKS[scene].file}`);
  el.loop = true;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  ctx.createMediaElementSource(el).connect(gain).connect(master);
  cur = { scene, el, gain };
  // 自動再生が止められたら、次に画面に触れたときに鳴らす
  el.play().then(() => fadeTo(gain, 1), () => document.addEventListener('pointerdown', () => { void ctx?.resume(); if (cur?.el === el && on) void el.play().then(() => fadeTo(gain, 1)); }, { once: true }));
}

/** 今の場面の曲。音楽が切ってあれば覚えておくだけ */
export function musicScene(s: Scene): void {
  scene = s;
  start();
}

export function setMusic(v: boolean): void {
  on = v;
  if (on) {
    ctx ??= new AudioContext();
    if (!master) { master = ctx.createGain(); master.gain.value = vol / 100; master.connect(ctx.destination); }
    void ctx.resume();
    start();
  } else if (cur) {
    const old = cur;
    cur = null;
    fadeTo(old.gain, 0);
    window.setTimeout(() => old.el.pause(), FADE * 1000 + 100);
  }
}

function clampVol(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 35;
}
export const musicVolume = (): number => vol;
/** 音量 (0〜100)。鳴っている曲にもすぐ効く。鼓動の音も同じ割合で上下する (sfx) */
export function setVolume(v: number): void {
  vol = clampVol(v);
  save('musicVol', vol);
  if (ctx && master) master.gain.setTargetAtTime(vol / 100, ctx.currentTime, 0.05);
}
/** 効果音の倍率。既定の音量 (35) で 1 */
export const sfx = (): number => Math.min(1.5, vol / 35);

// 命が危うい場面の音。音楽を入れている人にだけ鳴らす (game.ts が判断する)
function tone(freq: number, len: number, loud: number, type: OscillatorType = 'sine'): void {
  ctx ??= new AudioContext();
  void ctx.resume();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, loud * sfx()), now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + len);
  osc.connect(g).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + len + 0.05);
}
// 心臓の音: 低い二拍
export function thump(): void {
  tone(60, 0.18, 0.5);
  window.setTimeout(() => tone(52, 0.2, 0.35), 160);
}
// 止まった心臓の音: 細く長い一音
export const flatline = () => tone(880, 2.2, 0.05, 'triangle');
