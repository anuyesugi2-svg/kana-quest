// Tap-for-romaji: any Japanese text rendered through <Jp> shows its reading,
// Hepburn romaji (when romaji assist is on) and meaning when tapped.

import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { parseFurigana, segmentsReading, segmentsRomaji, type Segment } from '../core/furigana';
import { hasKanji, kanaToRomaji } from '../core/romaji';
import { shortMeaning } from '../core/quiz';
import { getState, useStore } from './store';
import { speak } from './speech';

interface PopInfo {
  jp: string;
  reading?: string;
  romaji?: string;
  meaning?: string;
  say: string;
  x: number;
  y: number;
  above: boolean;
}

let current: PopInfo | null = null;
const subs = new Set<(p: PopInfo | null) => void>();
function setPop(p: PopInfo | null) {
  current = p;
  subs.forEach((s) => s(p));
}

/** Look up a word in the loaded vocabulary or kanji list. */
function lookup(text: string): { reading?: string; meaning?: string } {
  const c = getState().content;
  if (!c) return {};
  const w = c.lexicon.get(text);
  if (w) return { reading: w.reading, meaning: w.meanings.slice(0, 2).map(shortMeaning).join('; ') };
  if ([...text].length === 1) {
    const k = c.items.get(`j:${text}`);
    if (k && k.kind === 'kanji') return { meaning: k.meanings.slice(0, 3).join(', ') };
  }
  return {};
}

function open(target: HTMLElement, info: Omit<PopInfo, 'x' | 'y' | 'above'>) {
  const r = target.getBoundingClientRect();
  const h = window.innerHeight;
  const above = r.bottom + 160 > h && r.top > 180;
  // Keep the anchor on screen even if the tapped text is partly scrolled away.
  const y = above ? Math.min(Math.max(r.top - 8, 180), h - 16) : Math.min(Math.max(r.bottom + 8, 16), h - 180);
  setPop({ ...info, x: r.left + r.width / 2, y, above });
}

export interface JpProps {
  /** Furigana-format text ("[学生|がくせい]です"). */
  furi?: string;
  /** Plain Japanese text (kana, or kanji with `reading`). */
  text?: string;
  reading?: string;
  meaning?: string;
  /** Called when the learner reveals the reading (quizzes count it as a peek). */
  onPeek?: () => void;
  /** Disable tapping (e.g. when the reading is the answer and assist is off). */
  inert?: boolean;
  class?: string;
  children?: ComponentChildren;
}

export function Jp({ furi, text, reading, meaning, onPeek, inert, class: cls }: JpProps) {
  if (furi !== undefined) {
    const segs = parseFurigana(furi);
    const sentenceReading = segmentsReading(segs);
    const whole = (el: HTMLElement) =>
      open(el, {
        jp: segs.map((s) => s.text).join(''),
        reading: hasKanji(furi) ? sentenceReading : undefined,
        romaji: segmentsRomaji(segs),
        meaning,
        say: sentenceReading,
      });
    const onSeg = (e: MouseEvent, s: Segment) => {
      if (inert) return;
      e.stopPropagation();
      onPeek?.();
      if (s.ruby) {
        const info = lookup(s.text);
        open(e.currentTarget as HTMLElement, { jp: s.text, reading: s.reading, romaji: kanaToRomaji(s.reading), meaning: info.meaning, say: s.reading });
      } else {
        whole(e.currentTarget as HTMLElement);
      }
    };
    return (
      <span class={`jp ${cls ?? ''}`} lang="ja">
        {segs.map((s, i) => (
          <span key={i} class={s.ruby ? 'seg-k' : undefined} onClick={(e) => onSeg(e as MouseEvent, s)}>
            {s.text}
          </span>
        ))}
      </span>
    );
  }

  const t = text ?? '';
  const onClick = (e: MouseEvent) => {
    if (inert) return;
    e.stopPropagation();
    onPeek?.();
    const info = hasKanji(t) && !reading ? lookup(t) : {};
    const rd = reading ?? info.reading ?? (hasKanji(t) ? undefined : t);
    open(e.currentTarget as HTMLElement, {
      jp: t,
      reading: rd && rd !== t ? rd : undefined,
      romaji: rd ? kanaToRomaji(rd) : undefined,
      meaning: meaning ?? info.meaning,
      say: rd ?? t,
    });
  };
  return (
    <span class={`jp ${inert ? 'no-underline' : ''} ${cls ?? ''}`} lang="ja" onClick={onClick}>
      {t}
    </span>
  );
}

export function PopoverHost() {
  const [pop, setP] = useState<PopInfo | null>(current);
  const { progress } = useStore();
  useEffect(() => {
    subs.add(setP);
    const close = () => setPop(null);
    window.addEventListener('hashchange', close);
    window.addEventListener('scroll', close, { passive: true });
    return () => {
      subs.delete(setP);
      window.removeEventListener('hashchange', close);
      window.removeEventListener('scroll', close);
    };
  }, []);
  if (!pop) return null;
  const assist = progress.settings.romajiAssist;
  const width = Math.min(340, window.innerWidth - 32);
  const left = Math.max(16, Math.min(pop.x - width / 2, window.innerWidth - width - 16));
  // Preact 11 doesn't add "px" to numbers, so positions are strings.
  const px = (n: number) => `${Math.round(n)}px`;
  const style = pop.above
    ? { left: px(left), bottom: px(window.innerHeight - pop.y), width: px(width) }
    : { left: px(left), top: px(pop.y), width: px(width) };
  return (
    <>
      <div class="pop-backdrop" onClick={() => setPop(null)} />
      <div class="popover" style={style} role="dialog" lang="ja">
        <div class="p-row">
          <span class="p-jp">{pop.jp}</span>
          <button onClick={() => speak(pop.say, progress.settings.speechRate)} aria-label="Play audio">
            🔊
          </button>
        </div>
        {pop.reading && <div>{pop.reading}</div>}
        {assist && pop.romaji && <div class="p-romaji" lang="en">{pop.romaji}</div>}
        {!assist && pop.romaji && <div class="small" lang="en" style={{ opacity: 0.7 }}>Romaji assist is off</div>}
        {pop.meaning && <div class="p-meaning" lang="en">{pop.meaning}</div>}
      </div>
    </>
  );
}

export function closePopover() {
  setPop(null);
}
