import { useEffect, useRef, useState } from 'preact/hooks';
import { itemLabel, type Content } from '../content/index';
import {
  BADGES,
  currentStreak,
  DAILY_GOALS,
  defaultProgress,
  exportProgress,
  importProgress,
  learnedCount,
  matureCount,
  playerLevel,
  todayXp,
  type Settings,
} from '../core/progress';
import { dueIds } from '../core/srs';
import type { Stage, StageId } from '../core/types';
import { currentUnitIndex, isBossUnlocked, isStageGraduated, isStageUnlocked, isUnitUnlocked, stageCompletion } from '../core/unlock';
import { GrammarLesson } from './Lesson';
import { Jp } from './Jp';
import { href } from './router';
import { REVIEW_BATCH } from './Session';
import { onVoicesChanged, speak, speechAvailable, voiceName } from './speech';
import { flushSave, replaceProgress, toast, updateProgress, useStore } from './store';

export function Ring({ value, size = 64, stroke = 7, color = 'var(--accent)', children }: { value: number; size?: number; stroke?: number; color?: string; children?: preact.ComponentChildren }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div class="ring" style={{ width: `${size}px`, height: `${size}px` }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" stroke-width={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          stroke-width={stroke}
          stroke-linecap="round"
          stroke-dasharray={c}
          stroke-dashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          style={{ transition: 'stroke-dashoffset .5s ease' }}
        />
      </svg>
      <div class="label">{children}</div>
    </div>
  );
}

/** The stage the learner is currently working in (first unlocked, not graduated). */
function activeStage(content: Content, p: ReturnType<typeof useStore>['progress']): Stage {
  const unlocked = content.stages.filter((s) => isStageUnlocked(s, p));
  return unlocked.find((s) => !isStageGraduated(s.id, p)) ?? unlocked[unlocked.length - 1] ?? content.stages[0];
}

// ---------------------------------------------------------------- Home

export function Home() {
  const { content, progress } = useStore();
  if (!content) return <Loading />;
  const now = Date.now();
  const goal = progress.settings.dailyGoal;
  const xp = todayXp(progress, now);
  const due = dueIds(progress.cards, now).length;
  const streak = currentStreak(progress, now);
  const stage = activeStage(content, progress);
  const ui = currentUnitIndex(stage, progress);
  const unit = stage.units[ui];
  const bossReady = !unit && isBossUnlocked(stage, progress) && !isStageGraduated(stage.id, progress);
  const mistakes = Object.keys(progress.mistakes).length;
  const fresh = Object.keys(progress.units).length === 0;

  return (
    <div>
      {fresh && (
        <div class="card" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }}>
          <h2>ようこそ! Welcome to Kana Quest</h2>
          <p>
            Learn hiragana, graduate to katakana, then climb JLPT N5 → N1. Each unit takes a few minutes. Pass its quiz (90%) to unlock the next, and
            beat the boss exam to graduate a stage.
          </p>
          <p class="small muted" style={{ margin: 0 }}>
            Tip: tap any Japanese text to see its romaji. You can turn romaji assist off in Settings as you improve.
          </p>
        </div>
      )}
      <div class="card">
        <div class="row">
          <Ring value={xp / goal} size={84} stroke={9} color={xp >= goal ? 'var(--good)' : 'var(--accent)'}>
            <div>
              <div style={{ fontSize: '1.1rem' }}>{Math.min(xp, goal)}</div>
              <div class="small muted">/ {goal} XP</div>
            </div>
          </Ring>
          <div class="grow">
            <h2 style={{ margin: 0 }}>{xp >= goal ? 'Daily goal done! 🎉' : 'Today'}</h2>
            <div class="muted small">
              🔥 {streak}-day streak · best {progress.streak.best}
            </div>
            <div class="muted small">A session is about 5–10 minutes.</div>
          </div>
        </div>
      </div>

      <div class="stack">
        {due > 0 && (
          <a class="btn primary block" href={href('/quiz/review')}>
            🔁 Review {Math.min(due, REVIEW_BATCH)} due item{due === 1 ? '' : 's'}
            {due > REVIEW_BATCH ? ` (${due} total)` : ''}
          </a>
        )}
        {unit && (
          <a class={`btn block ${due > 0 ? '' : 'primary'}`} href={href(`/unit/${unit.id}`)}>
            ▶ {progress.units[unit.id] ? 'Retry' : 'Continue'}: {stage.title} · {unit.title}
          </a>
        )}
        {bossReady && (
          <a class="btn block primary" href={href(`/quiz/boss/${stage.id}`)}>
            ⚔️ {stage.title} boss exam
          </a>
        )}
      </div>

      <div class="section-title">Practice</div>
      <div class="row" style={{ gap: '10px' }}>
        <a class="btn grow" href={href('/quiz/speed')}>
          ⚡ Speed round
        </a>
        <a class="btn grow" href={href('/notebook')}>
          📓 Mistakes {mistakes ? `(${mistakes})` : ''}
        </a>
      </div>

      <div class="section-title">Your path</div>
      <a class="card stage-card" href={href(`/stage/${stage.id}`)} style={{ display: 'flex' }}>
        <div class="emblem" lang="ja">
          {stage.jp.slice(0, 2)}
        </div>
        <div class="grow">
          <div style={{ fontWeight: 700 }}>{stage.title}</div>
          <div class="small muted">
            {stage.units.filter((u) => progress.units[u.id]?.passed).length} / {stage.units.length} units
          </div>
          <div class="progress" style={{ marginTop: '6px' }}>
            <div style={{ width: `${stageCompletion(stage, progress) * 100}%` }} />
          </div>
        </div>
      </a>
      <p class="small muted center">
        {learnedCount(progress)} items learned · {matureCount(progress)} well-known
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- Map

