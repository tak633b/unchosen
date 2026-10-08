// 静かな背景音。音源ファイルは持たず、WebAudio で和音をゆっくり重ねる。
const CHORDS = [
  [220, 277.18, 329.63, 415.3],
  [196, 246.94, 293.66, 369.99],
  [174.61, 220, 261.63, 329.63],
  [164.81, 207.65, 246.94, 329.63],
];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let timer: number | undefined;

function playChord(i: number): void {
  if (!ctx || !master) return;
  const now = ctx.currentTime;
  for (const f of CHORDS[i % CHORDS.length]) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = f * (Math.random() < 0.3 ? 2 : 1);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.05, now + 3);
    g.gain.linearRampToValueAtTime(0, now + 9);
    osc.connect(g).connect(master);
    osc.start(now);
    osc.stop(now + 9.5);
  }
}

export function setMusic(on: boolean): void {
  if (on) {
    ctx ??= new AudioContext();
    if (!master) {
      master = ctx.createGain();
      master.gain.value = 0.6;
      const delay = ctx.createDelay();
      delay.delayTime.value = 0.6;
      const fb = ctx.createGain();
      fb.gain.value = 0.35;
      master.connect(ctx.destination);
      master.connect(delay).connect(fb).connect(delay);
      fb.connect(ctx.destination);
    }
    void ctx.resume();
    let i = 0;
    playChord(i++);
    timer = window.setInterval(() => playChord(i++), 7000);
  } else {
    window.clearInterval(timer);
    void ctx?.suspend();
  }
}
