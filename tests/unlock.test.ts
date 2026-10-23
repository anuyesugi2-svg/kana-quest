import { describe, expect, it } from 'vitest';
import type { Stage } from '../src/core/types';
import {
  applyBossResult,
  applyUnitResult,
  currentUnitIndex,
  isBossUnlocked,
  isStageUnlocked,
  isUnitUnlocked,
  passesBoss,
  passesUnit,
  stageCompletion,
  type UnlockState,
} from '../src/core/unlock';

const stage = (id: Stage['id'], n: number, available = true): Stage => ({
  id,
  title: id,
  jp: '',
  blurb: '',
  available,
  units: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i}`, title: '', subtitle: '', kind: 'kana', items: [] })),
});

const hira = stage('hiragana', 3);
const kata = stage('katakana', 2);
const n4 = stage('n4', 2, false);
const empty = (): UnlockState => ({ units: {}, bosses: {} });

describe('pass thresholds', () => {
  it('unit quiz needs 90%', () => {
    expect(passesUnit(18, 20)).toBe(true);
    expect(passesUnit(17, 20)).toBe(false);
    expect(passesUnit(9, 10)).toBe(true);
    expect(passesUnit(0, 0)).toBe(false);
  });
  it('boss exam needs 85%', () => {
    expect(passesBoss(17, 20)).toBe(true);
    expect(passesBoss(16, 20)).toBe(false);
    expect(passesBoss(34, 40)).toBe(true);
    expect(passesBoss(33, 40)).toBe(false);
  });
});

describe('unlocking', () => {
  it('only the first stage and its first unit start unlocked', () => {
    const s = empty();
    expect(isStageUnlocked(hira, s)).toBe(true);
    expect(isStageUnlocked(kata, s)).toBe(false);
    expect(isUnitUnlocked(hira, 0, s)).toBe(true);
    expect(isUnitUnlocked(hira, 1, s)).toBe(false);
    expect(isBossUnlocked(hira, s)).toBe(false);
  });

  it('passing a unit unlocks the next one; failing does not', () => {
    const s = empty();
    s.units['hiragana-0'] = applyUnitResult(undefined, 17, 20).record;
    expect(isUnitUnlocked(hira, 1, s)).toBe(false);
    s.units['hiragana-0'] = applyUnitResult(s.units['hiragana-0'], 19, 20).record;
    expect(isUnitUnlocked(hira, 1, s)).toBe(true);
    expect(currentUnitIndex(hira, s)).toBe(1);
  });

  it('a later failed attempt never re-locks a passed unit', () => {
    const r1 = applyUnitResult(undefined, 20, 20);
    const r2 = applyUnitResult(r1.record, 5, 20);
    expect(r2.record.passed).toBe(true);
    expect(r2.record.best).toBe(1);
    expect(r2.record.attempts).toBe(2);
    expect(r2.firstPass).toBe(false);
  });

  it('boss unlocks after every unit; graduating unlocks the next stage', () => {
    const s = empty();
    for (const u of hira.units) s.units[u.id] = applyUnitResult(undefined, 10, 10).record;
    expect(isBossUnlocked(hira, s)).toBe(true);
    expect(isStageUnlocked(kata, s)).toBe(false);

    const fail = applyBossResult(undefined, 30, 40, ['h:ぬ', 'h:め', 'h:ぬ']);
    s.bosses.hiragana = fail.record;
    expect(fail.passed).toBe(false);
    expect(fail.record.weak).toEqual(['h:ぬ', 'h:め']);
    expect(isStageUnlocked(kata, s)).toBe(false);

    const pass = applyBossResult(s.bosses.hiragana, 36, 40, []);
    s.bosses.hiragana = pass.record;
    expect(pass.firstPass).toBe(true);
    expect(pass.record.weak).toEqual([]);
    expect(isStageUnlocked(kata, s)).toBe(true);
    expect(isUnitUnlocked(kata, 0, s)).toBe(true);
  });

  it('stages without content stay locked', () => {
    const s = empty();
    s.bosses.n5 = { best: 1, passed: true, attempts: 1, weak: [] };
    expect(isStageUnlocked(n4, s)).toBe(false);
  });

  it('reports completion including the boss', () => {
    const s = empty();
    expect(stageCompletion(hira, s)).toBe(0);
    s.units['hiragana-0'] = applyUnitResult(undefined, 10, 10).record;
    expect(stageCompletion(hira, s)).toBeCloseTo(1 / 4);
    for (const u of hira.units) s.units[u.id] = applyUnitResult(undefined, 10, 10).record;
    s.bosses.hiragana = applyBossResult(undefined, 40, 40, []).record;
    expect(stageCompletion(hira, s)).toBe(1);
  });
});