export function MapScreen() {
  const { content, progress } = useStore();
  if (!content) return <Loading />;
  return (
    <div>
      <h1>Map</h1>
      <p class="muted">Graduate each stage’s boss exam to unlock the next.</p>
      <div class="map-path">
        {content.stages.map((s) => {
          const unlocked = isStageUnlocked(s, progress);
          const done = isStageGraduated(s.id, progress);
          const pct = stageCompletion(s, progress);
          const cls = `card stage-card ${unlocked ? '' : 'locked'} ${done ? 'done' : ''}`;
          const body = (
            <>
              <div class="emblem" lang="ja">
                {done ? '🎓' : unlocked ? s.jp.slice(0, 2) : '🔒'}
              </div>
              <div class="grow">
                <div style={{ fontWeight: 700 }}>
                  {s.title} <span class="muted small" lang="ja">{s.jp !== s.title ? s.jp : ''}</span>
                </div>
                <div class="small muted">{s.blurb}</div>
                {s.available && (
                  <>
                    <div class="progress" style={{ marginTop: '6px' }}>
                      <div style={{ width: `${pct * 100}%` }} />
                    </div>
                    <div class="small muted" style={{ marginTop: '2px' }}>
                      {s.units.filter((u) => progress.units[u.id]?.passed).length}/{s.units.length} units{done ? ' · graduated' : ''}
                    </div>
                  </>
                )}
                {!unlocked && s.available && <div class="small">Pass the previous boss exam to unlock</div>}
              </div>
            </>
          );
          return unlocked ? (
            <a key={s.id} class={cls} href={href(`/stage/${s.id}`)}>
              {body}
            </a>
          ) : (
            <div key={s.id} class={cls} aria-disabled="true">
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Stage

const KIND_LABEL: Record<string, string> = {
  kana: 'kana',
  words: 'words',
  confusables: 'drill',
  vocab: 'vocab',
  kanji: 'kanji',
  grammar: 'grammar',
  reading: 'reading',
};

export function StageScreen({ id }: { id: string }) {
  const { content, progress } = useStore();
  const currentRef = useRef<HTMLAnchorElement>(null);
  const stage = content?.stages.find((s) => s.id === id);
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center' });
  }, [stage]);
  if (!content) return <Loading />;
  if (!stage) return <p>Unknown stage.</p>;
  if (!isStageUnlocked(stage, progress)) {
    return (
      <div class="card center">
        <h2>🔒 {stage.title} is locked</h2>
        <p class="muted">{stage.available ? 'Graduate the previous stage first.' : 'This stage arrives in a later phase.'}</p>
        <a class="btn" href={href('/map')}>
          Back to map
        </a>
      </div>
    );
  }
  const cur = currentUnitIndex(stage, progress);
  const bossOpen = isBossUnlocked(stage, progress);
  const boss = progress.bosses[stage.id as StageId];
  const grammarHere = stage.units.flatMap((u) => u.grammar ?? []);
  return (
    <div>
      <div class="row between">
        <h1 style={{ margin: 0 }}>
          {stage.title} <span class="muted" lang="ja">{stage.jp !== stage.title ? stage.jp : ''}</span>
        </h1>
        <Ring value={stageCompletion(stage, progress)} size={52} stroke={6}>
          <span class="small">{Math.round(stageCompletion(stage, progress) * 100)}%</span>
        </Ring>
      </div>
      <p class="muted">{stage.blurb}</p>
      <div class="unit-list">
        {stage.units.map((u, i) => {
          const rec = progress.units[u.id];
          const open = isUnitUnlocked(stage, i, progress);
          const cls = `unit ${rec?.passed ? 'passed' : ''} ${i === cur ? 'current' : ''} ${open ? '' : 'locked'}`;
          const inner = (
            <>
              <div class="node">{rec?.passed ? '✓' : i + 1}</div>
              <div class="meta">
                <div class="t">
                  <span class={`kind-tag ${u.kind}`}>{KIND_LABEL[u.kind]}</span>
                  <span lang="ja">{u.title}</span>
                </div>
                <div class="s" lang="ja">
                  {u.subtitle}
                </div>
              </div>
              {rec && <div class="score">{Math.round(rec.best * 100)}%</div>}
            </>
          );
          return open ? (
            <a key={u.id} class={cls} href={href(`/unit/${u.id}`)} ref={i === cur ? currentRef : undefined}>
              {inner}
            </a>
          ) : (
            <div key={u.id} class={cls}>
              {inner}
            </div>
          );
        })}
        {(() => {
          const cls = `unit boss ${boss?.passed ? 'passed' : ''} ${bossOpen ? (boss?.passed ? '' : 'current') : 'locked'}`;
          const inner = (
            <>
              <div class="node">{boss?.passed ? '🎓' : '⚔️'}</div>
              <div class="meta">
                <div class="t">Boss exam</div>
                <div class="s">{bossOpen ? `Mixed test of the whole stage · need 85%` : 'Clear every unit to unlock'}</div>
              </div>
              {boss && <div class="score">{Math.round(boss.best * 100)}%</div>}
            </>
          );
          return bossOpen ? (
            <a class={cls} href={href(`/quiz/boss/${stage.id}`)}>
              {inner}
            </a>
          ) : (
            <div class={cls}>{inner}</div>
          );
        })()}
        {boss && !boss.passed && boss.weak.length > 0 && (
          <a class="btn block" href={href(`/quiz/drill/${stage.id}`)}>
            🎯 Drill {boss.weak.length} weak item{boss.weak.length === 1 ? '' : 's'}
          </a>
        )}
      </div>
      {grammarHere.length > 0 && progress.grammarSeen.length > 0 && (
        <>
          <div class="section-title">Grammar you’ve learned</div>
          <div class="card flat">
            {grammarHere
              .filter((g) => progress.grammarSeen.includes(g))
              .map((g) => (
                <div class="list-item" key={g}>
                  <a href={href(`/grammar/${g}`)} class="grow" lang="ja">
                    {content.grammar[g].title}
                  </a>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

export function GrammarScreen({ id }: { id: string }) {
  const { content } = useStore();
  if (!content) return <Loading />;
  const g = content.grammar[id];
  if (!g) return <p>Unknown grammar point.</p>;
  return (
    <div>
      <a class="btn small ghost" href={href('/stage/n5')}>
        ← N5
      </a>
      <GrammarLesson g={g} />
    </div>
  );
}

// ---------------------------------------------------------------- Notebook

export function NotebookScreen() {
  const { content, progress } = useStore();
  if (!content) return <Loading />;
  const entries = Object.entries(progress.mistakes)
    .filter(([id]) => content.items.has(id))
    .sort((a, b) => b[1].last - a[1].last);
  return (
    <div>
      <h1>Mistakes notebook</h1>
      <p class="muted">Everything you miss lands here. Get an item right 3 times in a row and it leaves the notebook.</p>
      {entries.length > 0 ? (
        <>
          <a class="btn primary block" href={href('/quiz/notebook')} style={{ marginBottom: '14px' }}>
            Practise these ({Math.min(entries.length, REVIEW_BATCH)})
          </a>
          <div class="card">
            {entries.map(([id, m]) => {
              const it = content.items.get(id)!;
              const jp = it.kind === 'kana' ? it.char : it.kind === 'word' ? it.jp : it.kind === 'kanji' ? it.char : '';
              return (
                <div class="list-item" key={id}>
                  <span class="li-jp">{jp && <Jp text={jp} reading={it.kind === 'word' ? it.reading : undefined} />}</span>
                  <span class="grow small">{jp ? itemLabel(it).split(' · ').slice(1).join(' · ') : itemLabel(it)}</span>
                  <span class="small muted" title="times missed / right in a row">
                    ✗{m.count} · {'●'.repeat(m.streak)}
                    {'○'.repeat(Math.max(0, 3 - m.streak))}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div class="card center">
          <p>Nothing here yet. 🎉</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Me (profile, badges)

export function MeScreen() {
  const { progress } = useStore();
  const now = Date.now();
  const lvl = playerLevel(progress.xpTotal);
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now - (13 - i) * 86_400_000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { key, xp: progress.xpByDay[key] ?? 0, label: d.toLocaleDateString(undefined, { weekday: 'narrow' }) };
  });
  const maxXp = Math.max(progress.settings.dailyGoal, ...days.map((d) => d.xp));
  return (
    <div>
      <div class="card">
        <div class="row">
          <Ring value={lvl.into / lvl.span} size={76} stroke={8} color="var(--indigo)">
            <div>
              <div class="small muted">Lv</div>
              <div style={{ fontSize: '1.3rem' }}>{lvl.level}</div>
            </div>
          </Ring>
          <div class="grow">
            <h2 style={{ margin: 0 }}>{progress.xpTotal.toLocaleString()} XP</h2>
            <div class="small muted">
              {lvl.span - lvl.into} XP to level {lvl.level + 1}
            </div>
            <div class="small muted">
              🔥 {currentStreak(progress, now)}-day streak (best {progress.streak.best})
            </div>
          </div>
        </div>
      </div>
      <div class="card">
        <h3>Last 14 days</h3>
        <div class="row" style={{ alignItems: 'flex-end', height: '90px', gap: '4px' }} role="img" aria-label="XP per day for the last 14 days">
          {days.map((d) => (
            <div key={d.key} class="grow center" title={`${d.key}: ${d.xp} XP`}>
              <div
                style={{
                  height: `${Math.max(3, (d.xp / maxXp) * 64)}px`,
                  background: d.xp >= progress.settings.dailyGoal ? 'var(--good)' : d.xp ? 'var(--accent)' : 'var(--surface-2)',
                  borderRadius: '4px',
                }}
              />
              <div class="small muted">{d.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div class="stat-grid" style={{ marginBottom: '14px' }}>
        <div class="stat">
          <div class="v">{learnedCount(progress)}</div>
          <div class="k">learned</div>
        </div>
        <div class="stat">
          <div class="v">{matureCount(progress)}</div>
          <div class="k">well-known</div>
        </div>
        <div class="stat">
          <div class="v">{progress.bestCombo}</div>
          <div class="k">best combo</div>
        </div>
      </div>
      <h2>Badges</h2>
      <div class="badges">
        {BADGES.map((b) => (
          <div key={b.id} class={`badge ${progress.badges[b.id] ? 'earned' : 'locked'}`} title={b.desc}>
            <div class="b-ico" lang="ja">
              {b.icon}
            </div>
            <div style={{ fontWeight: 700 }}>{b.title}</div>
            <div class="muted">{b.desc}</div>
          </div>
        ))}
      </div>
      <div class="stack" style={{ marginTop: '18px' }}>
        <a class="btn block" href={href('/settings')}>
          ⚙️ Settings, backup & restore
        </a>
        <a class="btn block ghost" href={href('/credits')}>
          Credits & licenses
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Settings

function Toggle({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="toggle">
      <span>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {sub && <div class="small muted">{sub}</div>}
      </span>
      <span class="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
        <span />
      </span>
    </label>
  );
}

export function SettingsScreen() {
  const { progress } = useStore();
  const s = progress.settings;
  const [voice, setVoice] = useState(voiceName());
  const [exported, setExported] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => onVoicesChanged(() => setVoice(voiceName())), []);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => updateProgress((p) => void (p.settings[k] = v));

  const doExport = async () => {
    const json = exportProgress(progress);
    setExported(json);
    const name = `kana-quest-progress-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([json], name, { type: 'application/json' });
    // Phones: the share sheet (save to Files, send to yourself). Desktop: a download.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Kana Quest progress' });
        return;
      } catch {
        /* fall back to download */
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const doImport = async (file: File) => {
    try {
      const p = importProgress(await file.text());
      if (!confirm(`Replace the progress on this device with the file’s (${p.xpTotal} XP, ${Object.keys(p.cards).length} items learned)?`)) return;
      replaceProgress(p);
      await flushSave();
      toast('Progress imported ✓');
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <h1>Settings</h1>
      <div class="card">
        <Toggle label="Romaji assist" sub="Show romaji when you tap Japanese text and after answers. Turn off to wean yourself off it." checked={s.romajiAssist} onChange={(v) => set('romajiAssist', v)} />
        <Toggle label="Sound effects" checked={s.sound} onChange={(v) => set('sound', v)} />
        <Toggle label="Animations" sub="Confetti, shakes and transitions" checked={s.animations} onChange={(v) => set('animations', v)} />
        <Toggle label="Writing in quizzes" sub="Include stroke-order tracing questions" checked={s.writingInQuizzes} onChange={(v) => set('writingInQuizzes', v)} />
      </div>

      <div class="card">
        <div style={{ fontWeight: 600, marginBottom: '8px' }}>Daily goal</div>
        <div class="seg">
          {DAILY_GOALS.map((g) => (
            <button key={g} class={s.dailyGoal === g ? 'on' : ''} onClick={() => set('dailyGoal', g)}>
              {g} XP
            </button>
          ))}
        </div>
        <p class="small muted" style={{ marginTop: '8px', marginBottom: 0 }}>
          About {Math.round(s.dailyGoal / 10)}–{Math.round(s.dailyGoal / 6)} minutes. Meeting it keeps your streak going.
        </p>
      </div>

      <div class="card">
        <div style={{ fontWeight: 600, marginBottom: '8px' }}>Theme</div>
        <div class="seg">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button key={t} class={s.theme === t ? 'on' : ''} onClick={() => set('theme', t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div class="card">
        <div style={{ fontWeight: 600 }}>Japanese voice</div>
        <p class="small muted">{voice ? `Using: ${voice}` : 'No Japanese voice found on this device, so listening exercises are skipped. On Android, install Japanese in Google Text-to-speech; on iOS, add a Japanese voice under Accessibility › Spoken Content.'}</p>
        <div class="row">
          <span class="small" style={{ minWidth: '70px' }}>
            Speed {s.speechRate.toFixed(1)}×
          </span>
          <input class="grow" type="range" min="0.5" max="1.2" step="0.1" value={s.speechRate} onInput={(e) => set('speechRate', Number((e.target as HTMLInputElement).value))} />
          <button class="btn small" onClick={() => speak('こんにちは。にほんごを べんきょうしましょう。', s.speechRate)} disabled={!speechAvailable()}>
            Test
          </button>
        </div>
      </div>

      <div class="card">
        <div style={{ fontWeight: 600 }}>Backup & move between devices</div>
        <p class="small muted">Progress is saved on this device only. Export a file here, then import it on your other device.</p>
        <div class="row wrap">
          <button class="btn" onClick={doExport}>
            ⬇ Export progress
          </button>
          <button class="btn" onClick={() => fileRef.current?.click()}>
            ⬆ Import progress
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f) doImport(f);
            (e.target as HTMLInputElement).value = '';
          }} />
        </div>
        {exported && (
          <details style={{ marginTop: '10px' }}>
            <summary class="small muted">Show exported data (copy/paste)</summary>
            <textarea class="export" readOnly value={exported} onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />
          </details>
        )}
      </div>

      <div class="card">
        <div style={{ fontWeight: 600 }}>Reset</div>
        <p class="small muted">Erase all progress on this device. Export first if you might want it back.</p>
        <button
          class="btn bad"
          onClick={() => {
            if (confirm('Erase ALL progress on this device? This cannot be undone.')) {
              replaceProgress(defaultProgress());
              toast('Progress reset');
            }
          }}
        >
          Reset progress
        </button>
      </div>
      <a class="btn block ghost" href={href('/credits')}>
        Credits & licenses
      </a>
    </div>
  );
}

// ---------------------------------------------------------------- Credits

export function CreditsScreen() {
  return (
    <div>
      <h1>Credits & licenses</h1>
      <p class="muted">Kana Quest is built on open data. Thank you to everyone who made it.</p>
      <div class="card">
        <h3>JMdict (vocabulary)</h3>
        <p class="small">
          Readings, meanings and parts of speech come from the JMdict dictionary files, the property of the{' '}
          <a href="https://www.edrdg.org/" target="_blank" rel="noopener">
            Electronic Dictionary Research and Development Group
          </a>
          , used in conformance with the Group’s{' '}
          <a href="https://www.edrdg.org/edrdg/licence.html" target="_blank" rel="noopener">
            licence
          </a>{' '}
          (CC BY-SA 4.0).
        </p>
        <h3>KANJIDIC2 (kanji)</h3>
        <p class="small">
          Kanji meanings, readings and stroke counts come from KANJIDIC2, also property of the EDRDG, used under the same licence (CC BY-SA 4.0).
        </p>
        <h3>KanjiVG (stroke order)</h3>
        <p class="small">
          Stroke order data for kana and kanji comes from{' '}
          <a href="https://kanjivg.tagaini.net/" target="_blank" rel="noopener">
            KanjiVG
          </a>{' '}
          by Ulrich Apel and contributors, licensed under{' '}
          <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">
            CC BY-SA 3.0
          </a>
          .
        </p>
        <h3>Tatoeba (example sentences)</h3>
        <p class="small">
          Example and reading sentences, their English translations and furigana come from{' '}
          <a href="https://tatoeba.org/" target="_blank" rel="noopener">
            Tatoeba
          </a>{' '}
          and its contributors, licensed under{' '}
          <a href="https://creativecommons.org/licenses/by/2.0/fr/" target="_blank" rel="noopener">
            CC BY 2.0 FR
          </a>
          .
        </p>
        <h3>JLPT level lists</h3>
        <p class="small">
          The JLPT has no official word lists. Level assignment uses Jonathan Waller’s JLPT lists (tanos.co.uk, CC BY), via{' '}
          <a href="https://github.com/jamsinclair/open-anki-jlpt-decks" target="_blank" rel="noopener">
            open-anki-jlpt-decks
          </a>{' '}
          (MIT) for vocabulary and{' '}
          <a href="https://github.com/davidluzgouveia/kanji-data" target="_blank" rel="noopener">
            davidluzgouveia/kanji-data
          </a>{' '}
          (MIT) for kanji.
        </p>
        <h3>Software & fonts</h3>
        <p class="small">
          WanaKana (MIT), ts-fsrs (MIT), Preact (MIT), idb-keyval (Apache-2.0), Vite and vite-plugin-pwa (MIT). Noto Sans JP by Google, SIL Open Font
          License 1.1.
        </p>
        <h3>Share-alike</h3>
        <p class="small" style={{ margin: 0 }}>
          The processed data files in <code>public/data/</code> are derived from the sources above and are distributed under CC BY-SA 4.0 (Tatoeba-derived
          sentences remain CC BY 2.0 FR). Grammar explanations and reading passages were written for this app.
        </p>
      </div>
    </div>
  );
}

export function Loading() {
  const { error } = useStore();
  return <div class="loading">{error ? `Couldn’t load lesson data: ${error}` : 'Loading…'}</div>;
}
