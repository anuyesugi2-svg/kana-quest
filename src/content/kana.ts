// Kana tables (a closed, fixed set, so they're written here rather than downloaded),
// the look-alike sets, and the hiragana/katakana stage layouts.

import { hiraToKata, kanaToRomaji } from '../core/romaji';
import type { KanaItem, Script, Stage, Unit, WordItem } from '../core/types';

const ROWS: Record<string, string> = {
  a: 'あいうえお',
  ka: 'かきくけこ',
  sa: 'さしすせそ',
  ta: 'たちつてと',
  na: 'なにぬねの',
  ha: 'はひふへほ',
  ma: 'まみむめも',
  ya: 'やゆよ',
  ra: 'らりるれろ',
  wa: 'わを',
  n: 'ん',
  ga: 'がぎぐげご',
  za: 'ざじずぜぞ',
  da: 'だぢづでど',
  ba: 'ばびぶべぼ',
  pa: 'ぱぴぷぺぽ',
};

const YOON_ROWS: Record<string, string> = {
  ky: 'き', sh: 'し', ch: 'ち', ny: 'に', hy: 'ひ',
  my: 'み', ry: 'り', gy: 'ぎ', j: 'じ', by: 'び', py: 'ぴ',
};

export const EXTENDED_KATAKANA = [
  'ファ', 'フィ', 'フェ', 'フォ', 'ティ', 'ディ', 'トゥ', 'ドゥ', 'ウィ', 'ウェ', 'ウォ',
  'ヴァ', 'ヴィ', 'ヴ', 'ヴェ', 'ヴォ', 'シェ', 'ジェ', 'チェ', 'ツァ', 'デュ',
];

/** Accepted alternative romaji beyond what grading derives automatically. */
const ALTS: Record<string, string[]> = {
  を: ['o'], ヲ: ['o'],
  ぢ: ['di', 'dji'], ヂ: ['di', 'dji'],
  づ: ['du', 'dzu'], ヅ: ['du', 'dzu'],
  ん: ['nn'], ン: ['nn'],
  ヴ: ['bu'],
};

export const CONFUSABLES: Record<Script, string[][]> = {
  h: [
    ['ぬ', 'め'], ['わ', 'れ', 'ね'], ['る', 'ろ'], ['は', 'ほ', 'け'], ['さ', 'ち'],
    ['き', 'さ'], ['あ', 'お'], ['い', 'り'], ['た', 'な'], ['う', 'つ'],
  ],
  k: [
    ['シ', 'ツ'], ['ソ', 'ン'], ['ノ', 'メ'], ['ク', 'ケ', 'タ'], ['ウ', 'ワ', 'フ'],
    ['ス', 'ヌ'], ['チ', 'テ'], ['コ', 'ユ'], ['マ', 'ア'], ['ハ', 'ル'],
  ],
};

export function kanaId(script: Script, char: string) {
  return `${script}:${char}`;
}

function makeKana(script: Script, hira: string): KanaItem {
  const char = script === 'h' ? hira : hiraToKata(hira);
  return { kind: 'kana', id: kanaId(script, char), char, romaji: kanaToRomaji(char), alts: ALTS[char], script };
}

function row(script: Script, ...names: string[]): KanaItem[] {
  return names.flatMap((n) => [...ROWS[n]].map((h) => makeKana(script, h)));
}

function yoon(script: Script, ...bases: string[]): KanaItem[] {
  return bases.flatMap((b) => ['ゃ', 'ゅ', 'ょ'].map((s) => makeKana(script, YOON_ROWS[b] + s)));
}

/** All kana items for a script (used to resolve ids). */
export function allKana(script: Script): KanaItem[] {
  const base = row(script, ...Object.keys(ROWS));
  const combos = yoon(script, ...Object.keys(YOON_ROWS));
  const ext = script === 'k' ? EXTENDED_KATAKANA.map((c) => makeKana('k', c)) : [];
  return [...base, ...combos, ...ext];
}

export interface KanaWordsFile {
  sokuon_h: RawKanaWord[];
  long_h: RawKanaWord[];
  sokuon_k: RawKanaWord[];
  long_k: RawKanaWord[];
  ext_k: RawKanaWord[];
}
interface RawKanaWord {
  id: string;
  kana: string;
  m: string;
}

