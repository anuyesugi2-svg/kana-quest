// Runs a quiz session: unit quiz, boss exam, weak-item drill, review, notebook practice, speed round.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Content } from '../content/index';
import { isSrsItem, itemLabel } from '../content/index';
import {
  addXp,
  enrollItems,
  noteAnswer,
  recordBoss,
  recordUnit,
  srsAnswer,
  todayXp,
  XP,
} from '../core/progress';
import { bossQuiz, practiceQuiz, questionFor, unitQuiz, type Question } from '../core/quiz';
import { pick, shuffle } from '../core/rng';
import type { AnswerOutcome } from '../core/srs';
import { dueIds } from '../core/srs';
import type { Stage, StageId } from '../core/types';
import { BOSS_PASS, UNIT_PASS } from '../core/unlock';
import { QuestionView, type AnswerEvent } from './Exercise';
import { closePopover, Jp } from './Jp';
import { makeCtx, stageOf, stagePool } from './quizctx';
import { go, href } from './router';
import { play } from './sound';
import { speak } from './speech';
import { celebrate, getState, restartSession, toast, updateProgress, useStore } from './store';

export type SessionKind = 'unit' | 'boss' | 'drill' | 'review' | 'notebook' | 'speed';

export const REVIEW_BATCH = 20;
const SPEED_SECONDS = 60;
const DRILL_REPS = 2;

interface Slot {
  q: Question;
  scored: boolean;
}

interface Summary {
  kind: SessionKind;
  correct: number;
  total: number;
  passed?: boolean;
  firstPass?: boolean;
  xp: number;
  missed: string[];
  bestCombo: number;
  stage?: Stage;
  unitIndex?: number;
}

function bossLength(stage: Stage) {
  return stage.id === 'hiragana' || stage.id === 'katakana' ? 30 : 40;
}

/** Build the initial question list for a session. */
function buildSession(kind: SessionKind, arg: string | undefined, content: Content): { slots: Slot[]; stage?: Stage; unitIndex?: number } {
  const p = getState().progress;
  const now = Date.now();
  if (kind === 'unit') {
    const stage = content.stages.find((s) => s.units.some((u) => u.id === arg))!;
    const unitIndex = stage.units.findIndex((u) => u.id === arg);
    const ctx = makeCtx(content, stagePool(content, stage, unitIndex));
    return { slots: unitQuiz(stage.units[unitIndex], ctx).map((q) => ({ q, scored: true })), stage, unitIndex };
  }
  if (kind === 'boss' || kind === 'drill') {
    const stage = content.stages.find((s) => s.id === arg)!;
    const ctx = makeCtx(content, stagePool(content, stage));
    const ids = content.stageItems[stage.id].filter((i) => !i.startsWith('p:'));
    const weak = p.bosses[stage.id as StageId]?.weak ?? [];
    if (kind === 'boss') return { slots: bossQuiz(ids, weak, ctx, bossLength(stage)).map((q) => ({ q, scored: true })), stage };
    const drillIds = weak.length ? weak : ids.slice(0, 10);
    const qs = drillIds.flatMap((id) => Array.from({ length: DRILL_REPS }, () => questionFor(content.items.get(id)!, 'drill', ctx)));
    return { slots: shuffle(qs).map((q) => ({ q, scored: true })), stage };
  }
  if (kind === 'review' || kind === 'notebook') {
    const ids =
      kind === 'review'
        ? dueIds(p.cards, now, REVIEW_BATCH).filter((id) => content.items.has(id))
        : Object.entries(p.mistakes)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([id]) => id)
            .filter((id) => content.items.has(id))
            .slice(0, REVIEW_BATCH);
    const pool = poolForItems(content, ids);
    const ctx = makeCtx(content, pool);
    return { slots: practiceQuiz(ids, kind === 'review' ? 'review' : 'drill', ctx).map((q) => ({ q, scored: true })) };
  }
  return { slots: [] };
}

function poolForItems(content: Content, ids: string[]) {
  const stages = new Set(ids.map((id) => stageOf(content, id)).filter(Boolean) as Stage[]);
  const pool = [...stages].flatMap((s) => stagePool(content, s));
  return pool.length ? pool : [...content.items.values()];
}

