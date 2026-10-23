// Spaced repetition on top of ts-fsrs (FSRS-6). Cards are stored as plain JSON
// (timestamps instead of Date) so progress can be saved and exported.

import { createEmptyCard, fsrs, Rating, State, type Card, type FSRS, type Grade } from 'ts-fsrs';

export { Rating, State };

export interface SrsCard {
  due: number;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: State;
  last_review?: number;
}

export interface AnswerOutcome {
  correct: boolean;
  /** The learner peeked (tapped for romaji) or needed a hint. */
  hinted?: boolean;
  /** The learner got it wrong first and then right within the same session. */
  recovered?: boolean;
}

let scheduler: FSRS = makeScheduler(true);

export function makeScheduler(fuzz: boolean): FSRS {
  return fsrs({ request_retention: 0.9, maximum_interval: 365 * 3, enable_fuzz: fuzz, enable_short_term: true });
}

/** Tests use a deterministic scheduler. */
export function setScheduler(s: FSRS) {
  scheduler = s;
}

function toCard(c: SrsCard): Card {
  return {
    ...c,
    elapsed_days: 0,
    due: new Date(c.due),
    last_review: c.last_review === undefined ? undefined : new Date(c.last_review),
  };
}

function fromCard(c: Card): SrsCard {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review?.getTime(),
  };
}

export function newCard(now: number): SrsCard {
  return fromCard(createEmptyCard(new Date(now)));
}

export function ratingFor(o: AnswerOutcome): Grade {
  if (!o.correct) return Rating.Again;
  if (o.hinted || o.recovered) return Rating.Hard;
  return Rating.Good;
}

export function review(card: SrsCard, rating: Grade, now: number): SrsCard {
  return fromCard(scheduler.next(toCard(card), new Date(now), rating).card);
}

export function isDue(card: SrsCard, now: number): boolean {
  return card.due <= now;
}

/** Due item ids, most overdue first. */
export function dueIds(cards: Record<string, SrsCard>, now: number, limit = Infinity): string[] {
  return Object.entries(cards)
    .filter(([, c]) => c.due <= now)
    .sort((a, b) => a[1].due - b[1].due)
    .slice(0, limit)
    .map(([id]) => id);
}

/** Probability the learner still remembers the card right now (0..1). */
export function retrievability(card: SrsCard, now: number): number {
  if (card.state === State.New) return 0;
  return scheduler.get_retrievability(toCard(card), new Date(now), false) as number;
}

/** A card counts as "known" once it has graduated to Review with ~a week of stability. */
export function isMature(card: SrsCard): boolean {
  return card.state === State.Review && card.stability >= 7;
}
