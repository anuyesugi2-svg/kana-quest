// Everything saved on the device. Functions here mutate the Progress object passed in;
// the store wraps them and persists afterwards.

import type { StageId } from './types';
import type { BossRecord, UnitRecord } from './unlock';
import { applyBossResult, applyUnitResult } from './unlock';
import { newCard, ratingFor, review, type AnswerOutcome, type SrsCard, isMature } from './srs';

export const PROGRESS_VERSION = 1;

export interface Settings {
  sound: boolean;
  animations: boolean;
  romajiAssist: boolean;
  dailyGoal: number; // XP per day
  theme: 'system' | 'light' | 'dark';
  speechRate: number; // 0.5..1.2
  writingInQuizzes: boolean;
}

export interface MistakeEntry {
  count: number;
  last: number; // timestamp
  streak: number; // correct answers in a row since the last mistake
}

export interface Progress {
  version: number;
  createdAt: number;
  units: Record<string, UnitRecord>;
  bosses: Partial<Record<StageId, BossRecord>>;
  cards: Record<string, SrsCard>;
  mistakes: Record<string, MistakeEntry>;
  xpTotal: number;
  xpByDay: Record<string, number>;
  streak: { current: number; best: number; lastDay: string | null };
  badges: Record<string, number>; // badge id -> earned timestamp
  bestCombo: number;
  grammarSeen: string[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  animations: true,
  romajiAssist: true,
  dailyGoal: 50,
  theme: 'system',
  speechRate: 0.9,
  writingInQuizzes: true,
};

export const DAILY_GOALS = [20, 50, 100, 150];

export const XP = {
  correct: 2,
  review: 2,
  unitFirstPass: 20,
  unitRepeatPass: 5,
  perfectBonus: 10,
  bossPass: 100,
  drill: 1,
};

/** Mistakes leave the notebook after this many correct answers in a row. */
export const NOTEBOOK_CLEAR_STREAK = 3;

export function defaultProgress(now = Date.now()): Progress {
  return {
    version: PROGRESS_VERSION,
    createdAt: now,
    units: {},
    bosses: {},
    cards: {},
    mistakes: {},
    xpTotal: 0,
    xpByDay: {},
    streak: { current: 0, best: 0, lastDay: null },
    badges: {},
    bestCombo: 0,
    grammarSeen: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

// ------------------------------------------------------------------ days

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n, 12).getTime());
}

// ------------------------------------------------------------------ XP & streak

export function todayXp(p: Progress, now: number): number {
  return p.xpByDay[dayKey(now)] ?? 0;
}

/** Adds XP; the streak grows on the first day-goal completion of each day. Returns true if the goal was just met. */
export function addXp(p: Progress, amount: number, now: number): boolean {
  if (amount <= 0) return false;
  const day = dayKey(now);
  const before = p.xpByDay[day] ?? 0;
  p.xpByDay[day] = before + amount;
  p.xpTotal += amount;
  const goal = p.settings.dailyGoal;
  if (before < goal && before + amount >= goal) {
    if (p.streak.lastDay !== day) {
      p.streak.current = p.streak.lastDay === addDays(day, -1) ? p.streak.current + 1 : 1;
      p.streak.lastDay = day;
      p.streak.best = Math.max(p.streak.best, p.streak.current);
    }
    return true;
  }
  return false;
}

/** Streak as it stands today: still alive if the goal was met today or yesterday. */
export function currentStreak(p: Progress, now: number): number {
  const today = dayKey(now);
  if (p.streak.lastDay === today || p.streak.lastDay === addDays(today, -1)) return p.streak.current;
  return 0;
}

export function playerLevel(xp: number): { level: number; into: number; span: number } {
  // Level n needs 25*n*(n-1) XP in total: 0, 50, 150, 300, 500, ...
  let level = 1;
  while (25 * (level + 1) * level <= xp) level++;
  const base = 25 * level * (level - 1);
  return { level, into: xp - base, span: 50 * level };
}

// ------------------------------------------------------------------ answers

/** Records an answer in the mistakes notebook (any mode). */
export function noteAnswer(p: Progress, itemId: string, correct: boolean, now: number) {
  const m = p.mistakes[itemId];
  if (!correct) {
    p.mistakes[itemId] = { count: (m?.count ?? 0) + 1, last: now, streak: 0 };
  } else if (m) {
    m.streak += 1;
    if (m.streak >= NOTEBOOK_CLEAR_STREAK) delete p.mistakes[itemId];
  }
}

/** Updates (or creates) the SRS card for an item. */
export function srsAnswer(p: Progress, itemId: string, outcome: AnswerOutcome, now: number) {
  const card = p.cards[itemId] ?? newCard(now);
  p.cards[itemId] = review(card, ratingFor(outcome), now);
}

/** Items enter spaced repetition when their unit is first passed. */
export function enrollItems(p: Progress, results: Record<string, AnswerOutcome>, now: number) {
  for (const [id, outcome] of Object.entries(results)) {
    if (!p.cards[id]) srsAnswer(p, id, outcome, now);
  }
}

export function recordUnit(p: Progress, unitId: string, correct: number, total: number) {
  const r = applyUnitResult(p.units[unitId], correct, total);
  p.units[unitId] = r.record;
  return r;
}

