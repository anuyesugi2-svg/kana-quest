import { useMemo } from 'preact/hooks';
import { currentStreak, todayXp } from '../core/progress';
import { dueIds } from '../core/srs';
import { PopoverHost } from './Jp';
import { UnitLesson } from './Lesson';
import { href, useRoute } from './router';
import { CreditsScreen, GrammarScreen, Home, Loading, MapScreen, MeScreen, NotebookScreen, SettingsScreen, StageScreen } from './Screens';
import { Session, type SessionKind } from './Session';
import { useStore } from './store';

const SESSION_KINDS: SessionKind[] = ['unit', 'boss', 'drill', 'review', 'notebook', 'speed'];

export function App() {
  const route = useRoute();
  const { content, progress, loaded, toasts, confetti, sessionNonce } = useStore();
  const [head, a1] = route;
  const focus = head === 'quiz' || head === 'unit';

  let screen: preact.JSX.Element;
  if (!loaded) screen = <Loading />;
  else if (head === 'map') screen = <MapScreen />;
  else if (head === 'stage' && a1) screen = <StageScreen id={a1} />;
  else if (head === 'unit' && a1) {
    const stage = content?.stages.find((s) => s.units.some((u) => u.id === a1));
    const unit = stage?.units.find((u) => u.id === a1);
    screen = content && stage && unit ? <UnitLesson key={a1} unit={unit} content={content} stageId={stage.id} /> : <Loading />;
  } else if (head === 'quiz' && SESSION_KINDS.includes(a1 as SessionKind)) {
    screen = content ? <Session key={`${route.join('/')}#${sessionNonce}`} kind={a1 as SessionKind} arg={route[2]} /> : <Loading />;
  } else if (head === 'notebook') screen = <NotebookScreen />;
  else if (head === 'me') screen = <MeScreen />;
  else if (head === 'settings') screen = <SettingsScreen />;
  else if (head === 'credits') screen = <CreditsScreen />;
  else if (head === 'grammar' && a1) screen = <GrammarScreen id={a1} />;
  else screen = <Home />;

  const now = Date.now();
  const due = dueIds(progress.cards, now).length;
  const tab = head ?? '';

  return (
    <div class="app">
      {!focus && (
        <header class="topbar">
          <a class="brand" href={href('/')}>
            <span class="logo" lang="ja">
              か
            </span>
            Kana Quest
          </a>
          <span class="spacer" />
          <span class="chip streak" title="Day streak">
            🔥 {currentStreak(progress, now)}
          </span>
          <span class="chip xp" title="XP today / daily goal">
            {todayXp(progress, now) >= progress.settings.dailyGoal
              ? `✓ ${todayXp(progress, now)} XP`
              : `⭐ ${todayXp(progress, now)}/${progress.settings.dailyGoal}`}
          </span>
        </header>
      )}
      <main class={`screen ${focus ? 'focus' : ''}`}>{screen}</main>
      {!focus && (
        <nav class="bottomnav" aria-label="Main">
          <a href={href('/')} class={tab === '' ? 'active' : ''}>
            <span class="ico">🏠</span>Home
          </a>
          <a href={href('/map')} class={tab === 'map' || tab === 'stage' || tab === 'grammar' ? 'active' : ''}>
            <span class="ico">🗺️</span>Map
          </a>
          <a href={href('/quiz/review')}>
            <span class="ico">🔁</span>Review
            {due > 0 && <span class="badge-dot">{due > 99 ? '99+' : due}</span>}
          </a>
          <a href={href('/notebook')} class={tab === 'notebook' ? 'active' : ''}>
            <span class="ico">📓</span>Notebook
          </a>
          <a href={href('/me')} class={tab === 'me' || tab === 'settings' || tab === 'credits' ? 'active' : ''}>
            <span class="ico">👤</span>Me
          </a>
        </nav>
      )}
      <PopoverHost />
      <div class="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div class="toast" key={t.id}>
            {t.text}
          </div>
        ))}
      </div>
      {confetti > 0 && <Confetti key={confetti} />}
    </div>
  );
}

const COLORS = ['#d6455d', '#e3a21a', '#2f9e6a', '#4b5bd6', '#f06a80', '#8d99ff'];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        dur: 1.6 + Math.random() * 1.4,
        color: COLORS[i % COLORS.length],
        rot: Math.random() * 360,
      })),
    [],
  );
  return (
    <div class="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i key={i} style={{ left: `${p.left}%`, background: p.color, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`, transform: `rotate(${p.rot}deg)` }} />
      ))}
    </div>
  );
}
