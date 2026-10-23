// Loads the generated JSON data and assembles stages, items and lookups.

import { kanaToRomaji } from '../core/romaji';
import type { GrammarPoint, Item, KanjiItem, Passage, SentenceItem, Stage, StageId, Unit, WordItem } from '../core/types';
import { allKana, buildKanaStage, CONFUSABLES, kanaWordItems, type KanaWordsFile } from './kana';
import { GRAMMAR_N5, GRAMMAR_UNITS_N5 } from './grammar-n5';
import { PASSAGES_N5 } from './passages-n5';

export interface RawVocab {
  id: string;
  w: string;
  r: string;
  m: string[];
  pos: string[];
  k?: string;
  ex?: number[];
}
export interface RawKanji {
  id: string;
  c: string;
  m: string[];
  on: string[];
  kun: string[];
  s: number;
  words: string[];
}
export interface RawSentence {
  furi: string;
  en: string;
}

export interface Content {
  stages: Stage[];
  items: Map<string, Item>;
  grammar: Record<string, GrammarPoint>;
  passages: Record<string, Passage>;
  sentences: Record<string, RawSentence>;
  /** Vocabulary lookup by written form or reading, for tap-to-define. */
  lexicon: Map<string, WordItem>;
  confusables: string[][];
  /** All item ids belonging to a stage (for boss exams). */
  stageItems: Record<string, string[]>;
}

const VOCAB_PER_UNIT = 15;
const KANJI_PER_UNIT = 10;
const SENTENCES_PER_READING = 6;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${path}`);
  if (!res.ok) throw new Error(`Couldn't load ${path} (${res.status})`);
  return res.json() as Promise<T>;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export function vocabItem(v: RawVocab): WordItem {
  return { kind: 'word', id: v.id, jp: v.w, reading: v.r, meanings: v.m, kanji: v.k, pos: v.pos, ex: v.ex };
}

export function kanjiItem(k: RawKanji): KanjiItem {
  return { kind: 'kanji', id: k.id, char: k.c, meanings: k.m, on: k.on, kun: k.kun, strokes: k.s, words: k.words };
}

/**
 * N5 layout: vocabulary, kanji, grammar and reading units interleaved so every few
 * units mix things up. Pattern per cycle: V V G K V G V R (until each pool runs out).
 */
export function buildJlptStage(
  id: StageId,
  vocab: WordItem[],
  kanji: KanjiItem[],
  grammarUnits: string[][],
  grammar: Record<string, GrammarPoint>,
  readingSentences: SentenceItem[],
  passages: Passage[],
): Stage {
  const lv = id.toUpperCase();
  const vocabUnits = chunk(vocab, VOCAB_PER_UNIT).map<Unit>((ws, i) => ({
    id: `${id}-v${i + 1}`,
    title: `Words ${i + 1}`,
    subtitle: ws.slice(0, 4).map((w) => w.jp).join('・') + '…',
    kind: 'vocab',
    items: ws.map((w) => w.id),
  }));
  const kanjiUnits = chunk(kanji, KANJI_PER_UNIT).map<Unit>((ks, i) => ({
    id: `${id}-k${i + 1}`,
    title: `Kanji ${i + 1}`,
    subtitle: ks.map((k) => k.char).join(' '),
    kind: 'kanji',
    items: ks.map((k) => k.id),
  }));
  const grammarUnitList = grammarUnits.map<Unit>((ids, i) => ({
    id: `${id}-g${i + 1}`,
    title: `Grammar ${i + 1}`,
    subtitle: ids.map((g) => grammar[g].title.split(' — ')[0]).join(' · '),
    kind: 'grammar',
    items: ids.map((g) => `g:${g}`),
    grammar: ids,
  }));
  const sentenceChunks = chunk(readingSentences, SENTENCES_PER_READING);
  // Spread the hand-written passages evenly across the reading units.
  const passageAt = new Map<number, Passage>();
  passages.forEach((p, k) => passageAt.set(Math.floor((k * sentenceChunks.length) / passages.length), p));
  const readingUnits = sentenceChunks.map<Unit>((ss, i) => {
    const passage = passageAt.get(i);
    return {
      id: `${id}-r${i + 1}`,
      title: `Reading ${i + 1}`,
      subtitle: passage ? 'A short story + sentences' : 'Short sentences',
      kind: 'reading',
      items: [...ss.map((s) => s.id), ...(passage ? passage.questions.map((_, qi) => `p:${passage.id}:${qi}`) : [])],
      passage: passage?.id,
    };
  });

  const pools: Record<string, Unit[]> = { V: vocabUnits, K: kanjiUnits, G: grammarUnitList, R: readingUnits };
  const pattern = 'VVGKVGVR';
  const units: Unit[] = [];
  let p = 0;
  while (Object.values(pools).some((x) => x.length)) {
    const take = pools[pattern[p % pattern.length]];
    if (take.length) units.push(take.shift()!);
    p++;
  }
  return { id, title: lv, jp: `${lv}`, blurb: `JLPT ${lv}: vocabulary, kanji, grammar and reading.`, units, available: true };
}