/** Items available for a speed round: everything learned, else the first hiragana units. */
function speedItems(content: Content): string[] {
  const learned = Object.keys(getState().progress.cards).filter((id) => content.items.has(id) && !id.startsWith('g:'));
  if (learned.length >= 8) return learned;
  return content.stages[0].units.slice(0, 2).flatMap((u) => u.items);
}

export function Session({ kind, arg }: { kind: SessionKind; arg?: string }) {
  const { content, progress } = useStore();
  const settings = progress.settings;
  const init = useMemo(() => (content ? buildSession(kind, arg, content) : { slots: [] as Slot[] }), [content, kind, arg]);
  const [slots, setSlots] = useState<Slot[]>(init.slots);
  const [pos, setPos] = useState(0);
  const [answered, setAnswered] = useState<AnswerEvent | null>(null);
  const [peeked, setPeeked] = useState(false);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [anim, setAnim] = useState('');
  const [timeLeft, setTimeLeft] = useState(SPEED_SECONDS);
  const stats = useRef({ correct: 0, total: 0, xp: 0, missed: [] as string[], outcomes: {} as Record<string, AnswerOutcome>, requeued: new Set<string>() });
  const speedCtx = useMemo(() => {
    if (kind !== 'speed' || !content) return null;
    const ids = speedItems(content);
    return { ids, ctx: makeCtx(content, poolForItems(content, ids)) };
  }, [content, kind]);

  // Speed rounds generate questions on the fly.
  useEffect(() => {
    if (kind === 'speed' && speedCtx && slots.length === 0) {
      setSlots(Array.from({ length: 3 }, () => ({ q: questionFor(content!.items.get(pick(speedCtx.ids))!, 'speed', speedCtx.ctx), scored: true })));
    }
  }, [speedCtx]);

  useEffect(() => {
    if (kind !== 'speed' || summary) return;
    const t = setInterval(() => setTimeLeft((x) => x - 1), 1000);
    return () => clearInterval(t);
  }, [summary]);
  useEffect(() => {
    if (kind === 'speed' && timeLeft <= 0 && !summary) finish();
  }, [timeLeft]);

  // Enter continues after feedback.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && answered && !summary && kind !== 'speed') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!content) return <div class="loading">Loading…</div>;

  if (!summary && slots.length === 0 && kind !== 'speed') {
    return (
      <div class="card center">
        <h2>{kind === 'review' ? 'No reviews due 🎉' : kind === 'notebook' ? 'Your notebook is empty 🎉' : 'Nothing to practise'}</h2>
        <p class="muted">{kind === 'review' ? 'Everything you’ve learned is fresh. Come back later, or learn something new.' : 'Mistakes you make show up here until you get them right three times in a row.'}</p>
        <a class="btn primary" href={href('/')}>
          Back home
        </a>
      </div>
    );
  }
  if (summary) return <Results s={summary} />;

  const slot = slots[pos];
  if (!slot) return <div class="loading">Loading…</div>;
  const q = slot.q;
  const scoredTotal = slots.filter((s) => s.scored).length;
  // Dev server only: lets the end-to-end script (scripts/e2e.mjs) see the current question.
  if (import.meta.env.DEV) (window as unknown as { __kqQuestion: Question }).__kqQuestion = q;

  function onAnswer(a: AnswerEvent) {
    const now = Date.now();
    const st = stats.current;
    const counted = a.correct && !peeked;
    setAnswered(a);
    play(a.correct ? 'correct' : 'wrong', settings.sound, combo);
    setAnim(a.correct ? 'pulse' : 'shake');
    if (!a.correct) speak(q.speak ?? '', settings.speechRate);

    const newCombo = a.correct ? combo + 1 : 0;
    setCombo(newCombo);
    setBestCombo((b) => Math.max(b, newCombo));
    if (kind === 'speed' && newCombo > 0 && newCombo % 5 === 0) play('combo', settings.sound);

    if (slot.scored) {
      st.total++;
      if (counted) st.correct++;
      else st.missed.push(q.itemId);
      const prev = st.outcomes[q.itemId];
      st.outcomes[q.itemId] = {
        correct: (prev?.correct ?? true) && a.correct,
        hinted: (prev?.hinted ?? false) || peeked,
      };
    }

    let xp = 0;
    if (kind === 'speed') xp = a.correct ? Math.min(4, 1 + Math.floor(combo / 5)) : 0;
    else if (counted && slot.scored) xp = kind === 'drill' ? XP.drill : XP.correct;
    st.xp += xp;

    updateProgress((p) => {
      noteAnswer(p, q.itemId, counted, now);
      if (kind === 'review' && slot.scored && isSrsItem(q.itemId)) srsAnswer(p, q.itemId, { correct: a.correct, hinted: peeked }, now);
      if (xp) {
        const goalMet = addXp(p, xp, now);
        if (goalMet) {
          toast(`🎯 Daily goal reached! 🔥 ${p.streak.current}-day streak`);
          celebrate();
        }
      }
    });

    // Missed questions come back once (not scored) so you see the right answer in action.
    if (!a.correct && kind !== 'speed' && kind !== 'boss') {
      const key = q.itemId;
      if (kind === 'drill' || !st.requeued.has(key)) {
        st.requeued.add(key);
        const item = content!.items.get(key)!;
        const ctx = makeCtx(content!, slotPool());
        const again = questionFor(item, kind === 'drill' ? 'drill' : 'learn', ctx, [q.mode]);
        setSlots((s) => [...s, { q: again, scored: kind === 'drill' }]);
      }
    }
    if (kind === 'speed') {
      setTimeout(() => next(), a.correct ? 280 : 1100);
    }
  }

  function slotPool() {
    if (init.stage) return stagePool(content!, init.stage, init.unitIndex);
    return poolForItems(content!, slots.map((s) => s.q.itemId));
  }

  function next() {
    closePopover();
    setAnswered(null);
    setPeeked(false);
    setAnim('');
    if (kind === 'speed' && speedCtx) {
      setSlots((s) => [...s, { q: questionFor(content!.items.get(pick(speedCtx.ids))!, 'speed', speedCtx.ctx), scored: true }]);
      setPos((x) => x + 1);
      return;
    }
    if (pos + 1 >= slots.length) finish();
    else setPos(pos + 1);
  }

  function finish() {
    const st = stats.current;
    const now = Date.now();
    const s: Summary = { kind, correct: st.correct, total: st.total, xp: st.xp, missed: [...new Set(st.missed)], bestCombo, stage: init.stage, unitIndex: init.unitIndex };
    updateProgress((p) => {
      let bonus = 0;
      if (kind === 'unit' && init.stage && init.unitIndex !== undefined) {
        const unit = init.stage.units[init.unitIndex];
        const r = recordUnit(p, unit.id, st.correct, st.total);
        s.passed = r.passed;
        s.firstPass = r.firstPass;
        if (r.passed) {
          const srs = Object.fromEntries(Object.entries(st.outcomes).filter(([id]) => isSrsItem(id)));
          // Grammar units: enrol the grammar points themselves.
          for (const g of unit.grammar ?? []) srs[`g:${g}`] ??= { correct: true };
          enrollItems(p, srs, now);
          bonus = r.firstPass ? XP.unitFirstPass : XP.unitRepeatPass;
          if (st.correct === st.total) bonus += XP.perfectBonus;
          for (const g of unit.grammar ?? []) if (!p.grammarSeen.includes(g)) p.grammarSeen.push(g);
        }
      }
      if (kind === 'boss' && init.stage) {
        const r = recordBoss(p, init.stage.id, st.correct, st.total, s.missed);
        s.passed = r.passed;
        s.firstPass = r.firstPass;
        for (const id of s.missed) if (p.cards[id]) srsAnswer(p, id, { correct: false }, now);
        if (r.firstPass) bonus = XP.bossPass;
      }
      if (kind === 'speed') p.bestCombo = Math.max(p.bestCombo, bestCombo);
      if (bonus) {
        s.xp += bonus;
        if (addXp(p, bonus, now)) toast(`🎯 Daily goal reached! 🔥 ${p.streak.current}-day streak`);
      }
    });
    const good = kind === 'unit' || kind === 'boss' ? s.passed : true;
    play(good ? 'complete' : 'fail', settings.sound);
    if (good && (s.firstPass || kind === 'speed')) celebrate();
    setSummary(s);
  }

  const progressPct = kind === 'speed' ? (timeLeft / SPEED_SECONDS) * 100 : (Math.min(pos, scoredTotal) / Math.max(1, scoredTotal)) * 100;
  const isPractice = !slot.scored && kind !== 'drill';

  return (
    <div key={q.key}>
      <div class="quiz-top">
        <a class="icon-btn" href={href(init.stage ? `/stage/${init.stage.id}` : '/')} aria-label="Quit">
          ✕
        </a>
        <div class={`progress ${kind === 'speed' ? 'gold' : ''}`}>
          <div style={{ width: `${progressPct}%` }} />
        </div>
        {kind === 'speed' ? (
          <span class={`timer ${timeLeft <= 10 ? 'low' : ''}`}>{timeLeft}s</span>
        ) : (
          <span class="combo">{combo >= 3 ? `🔥${combo}` : ''}</span>
        )}
      </div>
      {kind === 'speed' && (
        <div class="row between small" style={{ marginBottom: '8px' }}>
          <span class="muted">Score {stats.current.xp}</span>
          <span class="combo">{combo >= 5 ? `×${Math.min(4, 1 + Math.floor(combo / 5))} combo!` : combo > 0 ? `${combo} in a row` : ''}</span>
        </div>
      )}
      {isPractice && <div class="chip" style={{ marginBottom: '10px' }}>↺ Practice again (not scored)</div>}
      {/* The shake/pulse transform lives on this wrapper only: a transformed ancestor would break the fixed feedback panel. */}
      <div class={anim}>
        <QuestionView q={q} onAnswer={onAnswer} answered={answered} onPeek={() => !answered && setPeeked(true)} />
      </div>
      {answered && kind !== 'speed' && <Feedback q={q} a={answered} peeked={peeked} scoredKind={kind === 'unit' || kind === 'boss'} onNext={next} />}
      {answered && <div class="spacer-for-feedback" />}
    </div>
  );
}

