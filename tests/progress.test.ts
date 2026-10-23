import { beforeAll, describe, expect, it } from 'vitest';
import {
  addXp,
  awardBadges,
  currentStreak,
  dayKey,
  defaultProgress,
  enrollItems,
  exportProgress,
  importProgress,
  noteAnswer,
  playerLevel,
  recordUnit,
} from '../src/core/progress';
import { makeScheduler, setScheduler } from '../src/core/srs';

const DAY = 86_400_000;
const T0 = new Date(2026, 0, 10, 12).getTime();

beforeAll(() => setScheduler(makeScheduler(false)));

describe('XP and streak', () => {
  it('meeting the daily goal on consecutive days grows the streak', () => {
    const p = defaultProgress(T0);
    p.settings.dailyGoal = 20;
    expect(addXp(p, 10, T0)).toBe(false);
    expect(p.streak.current).toBe(0);
    expect(addXp(p, 10, T0)).toBe(true);
    expect(p.streak.current).toBe(1);
    addXp(p, 50, T0); // more XP the same day doesn't double count
    expect(p.streak.current).toBe(1);
    addXp(p, 20, T0 + DAY);
    expect(p.streak.current).toBe(2);
    expect(currentStreak(p, T0 + DAY)).toBe(2);
    expect(p.xpTotal).toBe(90);
  });

  it('missing a day resets the streak', () => {
    const p = defaultProgress(T0);
    p.settings.dailyGoal = 10;
    addXp(p, 10, T0);
    addXp(p, 10, T0 + DAY);
    expect(currentStreak(p, T0 + 3 * DAY)).toBe(0);
    addXp(p, 10, T0 + 3 * DAY);
    expect(p.streak.current).toBe(1);
    expect(p.streak.best).toBe(2);
  });

  it('uses local calendar days', () => {
    expect(dayKey(new Date(2026, 2, 5, 23, 59).getTime())).toBe('2026-03-05');
  });

  it('computes player level', () => {
    expect(playerLevel(0).level).toBe(1);
    expect(playerLevel(49).level).toBe(1);
    expect(playerLevel(50).level).toBe(2);
    expect(playerLevel(150).level).toBe(3);
  });
});

describe('mistakes notebook', () => {
  it('records misses and clears after 3 correct in a row', () => {
    const p = defaultProgress(T0);
    noteAnswer(p, 'h:ぬ', false, T0);
    noteAnswer(p, 'h:ぬ', false, T0);
    expect(p.mistakes['h:ぬ'].count).toBe(2);
    noteAnswer(p, 'h:ぬ', true, T0);
    noteAnswer(p, 'h:ぬ', true, T0);
    expect(p.mistakes['h:ぬ']).toBeDefined();
    noteAnswer(p, 'h:ぬ', false, T0); // a miss resets the run
    noteAnswer(p, 'h:ぬ', true, T0);
    noteAnswer(p, 'h:ぬ', true, T0);
    noteAnswer(p, 'h:ぬ', true, T0);
    expect(p.mistakes['h:ぬ']).toBeUndefined();
  });

  it('correct answers on items never missed add nothing', () => {
    const p = defaultProgress(T0);
    noteAnswer(p, 'h:あ', true, T0);
    expect(p.mistakes).toEqual({});
  });
});

describe('enrolment and badges', () => {
  it('enrols unit items into SRS once', () => {
    const p = defaultProgress(T0);
    enrollItems(p, { 'h:あ': { correct: true }, 'h:い': { correct: false } }, T0);
    expect(Object.keys(p.cards)).toEqual(['h:あ', 'h:い']);
    const before = p.cards['h:あ'];
    enrollItems(p, { 'h:あ': { correct: false } }, T0 + DAY);
    expect(p.cards['h:あ']).toEqual(before);
    expect(p.cards['h:い'].due).toBeLessThanOrEqual(p.cards['h:あ'].due);
  });

  it('awards badges once', () => {
    const p = defaultProgress(T0);
    recordUnit(p, 'h-vowels-k', 10, 10);
    expect(awardBadges(p, T0).map((b) => b.id)).toContain('first-unit');
    expect(awardBadges(p, T0)).toEqual([]);
  });
});

describe('export / import', () => {
  it('round-trips progress', () => {
    const p = defaultProgress(T0);
    addXp(p, 30, T0);
    recordUnit(p, 'h-vowels-k', 9, 10);
    enrollItems(p, { 'h:あ': { correct: true } }, T0);
    const back = importProgress(exportProgress(p));
    expect(back).toEqual(p);
  });

  it('rejects files that are not exports', () => {
    expect(() => importProgress('nope')).toThrow(/not valid JSON/);
    expect(() => importProgress('{"foo":1}')).toThrow(/not a Kana Quest/);
  });

  it('fills in missing fields from older exports', () => {
    const back = importProgress(JSON.stringify({ app: 'kana-quest', progress: { xpTotal: 12, settings: { sound: false } } }));
    expect(back.xpTotal).toBe(12);
    expect(back.settings.sound).toBe(false);
    expect(back.settings.dailyGoal).toBe(50);
    expect(back.cards).toEqual({});
  });
});