const LOCKED_STAGES: Stage[] = (['n4', 'n3', 'n2', 'n1'] as StageId[]).map((id) => ({
  id,
  title: id.toUpperCase(),
  jp: id.toUpperCase(),
  blurb: 'Coming in a later phase.',
  units: [],
  available: false,
}));

export async function loadContent(): Promise<Content> {
  const [kanaWords, vocabRaw, kanjiRaw, sentences, reading] = await Promise.all([
    getJson<KanaWordsFile>('kana-words.json'),
    getJson<RawVocab[]>('n5/vocab.json'),
    getJson<RawKanji[]>('n5/kanji.json'),
    getJson<Record<string, RawSentence>>('n5/sentences.json'),
    getJson<number[]>('n5/reading.json'),
  ]);
  return assembleContent(kanaWords, vocabRaw, kanjiRaw, sentences, reading);
}

export function assembleContent(
  kanaWords: KanaWordsFile,
  vocabRaw: RawVocab[],
  kanjiRaw: RawKanji[],
  sentences: Record<string, RawSentence>,
  reading: number[],
): Content {
  const items = new Map<string, Item>();
  const add = (i: Item) => items.set(i.id, i);

  allKana('h').forEach(add);
  allKana('k').forEach(add);
  kanaWordItems(kanaWords).forEach(add);
  const vocab = vocabRaw.map(vocabItem);
  vocab.forEach(add);
  const kanji = kanjiRaw.map(kanjiItem);
  kanji.forEach(add);

  const grammar: Record<string, GrammarPoint> = {};
  for (const g of GRAMMAR_N5) {
    grammar[g.id] = g;
    add({ kind: 'grammar', id: `g:${g.id}`, pointId: g.id, title: g.title });
  }
  const passages: Record<string, Passage> = {};
  for (const p of PASSAGES_N5) {
    passages[p.id] = p;
    p.questions.forEach((_, i) => add({ kind: 'passageq', id: `p:${p.id}:${i}`, passageId: p.id, index: i }));
  }
  const readingItems: SentenceItem[] = reading
    .filter((sid) => sentences[sid])
    .map((sid) => ({ kind: 'sentence', id: `s:${sid}`, furi: sentences[sid].furi, en: sentences[sid].en }));
  readingItems.forEach(add);

  const stages: Stage[] = [
    buildKanaStage('h', kanaWords),
    buildKanaStage('k', kanaWords),
    buildJlptStage('n5', vocab, kanji, GRAMMAR_UNITS_N5, grammar, readingItems, PASSAGES_N5),
    ...LOCKED_STAGES,
  ];

  const lexicon = new Map<string, WordItem>();
  for (const v of vocab) {
    for (const form of [v.jp, v.kanji, v.reading]) if (form && !lexicon.has(form)) lexicon.set(form, v);
  }

  const stageItems: Record<string, string[]> = {};
  for (const s of stages) stageItems[s.id] = [...new Set(s.units.flatMap((u) => u.items))];

  return {
    stages,
    items,
    grammar,
    passages,
    sentences,
    lexicon,
    confusables: [...CONFUSABLES.h, ...CONFUSABLES.k],
    stageItems,
  };
}

/** Item ids that go into spaced repetition (reading comprehension items don't). */
export function isSrsItem(id: string): boolean {
  return !id.startsWith('s:') && !id.startsWith('p:');
}

export function itemLabel(item: Item): string {
  switch (item.kind) {
    case 'kana':
      return `${item.char} · ${item.romaji}`;
    case 'word':
      return `${item.jp} · ${item.script ? kanaToRomaji(item.reading) : item.meanings[0].split(';')[0]}`;
    case 'kanji':
      return `${item.char} · ${item.meanings[0]}`;
    case 'grammar':
      return item.title;
    case 'sentence':
      return item.en;
    case 'passageq':
      return 'Reading question';
  }
}
