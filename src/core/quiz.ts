// Turns content items into questions. Pure apart from the RNG, so it's unit-tested.

import { furiText, parseFurigana, segmentsReading, segmentsRomaji } from './furigana';
import { hasKanji, kanaToRomaji } from './romaji';
import { pick, shuffle, type Rng } from './rng';
import type {
  GrammarPoint,
  GrammarQuestion,
  Item,
  KanaItem,
  KanjiItem,
  Passage,
  PassageQuestionItem,
  SentenceItem,
  Unit,
  WordItem,
} from './types';

export type Mode =
  | 'read-type' // see kana/word -> type romaji
  | 'read-choice' // see kana/word -> pick romaji
  | 'pick-kana' // see romaji -> pick kana
  | 'listen' // hear -> pick what was said
  | 'trace' // write with stroke order
  | 'confusable' // look-alike drill
  | 'meaning-choice' // see word/kanji -> pick meaning
  | 'meaning-type' // see word -> type meaning
  | 'word-choice' // see meaning -> pick word/kanji
  | 'reading-type' // see kanji word -> type its reading (live kana input)
  | 'produce' // see meaning -> type the word in Japanese (live kana input)
  | 'reading-choice' // see kanji -> pick a reading
  | 'grammar'
  | 'translate' // read a sentence -> pick the translation
  | 'listen-sentence' // hear a sentence -> pick it
  | 'passage';

export type Prompt =
  | { t: 'jp'; text: string; furi?: string; size?: 'xl' | 'lg' | 'md' }
  | { t: 'en'; text: string; sub?: string }
  | { t: 'audio'; say: string }
  | { t: 'blank'; furi: string; en: string }
  | { t: 'passage'; passageId: string; q: string };

export interface Option {
  label: string;
  jp: boolean;
}

export type Answer =
  | { t: 'choice'; options: Option[]; correct: number }
  | { t: 'romaji'; kana: string; alts?: string[] }
  | { t: 'kana'; expect: string[]; script: 'h' | 'k' }
  | { t: 'meaning'; meanings: string[] }
  | { t: 'trace'; char: string }
  | { t: 'tiles'; tiles: string[]; answer: string[] };

export interface Reveal {
  jp?: string;
  furi?: string;
  reading?: string;
  romaji?: string;
  meaning?: string;
  note?: string;
}

export interface Question {
  key: string;
  itemId: string;
  mode: Mode;
  instruction: string;
  prompt: Prompt;
  answer: Answer;
  reveal: Reveal;
  /** Japanese to speak (listening prompt, or the "play" button after answering). */
  speak?: string;
}

export type Purpose = 'learn' | 'review' | 'boss' | 'speed' | 'drill';

export interface QuizContext {
  items: Map<string, Item>;
  grammar: Record<string, GrammarPoint>;
  passages: Record<string, Passage>;
  /** Items the distractors may come from (same stage / already learned). */
  pool: Item[];
  confusables: string[][];
  listening: boolean;
  writing: boolean;
  hasStrokes: (char: string) => boolean;
  rng: Rng;
}

let keySeq = 0;
const key = () => `q${++keySeq}`;

// ------------------------------------------------------------------ helpers

export function shortMeaning(m: string): string {
  return m.split(';')[0].trim();
}

function wordReveal(w: WordItem): Reveal {
  return { jp: w.jp, reading: w.reading, romaji: kanaToRomaji(w.reading), meaning: w.meanings.map(shortMeaning).slice(0, 3).join(', ') };
}

function kanjiReveal(k: KanjiItem): Reveal {
  return {
    jp: k.char,
    meaning: k.meanings.join(', '),
    note: [k.on.length ? `on: ${k.on.join('、')}` : '', k.kun.length ? `kun: ${k.kun.join('、')}` : ''].filter(Boolean).join('   '),
  };
}

/** Builds a choice answer with up to 3 distractors, de-duplicated by label. */
function choice(correct: Option, distractors: Option[], rng: Rng, n = 4): { t: 'choice'; options: Option[]; correct: number } {
  const seen = new Set([correct.label]);
  const picked: Option[] = [];
  for (const d of distractors) {
    if (picked.length >= n - 1) break;
    if (!seen.has(d.label)) {
      seen.add(d.label);
      picked.push(d);
    }
  }
  const options = shuffle([correct, ...picked], rng);
  return { t: 'choice', options, correct: options.indexOf(correct) };
}

function sameKind<T extends Item>(ctx: QuizContext, item: T, filter: (i: T) => boolean = () => true): T[] {
  return shuffle(
    ctx.pool.filter((i) => i.kind === item.kind && i.id !== item.id && filter(i as T)) as T[],
    ctx.rng,
  );
}

