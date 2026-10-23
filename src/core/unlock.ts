// Graduation rules: units unlock in order (pass the previous unit quiz with >= 90%),
// the boss exam unlocks when every unit is passed, and passing the boss (>= 85%)
// graduates the stage and unlocks the next one.

import type { Stage, StageId } from './types';
import { STAGE_ORDER } from './types';

export const UNIT_PASS = 0.9;
export const BOSS_PASS = 0.85;

export interface UnitRecord {
  best: number; // best score 0..1
  passed: boolean;
  attempts: number;
}

export interface BossRecord {
  best: number;
  passed: boolean;
  attempts: number;
  /** Item ids missed on the latest failed attempt, for the weak-item drill. */
  weak: string[];
}

export interface UnlockState {
  units: Record<string, UnitRecord>;
  bosses: Partial<Record<StageId, BossRecord>>;
}

export function passesUnit(correct: number, total: number): boolean {
  return total > 0 && correct / total >= UNIT_PASS - 1e-9;
}

export function passesBoss(correct: number, total: number): boolean {
  return total > 0 && correct / total >= BOSS_PASS - 1e-9;
}

export function isStageGraduated(stageId: StageId, s: UnlockState): boolean {
  return !!s.bosses[stageId]?.passed;
}

export function isStageUnlocked(stage: Stage, s: UnlockState): boolean {
  if (!stage.available) return false;
  const i = STAGE_ORDER.indexOf(stage.id);
  return i === 0 || isStageGraduated(STAGE_ORDER[i - 1], s);
}

export function isUnitUnlocked(stage: Stage, unitIndex: number, s: UnlockState): boolean {
  if (!isStageUnlocked(stage, s)) return false;
  if (unitIndex === 0) return true;
  return !!s.units[stage.units[unitIndex - 1].id]?.passed;
}

export function isBossUnlocked(stage: Stage, s: UnlockState): boolean {
  return isStageUnlocked(stage, s) && stage.units.every((u) => s.units[u.id]?.passed);
}

/** Index of the first unit not yet passed (units.length when all are passed). */
export function currentUnitIndex(stage: Stage, s: UnlockState): number {
  const i = stage.units.findIndex((u) => !s.units[u.id]?.passed);
  return i === -1 ? stage.units.length : i;
}

/** 0..1: units passed, with the boss counted as one more step. */
export function stageCompletion(stage: Stage, s: UnlockState): number {
  const steps = stage.units.length + 1;
  const done = stage.units.filter((u) => s.units[u.id]?.passed).length + (isStageGraduated(stage.id, s) ? 1 : 0);
  return steps ? done / steps : 0;
}

/** Record a unit quiz result; returns the updated record and whether this was a first pass. */
export function applyUnitResult(prev: UnitRecord | undefined, correct: number, total: number) {
  const score = total ? correct / total : 0;
  const passed = passesUnit(correct, total);
  const record: UnitRecord = {
    best: Math.max(prev?.best ?? 0, score),
    passed: (prev?.passed ?? false) || passed,
    attempts: (prev?.attempts ?? 0) + 1,
  };
  return { record, passed, firstPass: passed && !prev?.passed };
}

export function applyBossResult(prev: BossRecord | undefined, correct: number, total: number, missed: string[]) {
  const score = total ? correct / total : 0;
  const passed = passesBoss(correct, total);
  const record: BossRecord = {
    best: Math.max(prev?.best ?? 0, score),
    passed: (prev?.passed ?? false) || passed,
    attempts: (prev?.attempts ?? 0) + 1,
    weak: passed ? [] : [...new Set(missed)],
  };
  return { record, passed, firstPass: passed && !prev?.passed };
}
