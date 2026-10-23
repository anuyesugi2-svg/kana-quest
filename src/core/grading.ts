import { toHiragana } from 'wanakana';
import { kanaToRomaji, normalizeKana } from './romaji';

// Extra spellings for typed romaji. WanaKana reads "ti"/"di"/"tu"/"du" the kunrei way
// (ち/ぢ/つ/づ); we also try the extended-katakana reading (ティ/ディ/トゥ/ドゥ).
const EXTENDED_MAPPING = { ti: 'てぃ', di: 'でぃ', tu: 'とぅ', du: 'どぅ', dyu: 'でゅ', tyu: 'てゅ' };

const MACRONS: [RegExp, string[]][] = [
  [/[āâ]/g, ['aa']],
  [/[īî]/g, ['ii']],
  [/[ūû]/g, ['uu']],
  [/[ēê]/g, ['ee', 'ei']],
  [/[ōô]/g, ['ou', 'oo']],
];

function macronVariants(s: string): string[] {
  let variants = [s];
  for (const [re, reps] of MACRONS) {
    if (s.search(re) === -1) continue;
    variants = variants.flatMap((v) => reps.map((r) => v.replace(re, r)));
  }
  return variants;
}

function cleanRomaji(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/[\s.,!?]/g, '');
}

const stripMarks = (s: string) => s.replace(/['’\-]/g, '');

/**
 * Is `input` (typed romaji) a correct reading of `expectedKana`?
 * Accepts Hepburn or kunrei spellings (shi/si, tsu/tu, ji/zi), macrons (ō), n', "-" for ー,
 * and anything listed in `alts`.
 */
export function gradeRomaji(input: string, expectedKana: string, alts: string[] = []): boolean {
  const raw = cleanRomaji(input);
  if (!raw) return false;
  const expectedRoma = stripMarks(kanaToRomaji(expectedKana));
  const expectedNorm = normalizeKana(expectedKana);
  for (const v of macronVariants(raw)) {
    if (stripMarks(v) === expectedRoma) return true;
    if (alts.some((a) => stripMarks(cleanRomaji(a)) === stripMarks(v))) return true;
    if (normalizeKana(toHiragana(v)) === expectedNorm) return true;
    if (normalizeKana(toHiragana(v, { customKanaMapping: EXTENDED_MAPPING })) === expectedNorm) return true;
  }
  return false;
}

/** Is `input` (typed with live kana conversion) the same kana as `expected`? Script-insensitive. */
export function gradeKana(input: string, expected: string | string[]): boolean {
  // Finish any romaji still pending in the input box (e.g. a trailing "n").
  const typed = normalizeKana(toHiragana(input.trim(), { IMEMode: false }));
  if (!typed) return false;
  const options = Array.isArray(expected) ? expected : [expected];
  return options.some((e) => normalizeKana(e) === typed);
}

const STOP = new Set(['a', 'an', 'the', 'to', 'be', 'something', 'someone', 'one', "one's", 'sth', 'etc']);

export function normalizeMeaning(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9' ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .join(' ');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Split JMdict-style meanings ("to see; to look; to watch") into individual glosses. */
export function meaningCandidates(meanings: string[]): string[] {
  return meanings.flatMap((m) => m.split(/[;,]/)).map((m) => m.trim()).filter(Boolean);
}

/** Lenient English-meaning check: ignores articles, "to", parentheses, case; allows small typos. */
export function gradeMeaning(input: string, meanings: string[]): boolean {
  const got = normalizeMeaning(input);
  if (!got) return false;
  for (const cand of meaningCandidates(meanings)) {
    const want = normalizeMeaning(cand);
    if (!want) continue;
    if (got === want) return true;
    const tolerance = want.length >= 8 ? 2 : want.length >= 4 ? 1 : 0;
    if (tolerance && levenshtein(got, want) <= tolerance) return true;
  }
  return false;
}