function confusablePartners(ctx: QuizContext, char: string): string[] {
  return ctx.confusables.filter((set) => set.includes(char)).flat().filter((c) => c !== char);
}

const kanjiReadingLabel = (r: string) => r.replace(/^-|-$/g, '').replace('.', '(') + (r.includes('.') ? ')' : '');

// ------------------------------------------------------------------ per-kind generators

function kanaQuestion(item: KanaItem, mode: Mode, ctx: QuizContext): Question {
  const reveal: Reveal = { jp: item.char, romaji: item.romaji + (item.alts?.length && item.char.match(/[をヲ]/) ? ' (o)' : '') };
  const others = sameKind(ctx, item, (k) => k.script === item.script);
  const partners = confusablePartners(ctx, item.char);
  const partnerItems = partners.map((c) => others.find((o) => o.char === c)).filter(Boolean) as KanaItem[];
  const distract = [...partnerItems, ...others];
  const base = { key: key(), itemId: item.id, mode, reveal, speak: item.char };
  switch (mode) {
    case 'read-type':
      return { ...base, instruction: 'Type the romaji', prompt: { t: 'jp', text: item.char, size: 'xl' }, answer: { t: 'romaji', kana: item.char, alts: item.alts } };
    case 'read-choice':
    case 'confusable': {
      const pool = mode === 'confusable' && partnerItems.length ? [...partnerItems, ...others] : distract;
      return {
        ...base,
        instruction: mode === 'confusable' ? 'Look closely: which sound is this?' : 'Pick the romaji',
        prompt: { t: 'jp', text: item.char, size: 'xl' },
        answer: choice({ label: item.romaji, jp: false }, pool.map((o) => ({ label: o.romaji, jp: false })), ctx.rng),
      };
    }
    case 'pick-kana':
      return {
        ...base,
        instruction: `Which one is “${item.romaji}”?`,
        prompt: { t: 'en', text: item.romaji },
        answer: choice({ label: item.char, jp: true }, distract.map((o) => ({ label: o.char, jp: true })), ctx.rng),
      };
    case 'listen':
      return {
        ...base,
        instruction: 'What did you hear?',
        prompt: { t: 'audio', say: item.char },
        answer: choice({ label: item.char, jp: true }, distract.map((o) => ({ label: o.char, jp: true })), ctx.rng),
      };
    case 'trace':
      return { ...base, instruction: `Write ${item.char} (${item.romaji})`, prompt: { t: 'en', text: item.romaji }, answer: { t: 'trace', char: item.char } };
    default:
      return kanaQuestion(item, 'read-choice', ctx);
  }
}

function wordQuestion(item: WordItem, mode: Mode, ctx: QuizContext): Question {
  const reveal = wordReveal(item);
  const others = sameKind(ctx, item, (w) => w.script === item.script);
  const base = { key: key(), itemId: item.id, mode, reveal, speak: item.reading };
  const m0 = shortMeaning(item.meanings[0]);
  switch (mode) {
    case 'read-type':
      return {
        ...base,
        instruction: 'Type it in romaji',
        prompt: { t: 'jp', text: item.reading, size: 'lg' },
        answer: { t: 'romaji', kana: item.reading },
      };
    case 'read-choice':
      return {
        ...base,
        instruction: 'Pick the romaji',
        prompt: { t: 'jp', text: item.reading, size: 'lg' },
        answer: choice({ label: kanaToRomaji(item.reading), jp: false }, others.map((o) => ({ label: kanaToRomaji(o.reading), jp: false })), ctx.rng),
      };
    case 'meaning-choice':
      return {
        ...base,
        instruction: 'What does it mean?',
        prompt: { t: 'jp', text: item.jp, size: 'lg' },
        answer: choice({ label: m0, jp: false }, others.map((o) => ({ label: shortMeaning(o.meanings[0]), jp: false })), ctx.rng),
      };
    case 'meaning-type':
      return {
        ...base,
        instruction: 'Type the meaning in English',
        prompt: { t: 'jp', text: item.jp, size: 'lg' },
        answer: { t: 'meaning', meanings: item.meanings },
      };
    case 'word-choice':
      return {
        ...base,
        instruction: 'Pick the Japanese',
        prompt: { t: 'en', text: m0 },
        answer: choice({ label: item.jp, jp: true }, others.filter((o) => shortMeaning(o.meanings[0]) !== m0).map((o) => ({ label: o.jp, jp: true })), ctx.rng),
      };
    case 'reading-type':
      return {
        ...base,
        instruction: 'Type the reading (romaji turns into kana)',
        prompt: { t: 'jp', text: item.jp, size: 'lg' },
        answer: { t: 'kana', expect: [item.reading], script: 'h' },
      };
    case 'produce':
      return {
        ...base,
        instruction: 'Type it in Japanese (romaji turns into kana)',
        prompt: { t: 'en', text: m0, sub: item.meanings.length > 1 ? shortMeaning(item.meanings[1]) : undefined },
        answer: { t: 'kana', expect: [item.reading], script: /^[゠-ヿ]+$/.test(item.reading) ? 'k' : 'h' },
      };
    case 'listen': {
      const vocab = item.id.startsWith('v:');
      return {
        ...base,
        instruction: vocab ? 'What does the word you hear mean?' : 'What did you hear?',
        prompt: { t: 'audio', say: item.reading },
        answer: vocab
          ? choice({ label: m0, jp: false }, others.map((o) => ({ label: shortMeaning(o.meanings[0]), jp: false })), ctx.rng)
          : choice({ label: item.reading, jp: true }, others.map((o) => ({ label: o.reading, jp: true })), ctx.rng),
      };
    }
    default:
      return wordQuestion(item, 'meaning-choice', ctx);
  }
}