function Feedback({ q, a, peeked, scoredKind, onNext }: { q: Question; a: AnswerEvent; peeked: boolean; scoredKind: boolean; onNext: () => void }) {
  const { progress } = useStore();
  const r = q.reveal;
  const ok = a.correct;
  const btn = useRef<HTMLButtonElement>(null);
  const praise = useMemo(() => pick(['Correct!', 'Nice!', 'すごい!', 'Great!', 'Yes!']), [q.key]);
  useEffect(() => {
    btn.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div class={`feedback ${ok ? 'ok' : 'no'}`} role="status">
      <div class="inner">
        <div class="row between">
          <div class="verdict">{ok ? praise : 'Not quite'}</div>
          {q.speak && (
            <button class="icon-btn" onClick={() => speak(q.speak!, progress.settings.speechRate)} aria-label="Play audio">
              🔊
            </button>
          )}
        </div>
        <div class="reveal">
          {(r.jp || r.furi) && (
            <div class="r-jp">
              {r.furi ? <Jp furi={r.furi} meaning={r.meaning} /> : <Jp text={r.jp!} reading={r.reading} meaning={r.meaning} />}
              {r.reading && r.reading !== r.jp && <span class="muted"> · {r.reading}</span>}
            </div>
          )}
          {r.romaji && progress.settings.romajiAssist && <div style={{ fontWeight: 700 }}>{r.romaji}</div>}
          {r.meaning && <div>{r.meaning}</div>}
          {r.note && <div class="small muted">{r.note}</div>}
          {!ok && a.given && <div class="small">Your answer: {a.given}</div>}
          {ok && peeked && scoredKind && <div class="small">You peeked, so this one counts as a miss.</div>}
        </div>
        <button ref={btn} class={`btn block ${ok ? 'good' : 'bad'}`} onClick={onNext}>
          Continue
        </button>
      </div>
    </div>
  );
}

function Results({ s }: { s: Summary }) {
  const { content, progress } = useStore();
  const pct = s.total ? Math.round((s.correct / s.total) * 100) : 0;
  const graded = s.kind === 'unit' || s.kind === 'boss';
  const need = s.kind === 'boss' ? BOSS_PASS : UNIT_PASS;
  const stage = s.stage;
  const nextStage = stage && content ? content.stages[content.stages.indexOf(stage) + 1] : undefined;
  const nextUnit = stage && s.unitIndex !== undefined ? stage.units[s.unitIndex + 1] : undefined;
  const goal = progress.settings.dailyGoal;
  const today = todayXp(progress, Date.now());

  let title = 'Session complete';
  if (s.kind === 'unit') title = s.passed ? (s.firstPass ? 'Unit cleared!' : 'Passed again!') : 'Almost there';
  if (s.kind === 'boss') title = s.passed ? `${stage?.title} graduated! 🎓` : 'Not yet — let’s drill';
  if (s.kind === 'speed') title = 'Time!';

  return (
    <div>
      <div class={`result-hero ${graded ? (s.passed ? 'pass' : 'fail') : 'pass'}`}>
        <h1>{title}</h1>
        {graded && <div class="score">{pct}%</div>}
        {s.kind === 'speed' && <div class="score">{s.xp}</div>}
        {graded && (
          <p class="muted">
            {s.correct} / {s.total} correct · need {Math.round(need * 100)}%
          </p>
        )}
      </div>
      <div class="stat-grid" style={{ marginBottom: '16px' }}>
        <div class="stat">
          <div class="v">+{s.xp}</div>
          <div class="k">XP</div>
        </div>
        <div class="stat">
          <div class="v">{s.bestCombo}</div>
          <div class="k">best combo</div>
        </div>
        <div class="stat">
          <div class="v">
            {Math.min(today, goal)}/{goal}
          </div>
          <div class="k">daily goal</div>
        </div>
      </div>

      {s.kind === 'boss' && s.passed && nextStage && (
        <div class="card center">
          <p>
            You unlocked <strong>{nextStage.title}</strong>
            {nextStage.available ? '!' : ' (coming in a later phase).'}
          </p>
        </div>
      )}
      {s.kind === 'unit' && s.passed && s.firstPass && (
        <div class="card flat small">These items are now in your spaced-repetition reviews.</div>
      )}

      {s.missed.length > 0 && content && (
        <div class="card">
          <h3>{s.kind === 'boss' && !s.passed ? 'Your weak spots' : 'To work on'}</h3>
          {s.missed.slice(0, 12).map((id) => {
            const it = content.items.get(id);
            return it ? (
              <div class="list-item" key={id}>
                <span class="grow">{itemLabel(it)}</span>
              </div>
            ) : null;
          })}
          {s.missed.length > 12 && <p class="small muted">…and {s.missed.length - 12} more (all in your mistakes notebook).</p>}
        </div>
      )}

      <div class="stack">
        {s.kind === 'unit' && s.passed && nextUnit && (
          <a class="btn primary block" href={href(`/unit/${nextUnit.id}`)}>
            Next: {nextUnit.title} →
          </a>
        )}
        {s.kind === 'unit' && s.passed && !nextUnit && stage && (
          <a class="btn primary block" href={href(`/quiz/boss/${stage.id}`)}>
            ⚔️ Take the boss exam
          </a>
        )}
        {s.kind === 'unit' && !s.passed && stage && s.unitIndex !== undefined && (
          <>
            <a class="btn primary block" href={href(`/unit/${stage.units[s.unitIndex].id}`)}>
              Review the lesson
            </a>
            <button class="btn block" onClick={restartSession}>
              Retry the quiz
            </button>
          </>
        )}
        {s.kind === 'boss' && !s.passed && stage && (
          <>
            <a class="btn primary block" href={href(`/quiz/drill/${stage.id}`)}>
              🎯 Drill weak items
            </a>
            <button class="btn block" onClick={restartSession}>
              Retry the boss exam
            </button>
          </>
        )}
        {s.kind === 'drill' && stage && (
          <a class="btn primary block" href={href(`/quiz/boss/${stage.id}`)}>
            ⚔️ Retry the boss exam
          </a>
        )}
        {s.kind === 'boss' && s.passed && nextStage?.available && (
          <a class="btn primary block" href={href(`/stage/${nextStage.id}`)}>
            Start {nextStage.title} →
          </a>
        )}
        {s.kind === 'speed' && (
          <button class="btn primary block" onClick={restartSession}>
            ⚡ Go again
          </button>
        )}
        <button class="btn block ghost" onClick={() => go(stage ? `/stage/${stage.id}` : '/')}>
          Done
        </button>
      </div>
    </div>
  );
}
