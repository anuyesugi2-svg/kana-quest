import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assembleContent, type Content } from '../src/content/index';
import { furiText, parseFurigana } from '../src/core/furigana';
import { bossQuiz, practiceQuiz, unitQuiz, type QuizContext } from '../src/core/quiz';
import { mulberry32 } from '../src/core/rng';

const data = (p: string) => JSON.parse(readFileSync(resolve(__dirname, '../public/data', p), 'utf8'));
const content: Content = assembleContent(
  data('kana-words.json'),
  data('n5/vocab.json'),
  data('n5/kanji.json'),
  data('n5/sentences.json'),
  data('n5/reading.json'),
);

function ctx(seed: number, pool: string[]): QuizContext {
  return {
    items: content.items,
    grammar: content.grammar,
    passages: content.passages,
    pool: pool.map((id) => content.items.get(id)!),
    confusables: content.confusables,
    listening: true,
    writing: true,
    hasStrokes: () => true,
    rng: mulberry32(seed),
  };
}

describe('assembled content', () => {
  it('has the expected stages, with N4–N1 locked for now', () => {
    expect(content.stages.map((s) => s.id)).toEqual(['hiragana', 'katakana', 'n5', 'n4', 'n3', 'n2', 'n1']);
    expect(content.stages.filter((s) => s.available).map((s) => s.id)).toEqual(['hiragana', 'katakana', 'n5']);
  });

  it('every unit item resolves to an item', () => {
    for (const s of content.stages) for (const u of s.units) for (const id of u.items) expect(content.items.has(id), `${u.id}: ${id}`).toBe(true);
  });

  it('units are short (≤ 25 items) and ids unique', () => {
    const ids = content.stages.flatMap((s) => s.units.map((u) => u.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of content.stages) for (const u of s.units) expect(u.items.length, u.id).toBeLessThanOrEqual(25);
  });

  it('N5 covers all vocabulary, kanji and grammar', () => {
    const n5 = content.stages.find((s) => s.id === 'n5')!;
    const items = new Set(n5.units.flatMap((u) => u.items));
    const vocab = data('n5/vocab.json') as { id: string }[];
    const kanji = data('n5/kanji.json') as { id: string }[];
    expect(vocab.every((v) => items.has(v.id))).toBe(true);
    expect(kanji.every((k) => items.has(k.id))).toBe(true);
    expect(Object.keys(content.grammar).every((g) => items.has(`g:${g}`))).toBe(true);
  });
});

describe('grammar content', () => {
  const allFuri: string[] = [];
  for (const g of Object.values(content.grammar)) {
    allFuri.push(...g.examples.map((e) => e.jp));
    for (const q of g.practice) {
      if (q.t === 'blank') allFuri.push(q.jp, ...q.options);
      if (q.t === 'tiles') allFuri.push(...q.tiles, ...(q.extra ?? []));
      if (q.t === 'choice') allFuri.push(...(q.jp ? [q.jp] : []), ...(q.optionsJp === false ? [] : q.options));
    }
  }

  it('every point has 3+ examples, mistakes and practice', () => {
    for (const g of Object.values(content.grammar)) {
      expect(g.examples.length, g.id).toBeGreaterThanOrEqual(3);
      expect(g.mistakes.length, g.id).toBeGreaterThanOrEqual(1);
      expect(g.practice.length, g.id).toBeGreaterThanOrEqual(5);
    }
  });

  it('practice questions are well formed', () => {
    for (const g of Object.values(content.grammar)) {
      for (const q of g.practice) {
        if (q.t === 'blank') {
          expect(q.jp, g.id).toContain('＿');
          expect(q.options, g.id).toContain(q.answer);
          expect(new Set(q.options).size, g.id).toBe(q.options.length);
        }
        if (q.t === 'choice') {
          expect(q.options, `${g.id}: ${q.prompt}`).toContain(q.answer);
          expect(new Set(q.options).size, g.id).toBe(q.options.length);
        }
        if (q.t === 'tiles') {
          expect(q.tiles.length, g.id).toBeGreaterThanOrEqual(2);
          for (const e of q.extra ?? []) expect(q.tiles, g.id).not.toContain(e);
        }
      }
    }
  });

  it('furigana markup is balanced and never leaks into display text', () => {
    for (const f of allFuri) {
      const text = furiText(f);
      expect(text, f).not.toMatch(/[[\]|_]/);
      expect(parseFurigana(f).length, f).toBeGreaterThan(0);
    }
  });

  it('reading passages have answerable questions', () => {
    for (const p of Object.values(content.passages)) {
      expect(p.lines.length).toBeGreaterThanOrEqual(4);
      for (const q of p.questions) expect(q.options).toContain(q.answer);
    }
  });
});

describe('quiz generation over real content', () => {
  it('every unit produces a valid quiz', () => {
    let seed = 1;
    for (const s of content.stages) {
      for (const u of s.units) {
        const qs = unitQuiz(u, ctx(seed++, content.stageItems[s.id]));
        expect(qs.length, u.id).toBeGreaterThanOrEqual(Math.min(10, u.items.length));
        for (const q of qs) {
          if (q.answer.t === 'choice') {
            const labels = q.answer.options.map((o) => o.label);
            expect(new Set(labels).size, `${u.id} ${q.mode}`).toBe(labels.length);
            expect(q.answer.correct, `${u.id} ${q.mode}`).toBeGreaterThanOrEqual(0);
            expect(labels.length, `${u.id} ${q.mode} ${q.itemId}`).toBeGreaterThanOrEqual(2);
          }
        }
        expect(qs.filter((q) => q.mode === 'trace').length).toBeLessThanOrEqual(2);
        for (let i = 1; i < qs.length; i++) {
          if (qs.length > 3 && new Set(qs.map((q) => q.itemId)).size > 1 && u.kind !== 'reading') {
            // Same item twice in a row should be rare; allow at the very end only.
            if (qs[i].itemId === qs[i - 1].itemId) expect(i).toBeGreaterThan(qs.length - 3);
          }
        }
      }
    }
  });

  it('boss exams sample the whole stage without writing questions', () => {
    for (const s of content.stages.filter((s) => s.available)) {
      const ids = content.stageItems[s.id].filter((i) => !i.startsWith('p:'));
      const qs = bossQuiz(ids, ids.slice(0, 3), ctx(7, ids), 30);
      expect(qs).toHaveLength(30);
      expect(qs.some((q) => q.mode === 'trace')).toBe(false);
      for (const w of ids.slice(0, 3)) expect(qs.some((q) => q.itemId === w)).toBe(true);
    }
  });

  it('review sessions give one question per item', () => {
    const ids = ['h:あ', 'k:シ', 'v:1578850', 'j:日', 'g:desu'].filter((i) => content.items.has(i));
    expect(practiceQuiz(ids, 'review', ctx(3, content.stageItems.n5.concat(content.stageItems.hiragana))).map((q) => q.itemId).sort()).toEqual([...ids].sort());
  });
});