function kanjiQuestion(item: KanjiItem, mode: Mode, ctx: QuizContext): Question {
  const reveal = kanjiReveal(item);
  const others = sameKind(ctx, item);
  const base = { key: key(), itemId: item.id, mode, reveal };
  const m0 = item.meanings[0];
  switch (mode) {
    case 'meaning-choice':
      return {
        ...base,
        instruction: 'What does this kanji mean?',
        prompt: { t: 'jp', text: item.char, size: 'xl' },
        answer: choice({ label: m0, jp: false }, others.map((o) => ({ label: o.meanings[0], jp: false })), ctx.rng),
      };
    case 'word-choice':
      return {
        ...base,
        instruction: `Which kanji means “${m0}”?`,
        prompt: { t: 'en', text: m0 },
        answer: choice({ label: item.char, jp: true }, others.map((o) => ({ label: o.char, jp: true })), ctx.rng),
      };
    case 'reading-choice': {
      const useOn = item.kun.length === 0 || (item.on.length > 0 && ctx.rng() < 0.5);
      const list = useOn ? item.on : item.kun;
      const correct = kanjiReadingLabel(pick(list, ctx.rng));
      const mine = new Set([...item.on, ...item.kun].map(kanjiReadingLabel));
      const distract = others.flatMap((o) => (useOn ? o.on : o.kun).map(kanjiReadingLabel)).filter((r) => !mine.has(r));
      return {
        ...base,
        instruction: `Pick a${useOn ? 'n on’yomi' : ' kun’yomi'} reading`,
        prompt: { t: 'jp', text: item.char, size: 'xl' },
        answer: choice({ label: correct, jp: true }, shuffle(distract, ctx.rng).map((label) => ({ label, jp: true })), ctx.rng),
      };
    }
    case 'trace':
      return { ...base, instruction: `Write ${item.char} (${m0})`, prompt: { t: 'en', text: m0 }, answer: { t: 'trace', char: item.char } };
    default:
      return kanjiQuestion(item, 'meaning-choice', ctx);
  }
}

export function grammarQuestion(pointId: string, q: GrammarQuestion, ctx: QuizContext, itemId = `g:${pointId}`): Question {
  const base = { key: key(), itemId, mode: 'grammar' as Mode };
  switch (q.t) {
    case 'blank': {
      const full = q.jp.replace('＿', q.answer);
      const answer = choice({ label: q.answer, jp: true }, q.options.filter((o) => o !== q.answer).map((label) => ({ label, jp: true })), ctx.rng, q.options.length);
      return {
        ...base,
        instruction: 'Fill in the blank',
        prompt: { t: 'blank', furi: q.jp, en: q.en },
        answer,
        reveal: { furi: full, meaning: q.en },
        speak: segmentsReading(parseFurigana(full)),
      };
    }
    case 'tiles': {
      const order = q.tiles;
      const tiles = shuffle([...order, ...(q.extra ?? [])], ctx.rng);
      const jp = order.join(' ');
      return {
        ...base,
        instruction: 'Build the sentence',
        prompt: { t: 'en', text: q.en },
        answer: { t: 'tiles', tiles, answer: order },
        reveal: { furi: jp, meaning: q.en },
        speak: segmentsReading(parseFurigana(jp)),
      };
    }
    case 'choice': {
      const jpOpts = q.optionsJp ?? true;
      return {
        ...base,
        instruction: q.prompt,
        prompt: q.jp ? { t: 'jp', text: furiText(q.jp), furi: q.jp, size: 'md' } : { t: 'en', text: q.prompt },
        answer: choice({ label: q.answer, jp: jpOpts }, q.options.filter((o) => o !== q.answer).map((label) => ({ label, jp: jpOpts })), ctx.rng, q.options.length),
        reveal: { jp: q.answer },
      };
    }
  }
}

