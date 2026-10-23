import { describe, expect, it } from 'vitest';
import { furiText, parseFurigana, segmentsReading, segmentsRomaji } from '../src/core/furigana';
import { matchStroke, resample, type Pt } from '../src/core/strokes';
import { allKana, buildKanaStage, CONFUSABLES } from '../src/content/kana';

describe('furigana', () => {
  it('parses Tatoeba-style groups', () => {
    const segs = parseFurigana('[電話|でん|わ]はどこでできる？');
    expect(segs[0]).toEqual({ text: '電話', reading: 'でんわ', ruby: true });
    expect(furiText('[電話|でん|わ]はどこでできる？')).toBe('電話はどこでできる？');
    expect(segmentsReading(segs)).toBe('でんわはどこでできる？');
  });

  it('reads topic は after kanji as wa', () => {
    expect(segmentsRomaji(parseFurigana('[今日|きょう]はいい[天気|てん|き]です。'))).toBe('kyou wa ii tenki desu.');
  });

  it('honours explicit particle markers and word breaks', () => {
    const segs = parseFurigana('わたし_は がくせい です。');
    expect(segmentsRomaji(segs)).toBe('watashi wa gakusei desu.');
    expect(furiText('わたし_は がくせい です。')).toBe('わたしはがくせいです。');
    expect(segmentsRomaji(parseFurigana('すし_を たべます。'))).toBe('sushi o tabemasu.');
  });

  it('leaves は inside words alone', () => {
    expect(segmentsRomaji(parseFurigana('はい、そうです。'))).toBe('hai, soudesu.');
    expect(segmentsRomaji(parseFurigana('[花|はな]が きれい。'))).toBe('hana ga kirei.');
    expect(segmentsRomaji(parseFurigana('これ_は はな です。'))).toBe('kore wa hana desu.');
  });

  it('finds common particles in unmarked sentences', () => {
    expect(segmentsRomaji(parseFurigana('これはペンです。'))).toBe('kore wa pendesu.');
    expect(segmentsRomaji(parseFurigana('パンを[食|た]べる。'))).toBe('pan o taberu.');
    expect(segmentsRomaji(parseFurigana('[学校|がっ|こう]に[行|い]きます。'))).toBe('gakkou ni ikimasu.');
    expect(segmentsRomaji(parseFurigana('いい[天気|てん|き]です。'))).toBe('ii tenki desu.');
    expect(segmentsRomaji(parseFurigana('こんにちは'))).toBe('konnichi wa');
  });
});

describe('stroke matching', () => {
  const line: Pt[] = [[20, 50], [90, 50]];
  it('accepts a stroke drawn close to the reference', () => {
    expect(matchStroke([[22, 53], [55, 48], [88, 52]], line)).toBe('ok');
  });
  it('detects a reversed stroke', () => {
    expect(matchStroke([[90, 50], [20, 50]], line)).toBe('reversed');
  });
  it('rejects a stroke in the wrong place', () => {
    expect(matchStroke([[50, 10], [50, 100]], line)).toBe('off');
    expect(matchStroke([[20, 50], [25, 50]], line)).toBe('off');
  });
  it('resamples evenly', () => {
    const r = resample(line, 8);
    expect(r).toHaveLength(8);
    expect(r[0]).toEqual([20, 50]);
    expect(r[7][0]).toBeCloseTo(90);
  });
});

describe('kana content', () => {
  const words = { sokuon_h: [], long_h: [], sokuon_k: [], long_k: [], ext_k: [] };
  it('has the 46 base kana in each script', () => {
    const base = allKana('h').filter((k) => k.char.length === 1 && !/[がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ]/.test(k.char));
    expect(base).toHaveLength(46);
  });
  it('builds units of 10–25 items in each stage and every unit id is unique', () => {
    for (const s of ['h', 'k'] as const) {
      const stage = buildKanaStage(s, words);
      const ids = stage.units.map((u) => u.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const u of stage.units.filter((u) => u.kind === 'kana' || u.kind === 'confusables')) {
        expect(u.items.length).toBeGreaterThanOrEqual(10);
        expect(u.items.length).toBeLessThanOrEqual(25);
      }
    }
  });
  it('every unit kana item resolves to a kana entry', () => {
    for (const s of ['h', 'k'] as const) {
      const known = new Set(allKana(s).map((k) => k.id));
      const stage = buildKanaStage(s, words);
      for (const u of stage.units) for (const id of u.items) if (!id.startsWith('w:')) expect(known.has(id)).toBe(true);
    }
  });
  it('confusable sets use real kana', () => {
    const chars = new Set([...allKana('h'), ...allKana('k')].map((k) => k.char));
    for (const set of [...CONFUSABLES.h, ...CONFUSABLES.k]) for (const c of set) expect(chars.has(c)).toBe(true);
  });
});
