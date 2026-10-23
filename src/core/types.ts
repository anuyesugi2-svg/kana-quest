// Content model shared by the stage builders, exercise generator and UI.

export type Script = 'h' | 'k';

export interface KanaItem {
  kind: 'kana';
  id: string; // "h:か", "k:ティ"
  char: string;
  romaji: string;
  alts?: string[]; // other accepted romaji (を -> "o")
  script: Script;
}

export interface WordItem {
  kind: 'word';
  id: string; // "w:<jmdict seq>" for kana-stage words, "v:<seq>" for vocabulary
  jp: string; // as normally written
  reading: string; // kana
  meanings: string[];
  kanji?: string; // kanji spelling when the word is usually written in kana
  pos?: string[];
  ex?: number[]; // Tatoeba sentence ids
  script?: Script; // kana-stage words: which script they drill
}

export interface KanjiItem {
  kind: 'kanji';
  id: string; // "j:日"
  char: string;
  meanings: string[];
  on: string[];
  kun: string[];
  strokes: number;
  words: string[]; // vocab ids that use this kanji
}

export interface GrammarItem {
  kind: 'grammar';
  id: string; // "g:n5-desu"
  pointId: string;
  title: string;
}

export interface SentenceItem {
  kind: 'sentence';
  id: string; // "s:<tatoeba id>" or "p:<passage id>:<n>"
  furi: string;
  en: string;
}

export interface PassageQuestionItem {
  kind: 'passageq';
  id: string; // "p:<passage id>:<n>"
  passageId: string;
  index: number;
}

export type Item = KanaItem | WordItem | KanjiItem | GrammarItem | SentenceItem | PassageQuestionItem;

// ---------------------------------------------------------------- grammar & reading content

/** Japanese text in furigana format, e.g. "[私|わたし]_は [学生|がくせい] です。" */
export type Furi = string;

export interface Example {
  jp: Furi;
  en: string;
  note?: string;
}

export type GrammarQuestion =
  /** Fill the blank (＿ in jp) with the right particle/word. */
  | { t: 'blank'; jp: Furi; en: string; options: string[]; answer: string }
  /** Arrange tiles into the sentence that matches the English. Tiles are listed in the correct order. */
  | { t: 'tiles'; en: string; tiles: string[]; extra?: string[] }
  /** Multiple choice: pick the right Japanese for a prompt (conjugation, translation, usage). */
  | { t: 'choice'; prompt: string; jp?: Furi; options: string[]; answer: string; optionsJp?: boolean };

export interface GrammarPoint {
  id: string;
  level: StageId;
  title: string; // "は (topic marker)"
  pattern: string; // "A は B です"
  meaning: string;
  explanation: string[]; // short paragraphs
  table?: { caption?: string; head: string[]; rows: string[][] };
  examples: Example[];
  mistakes: string[];
  practice: GrammarQuestion[];
}

export interface Passage {
  id: string;
  title: string;
  lines: Example[];
  questions: { q: string; options: string[]; answer: string }[];
}

export type UnitKind = 'kana' | 'words' | 'confusables' | 'vocab' | 'kanji' | 'grammar' | 'reading';

export interface Unit {
  id: string;
  title: string;
  subtitle: string;
  kind: UnitKind;
  items: string[]; // item ids taught/tested in this unit
  /** Grammar points introduced in this unit (lesson cards shown before practice). */
  grammar?: string[];
  /** Hand-written reading passage shown before the questions. */
  passage?: string;
}

export interface Stage {
  id: StageId;
  title: string;
  jp: string;
  blurb: string;
  units: Unit[];
  /** False for stages whose content isn't built yet (shown as "coming soon"). */
  available: boolean;
}

export type StageId = 'hiragana' | 'katakana' | 'n5' | 'n4' | 'n3' | 'n2' | 'n1';

export const STAGE_ORDER: StageId[] = ['hiragana', 'katakana', 'n5', 'n4', 'n3', 'n2', 'n1'];