function sentenceQuestion(item: SentenceItem, mode: Mode, ctx: QuizContext): Question {
  const segs = parseFurigana(item.furi);
  const text = furiText(item.furi);
  const reveal: Reveal = { furi: item.furi, romaji: segmentsRomaji(segs), meaning: item.en };
  const others = sameKind(ctx, item);
  const base = { key: key(), itemId: item.id, mode, reveal, speak: segmentsReading(segs) };
  if (mode === 'listen-sentence') {
    return {
      ...base,
      instruction: 'Which sentence did you hear?',
      prompt: { t: 'audio', say: segmentsReading(segs) },
      answer: choice({ label: text, jp: true }, others.map((o) => ({ label: furiText(o.furi), jp: true })), ctx.rng),
    };
  }
  return {
    ...base,
    mode: 'translate',
    instruction: 'What does it mean?',
    prompt: { t: 'jp', text, furi: item.furi, size: 'md' },
    answer: choice({ label: item.en, jp: false }, others.map((o) => ({ label: o.en, jp: false })), ctx.rng),
  };
}

function passageQuestion(item: PassageQuestionItem, ctx: QuizContext): Question {
  const p = ctx.passages[item.passageId];
  const q = p.questions[item.index];
  return {
    key: key(),
    itemId: item.id,
    mode: 'passage',
    instruction: 'Answer from the passage',
    prompt: { t: 'passage', passageId: p.id, q: q.q },
    answer: choice({ label: q.answer, jp: false }, q.options.filter((o) => o !== q.answer).map((label) => ({ label, jp: false })), ctx.rng, q.options.length),
    reveal: { meaning: q.answer },
  };
}

// ------------------------------------------------------------------ mode selection

/** Modes that make sense for an item, given what's available. */
export function modesFor(item: Item, purpose: Purpose, ctx: QuizContext): Mode[] {
  const fast = purpose === 'speed';
  switch (item.kind) {
    case 'kana': {
      const m: Mode[] = ['read-type', 'read-choice', 'pick-kana'];
      const partners = confusablePartners(ctx, item.char);
      if (ctx.pool.some((p) => p.kind === 'kana' && partners.includes(p.char))) m.push('confusable');
      if (ctx.listening) m.push('listen');
      if (ctx.writing && purpose !== 'boss' && ctx.hasStrokes(item.char) && [...item.char].length === 1) m.push('trace');
      return fast ? m.filter((x) => x !== 'read-type' && x !== 'trace') : m;
    }
    case 'word': {
      if (item.script) {
        const m: Mode[] = ['read-type', 'read-choice'];
        if (ctx.listening) m.push('listen');
        return fast ? m.filter((x) => x !== 'read-type') : m;
      }
      const m: Mode[] = ['meaning-choice', 'word-choice', 'produce'];
      if (hasKanji(item.jp)) m.push('reading-type');
      if (ctx.listening) m.push('listen');
      if (purpose === 'review') m.push('meaning-type');
      return fast ? m.filter((x) => !['produce', 'reading-type', 'meaning-type'].includes(x)) : m;
    }
    case 'kanji': {
      const m: Mode[] = ['meaning-choice', 'word-choice', 'reading-choice'];
      if (ctx.writing && purpose !== 'boss' && !fast && ctx.hasStrokes(item.char)) m.push('trace');
      return m;
    }
    case 'grammar':
      return ['grammar'];
    case 'sentence':
      return ctx.listening && !fast ? ['translate', 'listen-sentence'] : ['translate'];
    case 'passageq':
      return ['passage'];
  }
}

export function makeQuestion(item: Item, mode: Mode, ctx: QuizContext): Question {
  switch (item.kind) {
    case 'kana':
      return kanaQuestion(item, mode, ctx);
    case 'word':
      return wordQuestion(item, mode, ctx);
    case 'kanji':
      return kanjiQuestion(item, mode, ctx);
    case 'grammar': {
      const point = ctx.grammar[item.pointId];
      return grammarQuestion(point.id, pick(point.practice, ctx.rng), ctx);
    }
    case 'sentence':
      return sentenceQuestion(item, mode, ctx);
    case 'passageq':
      return passageQuestion(item, ctx);
  }
}

