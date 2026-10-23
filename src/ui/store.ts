// App-wide state: loaded content, saved progress, stroke data, transient toasts.
// A tiny subscribe/notify store; components re-render via useStore().

import { get, set } from 'idb-keyval';
import { useEffect, useState } from 'preact/hooks';
import { loadContent, type Content } from '../content/index';
import { awardBadges, defaultProgress, migrate, type BadgeDef, type Progress } from '../core/progress';

const KEY = 'kana-quest-progress';

export interface Toast {
  id: number;
  text: string;
}

interface State {
  content: Content | null;
  error: string | null;
  progress: Progress;
  loaded: boolean;
  strokes: Record<string, string[]>;
  toasts: Toast[];
  confetti: number; // bump to fire confetti
  sessionNonce: number; // bump to restart the current session
}

const state: State = {
  content: null,
  error: null,
  progress: defaultProgress(),
  loaded: false,
  strokes: {},
  toasts: [],
  confetti: 0,
  sessionNonce: 0,
};

/** Restart the session on screen (retry a quiz) without reloading the page. */
export function restartSession() {
  state.sessionNonce++;
  window.scrollTo(0, 0);
  notify();
}

const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version++;
  for (const l of listeners) l();
}

export function getState(): State {
  return state;
}

export function useStore(): State {
  const [, setV] = useState(version);
  useEffect(() => {
    const l = () => setV(version);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return state;
}

// ------------------------------------------------------------ persistence

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    set(KEY, state.progress).catch((e) => console.error('save failed', e));
  }, 250);
}

export function flushSave(): Promise<void> {
  clearTimeout(saveTimer);
  return set(KEY, state.progress);
}

/** Mutate progress, then persist and re-render. Newly earned badges show as toasts. */
export function updateProgress(fn: (p: Progress) => void): BadgeDef[] {
  fn(state.progress);
  const badges = awardBadges(state.progress, Date.now());
  for (const b of badges) toast(`${b.icon} Badge earned: ${b.title}`);
  scheduleSave();
  applyTheme();
  notify();
  return badges;
}

export function replaceProgress(p: Progress) {
  state.progress = p;
  scheduleSave();
  applyTheme();
  notify();
}

// ------------------------------------------------------------ UI helpers

let toastSeq = 0;
export function toast(text: string, ms = 2600) {
  const t = { id: ++toastSeq, text };
  state.toasts = [...state.toasts, t];
  notify();
  setTimeout(() => {
    state.toasts = state.toasts.filter((x) => x.id !== t.id);
    notify();
  }, ms);
}

let confettiTimer: ReturnType<typeof setTimeout> | undefined;
let confettiSeq = 0;

export function celebrate() {
  if (!state.progress.settings.animations) return;
  state.confetti = ++confettiSeq;
  notify();
  clearTimeout(confettiTimer);
  confettiTimer = setTimeout(() => {
    state.confetti = 0;
    notify();
  }, 3500);
}

export function applyTheme() {
  const s = state.progress.settings;
  const root = document.documentElement;
  if (s.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', s.theme);
  root.classList.toggle('no-anim', !s.animations);
}

// ------------------------------------------------------------ boot

export async function boot() {
  if (import.meta.env.DEV) (window as unknown as { __kqState: State }).__kqState = state;
  try {
    const saved = await get<Progress>(KEY);
    if (saved) state.progress = migrate(saved);
  } catch (e) {
    console.error('load failed', e);
  }
  state.loaded = true;
  applyTheme();
  notify();
  // Ask the browser not to evict our data under storage pressure.
  navigator.storage?.persist?.().catch(() => {});

  try {
    state.content = await loadContent();
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e);
  }
  notify();

  // Stroke data is only needed for writing exercises; load it in the background.
  for (const file of ['kana', 'n5']) {
    fetch(`${import.meta.env.BASE_URL}data/strokes/${file}.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Record<string, string[]>) => {
        state.strokes = { ...state.strokes, ...data };
        notify();
      })
      .catch(() => {});
  }
}
