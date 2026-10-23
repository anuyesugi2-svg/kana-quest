import type { Content } from '../content/index';
import type { QuizContext } from '../core/quiz';
import type { Item, Stage } from '../core/types';
import { defaultRng } from '../core/rng';
import { speechAvailable } from './speech';
import { getState } from './store';

/** Which stage an item belongs to (first match). */
export function stageOf(content: Content, itemId: string): Stage | undefined {
  return content.stages.find((s) => content.stageItems[s.id]?.includes(itemId));
}

/**
 * Distractor pool for a stage: items from units up to `uptoUnit` (so early quizzes don't
 * show kana you haven't met), topped up from the whole stage when that's too few.
 */
export function stagePool(content: Content, stage: Stage, uptoUnit = stage.units.length - 1): Item[] {
  const ids = new Set(stage.units.slice(0, uptoUnit + 1).flatMap((u) => u.items));
  const all = content.stageItems[stage.id];
  const items = [...ids].map((id) => content.items.get(id)!).filter(Boolean);
  const kinds = new Set(items.map((i) => i.kind));
  for (const kind of kinds) {
    if (items.filter((i) => i.kind === kind).length < 8) {
      for (const id of all) {
        const it = content.items.get(id);
        if (it && it.kind === kind && !ids.has(id)) items.push(it);
      }
    }
  }
  return items;
}

export function makeCtx(content: Content, pool: Item[]): QuizContext {
  const { strokes, progress } = getState();
  return {
    items: content.items,
    grammar: content.grammar,
    passages: content.passages,
    pool,
    confusables: content.confusables,
    listening: speechAvailable(),
    writing: progress.settings.writingInQuizzes && Object.keys(strokes).length > 0,
    hasStrokes: (c) => !!getState().strokes[c],
    rng: defaultRng,
  };
}