/** One question for an item with a randomly chosen mode (avoiding `avoid` when possible). */
export function questionFor(item: Item, purpose: Purpose, ctx: QuizContext, avoid: Mode[] = []): Question {
  const modes = modesFor(item, purpose, ctx);
  const preferred = modes.filter((m) => !avoid.includes(m));
  // Writing is slow: keep it occasional.
  const weighted = (preferred.length ? preferred : modes).flatMap((m) => (m === 'trace' ? [m] : [m, m, m]));
  return makeQuestion(item, pick(weighted, ctx.rng), ctx);
}

/** Reorders so the same item never appears twice in a row (when possible). */
export function spreadOut(qs: Question[], rng: Rng): Question[] {
  const out: Question[] = [];
  const rest = shuffle(qs, rng);
  while (rest.length) {
    const i = rest.findIndex((q) => q.itemId !== out[out.length - 1]?.itemId);
    out.push(...rest.splice(i === -1 ? 0 : i, 1));
  }
  return out;
}

const MAX_TRACE = 2;

function capTrace(qs: Question[], ctx: QuizContext, purpose: Purpose): Question[] {
  let traces = 0;
  return qs.map((q) => {
    if (q.mode !== 'trace') return q;
    if (++traces <= MAX_TRACE) return q;
    return questionFor(ctx.items.get(q.itemId)!, purpose, ctx, ['trace']);
  });
}

// ------------------------------------------------------------------ quizzes

export const UNIT_QUIZ_LENGTH = 20;

/** Unit quiz: every item at least once, most items twice in different modes, ~20 questions. */
export function unitQuiz(unit: Unit, ctx: QuizContext): Question[] {
  const items = unit.items.map((id) => ctx.items.get(id)).filter(Boolean) as Item[];
  if (unit.kind === 'grammar') {
    // Use the authored practice questions directly.
    const qs = (unit.grammar ?? []).flatMap((gid) => ctx.grammar[gid].practice.map((q) => grammarQuestion(gid, q, ctx)));
    return spreadOut(qs, ctx.rng).slice(0, UNIT_QUIZ_LENGTH);
  }
  if (unit.kind === 'reading') {
    const passageQs = items.filter((i) => i.kind === 'passageq').map((i) => makeQuestion(i, 'passage', ctx));
    const sentenceQs = items.filter((i) => i.kind === 'sentence').flatMap((i) => modesFor(i, 'learn', ctx).map((m) => makeQuestion(i, m, ctx)));
    return [...spreadOut(sentenceQs, ctx.rng), ...passageQs];
  }
  if (unit.kind === 'confusables') {
    const fresh = items.slice(0, 3);
    const lookalikes = items.slice(3);
    const qs = [
      ...fresh.flatMap((i) => [questionFor(i, 'learn', ctx), questionFor(i, 'learn', ctx, ['read-type'])]),
      ...shuffle(lookalikes, ctx.rng).slice(0, 14).map((i) => makeQuestion(i, ctx.rng() < 0.6 ? 'confusable' : 'pick-kana', ctx)),
    ];
    return capTrace(spreadOut(qs, ctx.rng), ctx, 'learn');
  }
  const qs: Question[] = items.map((i) => questionFor(i, 'learn', ctx));
  for (const i of shuffle(items, ctx.rng)) {
    if (qs.length >= Math.max(UNIT_QUIZ_LENGTH, items.length)) break;
    const first = qs.find((q) => q.itemId === i.id)!;
    qs.push(questionFor(i, 'learn', ctx, [first.mode]));
  }
  return capTrace(spreadOut(qs, ctx.rng), ctx, 'learn');
}

/** Boss exam: a mixed sample of the stage, weak items first. */
export function bossQuiz(itemIds: string[], weak: string[], ctx: QuizContext, length: number): Question[] {
  const weakSet = new Set(weak);
  const ordered = [...shuffle(itemIds.filter((i) => weakSet.has(i)), ctx.rng), ...shuffle(itemIds.filter((i) => !weakSet.has(i)), ctx.rng)];
  const chosen = ordered.slice(0, length);
  while (chosen.length < length && itemIds.length) chosen.push(pick(itemIds, ctx.rng));
  const qs = chosen.map((id) => questionFor(ctx.items.get(id)!, 'boss', ctx));
  return spreadOut(qs, ctx.rng);
}

/** Review / drill / notebook practice: one question per item. */
export function practiceQuiz(itemIds: string[], purpose: Purpose, ctx: QuizContext): Question[] {
  const qs = itemIds.map((id) => ctx.items.get(id)).filter(Boolean).map((i) => questionFor(i!, purpose, ctx));
  return capTrace(spreadOut(qs, ctx.rng), ctx, purpose);
}
