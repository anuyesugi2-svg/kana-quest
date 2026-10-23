// Kana -> Hepburn romaji, written by hand because WanaKana's toRomaji mangles
// extended katakana (ティ -> "tei", ファ -> "fua") and long-vowel marks.
// Output is "wāpuro" Hepburn: shi/chi/tsu/fu/ji, long vowels doubled (koohii, otousan),
// n' before vowels and y.

const MONO: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'wi', ゑ: 'we', を: 'wo', ん: 'n', ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ゃ: 'ya', ゅ: 'yu', ょ: 'yo', ゎ: 'wa',
};

const YOON_BASE: Record<string, string> = {
  き: 'ky', ぎ: 'gy', し: 'sh', じ: 'j', ち: 'ch', ぢ: 'j', に: 'ny', ひ: 'hy',
  び: 'by', ぴ: 'py', み: 'my', り: 'ry',
};

const DIGRAPH: Record<string, string> = {
  ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo', ふゅ: 'fyu',
  てぃ: 'ti', でぃ: 'di', とぅ: 'tu', どぅ: 'du', てゅ: 'tyu', でゅ: 'dyu',
  うぃ: 'wi', うぇ: 'we', うぉ: 'wo',
  ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo', ゔゅ: 'vyu',
  しぇ: 'she', じぇ: 'je', ちぇ: 'che',
  つぁ: 'tsa', つぃ: 'tsi', つぇ: 'tse', つぉ: 'tso',
  いぇ: 'ye', くぁ: 'kwa', ぐぁ: 'gwa',
};
// し + ゃ = sha (not shya); じ/ぢ + ゃ = ja; ち + ゃ = cha
for (const [k, base] of Object.entries(YOON_BASE)) {
  DIGRAPH[k + 'ゃ'] = base + 'a';
  DIGRAPH[k + 'ゅ'] = base + 'u';
  DIGRAPH[k + 'ょ'] = base + 'o';
}

const PUNCT: Record<string, string> = {
  '。': '.', '、': ',', '？': '?', '！': '!', '・': ' ', '「': '"', '」': '"', '『': '"', '』': '"',
  '（': '(', '）': ')', '　': ' ', '〜': '~', '～': '~', '…': '...', '：': ':',
};

/** Katakana -> hiragana by code point (keeps ー). */
export function kataToHira(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out += c >= 0x30a1 && c <= 0x30f6 ? String.fromCodePoint(c - 0x60) : ch;
  }
  return out;
}

/** Hiragana -> katakana by code point. */
export function hiraToKata(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out += c >= 0x3041 && c <= 0x3096 ? String.fromCodePoint(c + 0x60) : ch;
  }
  return out;
}

const VOWELS = 'aeiou';

/**
 * Convert a kana string (hiragana, katakana or mixed) to romaji.
 * `particles` marks indices (in the original string) of は/へ/を used as particles.
 */
export function kanaToRomaji(input: string, particles?: Set<number>): string {
  const s = kataToHira(input.normalize('NFC'));
  const chars = [...s];
  let out = '';
  let geminate = false;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const pair = ch + (chars[i + 1] ?? '');
    let roma: string | undefined;
    let consumed = 1;
    if (particles?.has(i) && (ch === 'は' || ch === 'へ' || ch === 'を')) {
      roma = ch === 'は' ? 'wa' : ch === 'へ' ? 'e' : 'o';
    } else if (DIGRAPH[pair]) {
      roma = DIGRAPH[pair];
      consumed = 2;
    } else if (ch === 'っ') {
      geminate = true;
      continue;
    } else if (ch === 'ー') {
      const last = out[out.length - 1];
      out += last && VOWELS.includes(last) ? last : '-';
      continue;
    } else if (MONO[ch]) {
      roma = MONO[ch];
    } else if (PUNCT[ch]) {
      roma = PUNCT[ch];
    } else if (ch >= '０' && ch <= '９') {
      roma = String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
    } else {
      roma = ch;
    }
    if (geminate) {
      if (/^[a-z]/.test(roma) && !VOWELS.includes(roma[0])) {
        out += roma.startsWith('ch') ? 't' : roma[0];
      }
      geminate = false;
    }
    if (out.endsWith('n') && chars[i - 1] === 'ん' && /^[aeiouy]/.test(roma)) {
      out += "'";
    }
    out += roma;
    i += consumed - 1;
  }
  return out;
}

/** Replace ー with the vowel it lengthens, so ぱーてぃー and ぱあてぃい compare equal. */
export function expandChoonpu(hira: string): string {
  const chars = [...hira];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === 'ー' && i > 0) {
      const r = kanaToRomaji(chars[i - 1]);
      const v = r[r.length - 1];
      out += { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' }[v] ?? 'ー';
    } else {
      out += chars[i];
    }
  }
  return out;
}

/** Canonical kana form for comparisons: hiragana, ー expanded, no spaces/punctuation. */
export function normalizeKana(s: string): string {
  return expandChoonpu(kataToHira(s.normalize('NFC'))).replace(/[\s。、？！?!.,・「」]/g, '');
}

export function isKanaChar(ch: string): boolean {
  const c = ch.codePointAt(0)!;
  return (c >= 0x3041 && c <= 0x3096) || (c >= 0x30a1 && c <= 0x30fa) || ch === 'ー';
}

export function isKanjiChar(ch: string): boolean {
  const c = ch.codePointAt(0)!;
  return (c >= 0x4e00 && c <= 0x9fff) || ch === '々';
}

export function hasKanji(s: string): boolean {
  return [...s].some(isKanjiChar);
}
