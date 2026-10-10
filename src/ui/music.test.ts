import { describe, it, expect } from 'vitest';
import readme from '../../README.md?raw';
import readmeJa from '../../README.ja.md?raw';
import credits from '../../public/audio/CREDITS.txt?raw';
import { TRACKS } from './music';

// 置いてある曲 (読み込みはしない。パスだけ)
const onDisk = Object.keys(import.meta.glob('../../public/audio/*.mp3')).map((p) => p.split('/').pop()!);

describe('音楽', () => {
  const files = Object.values(TRACKS).map((t) => t.file);
  it('曲はすべて public/audio にあり、使っていない曲は置かない', () => {
    expect(onDisk.sort()).toEqual([...new Set(files)].sort());
  });
  it('どの曲もクレジット (README 両方と CREDITS.txt) に載っている', () => {
    for (const t of Object.values(TRACKS)) {
      for (const c of [readme, readmeJa, credits]) expect(c, t.title).toContain(`"${t.title}"`);
      expect(credits, t.file).toContain(t.file);
    }
  });
});