export function kanaWordItems(file: KanaWordsFile): WordItem[] {
  const out: WordItem[] = [];
  for (const [key, list] of Object.entries(file) as [keyof KanaWordsFile, RawKanaWord[]][]) {
    const script: Script = key.endsWith('_h') ? 'h' : 'k';
    for (const w of list) {
      out.push({ kind: 'word', id: `${w.id}${script}`, jp: w.kana, reading: w.kana, meanings: [w.m], script });
    }
  }
  return out;
}

const ids = (items: { id: string }[]) => items.map((i) => i.id);
const wordIds = (list: RawKanaWord[], script: Script) => list.map((w) => `${w.id}${script}`);

function confusableIds(script: Script) {
  return [...new Set(CONFUSABLES[script].flat())].map((c) => kanaId(script, c));
}

export function buildKanaStage(script: Script, words: KanaWordsFile): Stage {
  const h = script === 'h';
  const s = script;
  const x = (c: string) => (h ? c : hiraToKata(c));
  const u = (id: string, title: string, subtitle: string, kind: Unit['kind'], items: string[]): Unit => ({
    id: `${h ? 'h' : 'k'}-${id}`, title, subtitle, kind, items,
  });

  const units: Unit[] = [
    u('vowels-k', `${x('あ')} & ${x('か')} rows`, 'Vowels and K', 'kana', ids(row(s, 'a', 'ka'))),
    u('s-t', `${x('さ')} & ${x('た')} rows`, 'S and T', 'kana', ids(row(s, 'sa', 'ta'))),
    u('n-h', `${x('な')} & ${x('は')} rows`, 'N and H', 'kana', ids(row(s, 'na', 'ha'))),
    u('m-y-r', `${x('ま')} ${x('や')} ${x('ら')} rows`, 'M, Y and R', 'kana', ids(row(s, 'ma', 'ya', 'ra'))),
    u('w-n', `${x('わ')} ${x('を')} ${x('ん')} + look-alikes`, 'W, N, and telling similar shapes apart', 'confusables', [
      ...ids(row(s, 'wa', 'n')),
      ...confusableIds(s),
    ]),
    u('g-z', `${x('が')} & ${x('ざ')} rows`, 'Dakuten ゛: G and Z', 'kana', ids(row(s, 'ga', 'za'))),
    u('d-b-p', `${x('だ')} ${x('ば')} ${x('ぱ')} rows`, 'Dakuten and handakuten ゜', 'kana', ids(row(s, 'da', 'ba', 'pa'))),
    u('yoon-1', `${x('きゃ')} combos`, 'Combined sounds I', 'kana', ids(yoon(s, 'ky', 'sh', 'ch', 'ny', 'hy'))),
    u('yoon-2', `${x('みゃ')} combos`, 'Combined sounds II', 'kana', ids(yoon(s, 'my', 'ry', 'gy', 'j', 'by', 'py'))),
  ];
  if (h) {
    units.push(
      u('sokuon', 'Small っ', 'Double consonants: きって = kitte', 'words', wordIds(words.sokuon_h, 'h')),
      u('long', 'Long vowels', 'おかあさん, えいが, おおきい', 'words', wordIds(words.long_h, 'h')),
    );
  } else {
    units.push(
      u('sokuon', 'Small ッ', 'Double consonants: ベッド = beddo', 'words', wordIds(words.sokuon_k, 'k')),
      u('long', 'Long vowel ー', 'コーヒー = koohii', 'words', wordIds(words.long_k, 'k')),
      u('ext-1', 'Extended sounds I', 'ファ フィ ティ ディ ウィ…', 'kana', EXTENDED_KATAKANA.slice(0, 11).map((c) => kanaId('k', c))),
      u('ext-2', 'Extended sounds II', 'ヴァ シェ ジェ チェ…', 'kana', EXTENDED_KATAKANA.slice(11).map((c) => kanaId('k', c))),
      u('ext-words', 'Loanwords', 'ソファ, カフェ, シェア…', 'words', wordIds(words.ext_k, 'k')),
    );
  }
  return h
    ? { id: 'hiragana', title: 'Hiragana', jp: 'ひらがな', blurb: 'The core Japanese syllabary.', units, available: true }
    : { id: 'katakana', title: 'Katakana', jp: 'カタカナ', blurb: 'For loanwords, names and emphasis.', units, available: true };
}
