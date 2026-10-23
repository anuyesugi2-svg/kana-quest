import { beforeAll, describe, expect, it } from 'vitest';
import { dueIds, isDue, makeScheduler, newCard, Rating, ratingFor, review, setScheduler, State } from '../src/core/srs';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1, 9);

beforeAll(() => setScheduler(makeScheduler(false)));

describe('SRS scheduling (FSRS)', () => {
  it('new cards are due immediately', () => {
    const c = newCard(T0);
    expect(c.state).toBe(State.New);
    expect(isDue(c, T0)).toBe(true);
  });

  it('Good on a new card schedules a short learning step, then graduates', () => {
    let c = review(newCard(T0), Rating.Good, T0);
    expect(c.state).toBe(State.Learning);
    expect(c.due - T0).toBeLessThan(DAY);
    let t = c.due;
    c = review(c, Rating.Good, t);
    expect(c.state).toBe(State.Review);
    expect(c.due - t).toBeGreaterThanOrEqual(DAY);
  });

  it('intervals grow with successive Good reviews', () => {
    let c = review(newCard(T0), Rating.Good, T0);
    let t = c.due;
    c = review(c, Rating.Good, t);
    const intervals: number[] = [];
    for (let i = 0; i < 4; i++) {
      t = c.due;
      c = review(c, Rating.Good, t);
      intervals.push(c.due - t);
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
  });

  it('Again on a review card sends it to relearning and counts a lapse', () => {
    let c = review(newCard(T0), Rating.Good, T0);
    c = review(c, Rating.Good, c.due);
    c = review(c, Rating.Good, c.due);
    const before = c.lapses;
    c = review(c, Rating.Again, c.due);
    expect(c.state).toBe(State.Relearning);
    expect(c.lapses).toBe(before + 1);
  });

  it('Easy schedules further out than Good, Hard closer', () => {
    const base = review(review(newCard(T0), Rating.Good, T0), Rating.Good, T0 + 600_000);
    const t = base.due;
    const hard = review(base, Rating.Hard, t).due;
    const good = review(base, Rating.Good, t).due;
    const easy = review(base, Rating.Easy, t).due;
    expect(hard).toBeLessThan(good);
    expect(easy).toBeGreaterThan(good);
  });

  it('cards survive a JSON round trip', () => {
    const c = review(newCard(T0), Rating.Good, T0);
    const back = JSON.parse(JSON.stringify(c));
    expect(review(back, Rating.Good, c.due)).toEqual(review(c, Rating.Good, c.due));
  });

  it('maps answers to ratings', () => {
    expect(ratingFor({ correct: false })).toBe(Rating.Again);
    expect(ratingFor({ correct: true, hinted: true })).toBe(Rating.Hard);
    expect(ratingFor({ correct: true, recovered: true })).toBe(Rating.Hard);
    expect(ratingFor({ correct: true })).toBe(Rating.Good);
  });

  it('lists due cards, most overdue first', () => {
    const cards = {
      a: { ...newCard(T0), due: T0 - 3 * DAY },
      b: { ...newCard(T0), due: T0 + DAY },
      c: { ...newCard(T0), due: T0 - DAY },
    };
    expect(dueIds(cards, T0)).toEqual(['a', 'c']);
    expect(dueIds(cards, T0, 1)).toEqual(['a']);
  });
});