export function recordBoss(p: Progress, stage: StageId, correct: number, total: number, missed: string[]) {
  const r = applyBossResult(p.bosses[stage], correct, total, missed);
  p.bosses[stage] = r.record;
  return r;
}

export function learnedCount(p: Progress): number {
  return Object.keys(p.cards).length;
}

export function matureCount(p: Progress): number {
  return Object.values(p.cards).filter(isMature).length;
}

// ------------------------------------------------------------------ badges

export interface BadgeDef {
  id: string;
  icon: string;
  title: string;
  desc: string;
  test: (p: Progress, now: number) => boolean;
}

const graduated = (s: StageId) => (p: Progress) => !!p.bosses[s]?.passed;

export const BADGES: BadgeDef[] = [
  { id: 'first-unit', icon: '🌱', title: 'First Steps', desc: 'Pass your first unit', test: (p) => Object.values(p.units).some((u) => u.passed) },
  { id: 'grad-hiragana', icon: 'あ', title: 'Hiragana Graduate', desc: 'Pass the hiragana boss exam', test: graduated('hiragana') },
  { id: 'grad-katakana', icon: 'ア', title: 'Katakana Graduate', desc: 'Pass the katakana boss exam', test: graduated('katakana') },
  { id: 'grad-n5', icon: '五', title: 'N5 Graduate', desc: 'Pass the N5 boss exam', test: graduated('n5') },
  { id: 'grad-n4', icon: '四', title: 'N4 Graduate', desc: 'Pass the N4 boss exam', test: graduated('n4') },
  { id: 'grad-n3', icon: '三', title: 'N3 Graduate', desc: 'Pass the N3 boss exam', test: graduated('n3') },
  { id: 'grad-n2', icon: '二', title: 'N2 Graduate', desc: 'Pass the N2 boss exam', test: graduated('n2') },
  { id: 'grad-n1', icon: '一', title: 'N1 Graduate', desc: 'Pass the N1 boss exam', test: graduated('n1') },
  { id: 'streak-3', icon: '🔥', title: 'On a Roll', desc: '3-day streak', test: (p) => p.streak.best >= 3 },
  { id: 'streak-7', icon: '📅', title: 'One Week', desc: '7-day streak', test: (p) => p.streak.best >= 7 },
  { id: 'streak-30', icon: '🏯', title: 'Dedicated', desc: '30-day streak', test: (p) => p.streak.best >= 30 },
  { id: 'learned-100', icon: '💯', title: 'Hundred', desc: 'Learn 100 items', test: (p) => learnedCount(p) >= 100 },
  { id: 'learned-500', icon: '📚', title: 'Bookworm', desc: 'Learn 500 items', test: (p) => learnedCount(p) >= 500 },
  { id: 'combo-20', icon: '⚡', title: 'Lightning', desc: 'Reach a 20× combo in a speed round', test: (p) => p.bestCombo >= 20 },
  { id: 'xp-1000', icon: '⭐', title: 'Star Student', desc: 'Earn 1,000 XP', test: (p) => p.xpTotal >= 1000 },
];

/** Awards any newly earned badges and returns them. */
export function awardBadges(p: Progress, now: number): BadgeDef[] {
  const earned: BadgeDef[] = [];
  for (const b of BADGES) {
    if (!p.badges[b.id] && b.test(p, now)) {
      p.badges[b.id] = now;
      earned.push(b);
    }
  }
  return earned;
}

// ------------------------------------------------------------------ import / export

export function exportProgress(p: Progress): string {
  return JSON.stringify({ app: 'kana-quest', exportedAt: new Date().toISOString(), progress: p }, null, 1);
}

/** Parses an exported file. Throws with a readable message if it isn't valid. */
export function importProgress(text: string): Progress {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const obj = data as { app?: string; progress?: Partial<Progress> };
  if (!obj || obj.app !== 'kana-quest' || typeof obj.progress !== 'object' || !obj.progress) {
    throw new Error('That file is not a Kana Quest progress export.');
  }
  return migrate(obj.progress);
}

/** Fills in anything missing (older versions, partial data) with defaults. */
export function migrate(raw: Partial<Progress>): Progress {
  const base = defaultProgress(raw.createdAt ?? Date.now());
  const isObj = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);
  if ((raw.version ?? 0) > PROGRESS_VERSION) {
    throw new Error('This file was made by a newer version of Kana Quest. Update the app first.');
  }
  return {
    ...base,
    units: isObj(raw.units) ? raw.units! : {},
    bosses: isObj(raw.bosses) ? raw.bosses! : {},
    cards: isObj(raw.cards) ? raw.cards! : {},
    mistakes: isObj(raw.mistakes) ? raw.mistakes! : {},
    xpTotal: Number(raw.xpTotal) || 0,
    xpByDay: isObj(raw.xpByDay) ? raw.xpByDay! : {},
    streak: isObj(raw.streak) ? { ...base.streak, ...raw.streak } : base.streak,
    badges: isObj(raw.badges) ? raw.badges! : {},
    bestCombo: Number(raw.bestCombo) || 0,
    grammarSeen: Array.isArray(raw.grammarSeen) ? raw.grammarSeen : [],
    settings: { ...DEFAULT_SETTINGS, ...(isObj(raw.settings) ? raw.settings : {}) },
    version: PROGRESS_VERSION,
  };
}
