// Furigana strings use Tatoeba's format: "[漢字|かん|じ]は..." (one reading per kanji,
// or a single reading for the whole group: "[学生|がくせい]").
// Hand-written content may mark particles explicitly with "_": "わたし_はがくせいです" so は reads "wa",
// and may use ASCII spaces as invisible word breaks (they only affect romaji spacing).

import { isKanaChar, isKanjiChar, kanaToRomaji } from './romaji';

export interface Segment {
  text: string; // as displayed
  reading: string; // kana
  ruby: boolean; // true when text contains kanji (has furigana)
  particle?: boolean; // は/へ/を used as a particle
}

const GROUP_RE = /\[([^\]|]+)((?:\|[^\]|]*)+)\]/g;

export function parseFurigana(furi: string): Segment[] {
  const segs: Segment[] = [];
  let last = 0;
  let brk = false;
  const pushPlain = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      if (s[i] === ' ') {
        brk = true;
      } else if (s[i] === '_' && /[はへを]/.test(s[i + 1] ?? '')) {
        segs.push({ text: s[i + 1], reading: s[i + 1], ruby: false, particle: true });
        i++;
      } else {
        const prev = segs[segs.length - 1];
        if (prev && !prev.ruby && !prev.particle && !brk) {
          prev.text += s[i];
          prev.reading += s[i];
        } else {
          segs.push({ text: s[i], reading: s[i], ruby: false });
        }
        brk = false;
      }
    }
  };
  for (const m of furi.matchAll(GROUP_RE)) {
    pushPlain(furi.slice(last, m.index));
    const reading = m[2].split('|').join('');
    segs.push({ text: m[1], reading: reading || m[1], ruby: reading.length > 0 });
    brk = false;
    last = m.index! + m[0].length;
  }
  pushPlain(furi.slice(last));
  markParticles(segs);
  return segs;
}

// Words that commonly come right before a topic は written in hiragana.
const BEFORE_WA = ['これ', 'それ', 'あれ', 'どれ', 'ここ', 'そこ', 'あそこ', 'わたし', 'あなた', 'かれ',
  'かのじょ', 'きょう', 'あした', 'きのう', 'に', 'で', 'と', 'から', 'まで', 'では', 'には', 'ぼく', 'みんな', 'たち', 'こちら', 'そちら', 'あちら', 'どちら'];

/**
 * Heuristic particle detection for sentences without explicit markers. It's right for
 * common beginner sentences but not perfect (no morphological analysis is done).
 */
function markParticles(segs: Segment[]) {
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s];
    if (seg.ruby || seg.particle) continue;
    const prevSeg = segs[s - 1];
    const prevChar = (i: number) => (i > 0 ? seg.text[i - 1] : prevSeg ? prevSeg.text[prevSeg.text.length - 1] : '');
    const afterKanjiOrKata = (i: number) => {
      const p = prevChar(i);
      if (!p) return false;
      return isKanjiChar(p) || (isKanaChar(p) && p >= 'ァ') || /[0-9０-９A-Za-z]/.test(p);
    };
    const parts: Segment[] = [];
    let buf = '';
    for (let i = 0; i < seg.text.length; i++) {
      const ch = seg.text[i];
      const next = seg.text[i + 1] ?? '';
      let isParticle = false;
      if (ch === 'を' && i + (prevSeg ? 1 : 0) > 0) isParticle = true;
      if (ch === 'は' || ch === 'へ') {
        const before = (prevSeg && !prevSeg.particle ? prevSeg.text : '') + seg.text.slice(0, i);
        const endsWord = BEFORE_WA.some((w) => before.endsWith(w));
        const greet = ch === 'は' && /(こんにち|こんばん)$/.test(before);
        const nextOk = next === '' || !/[いなしやず]/.test(next) || /[、。？！]/.test(next);
        isParticle = before.length > 0 && (greet || afterKanjiOrKata(i) || (endsWord && (nextOk || ch === 'へ')));
      }
      if (isParticle) {
        if (buf) parts.push({ text: buf, reading: buf, ruby: false });
        parts.push({ text: ch, reading: ch, ruby: false, particle: true });
        buf = '';
      } else {
        buf += ch;
      }
    }
    if (parts.length) {
      if (buf) parts.push({ text: buf, reading: buf, ruby: false });
      segs.splice(s, 1, ...parts);
      s += parts.length - 1;
    }
  }
}

export function segmentsText(segs: Segment[]): string {
  return segs.map((s) => s.text).join('');
}

export function segmentsReading(segs: Segment[]): string {
  return segs.map((s) => s.reading).join('');
}

const FUNCTION_START = /^(です|でし|だ|から|まで|より|が|に|で|と|も|の|や|か[。、？！]|か$)/;

/**
 * Romaji with spaces at segment boundaries (kanji groups, particles, marked word breaks).
 * Kana right after a kanji group is treated as okurigana (食べる -> taberu) unless it starts
 * with a particle or the copula (天気です -> tenki desu).
 */
export function segmentsRomaji(segs: Segment[]): string {
  return segs
    .map((s, i) => {
      const r = s.particle ? kanaToRomaji(s.reading, new Set([0])) : kanaToRomaji(s.reading);
      const prev = segs[i - 1];
      const glue = prev?.ruby && !s.ruby && !s.particle && !FUNCTION_START.test(s.text);
      return (i === 0 ? '' : glue ? '' : ' ') + r;
    })
    .join('')
    .replace(/\s+([.,?!)~"])/g, '$1')
    .replace(/([,.?!])(?=\S)/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Plain text of a furigana string (handy for display and matching). */
export function furiText(furi: string): string {
  return segmentsText(parseFurigana(furi));
}
