// Renders one question (prompt + answer UI) and reports the learner's answer.

import { useEffect, useRef, useState } from 'preact/hooks';
import { bind, unbind } from 'wanakana';
import { gradeKana, gradeMeaning, gradeRomaji } from '../core/grading';
import { furiText } from '../core/furigana';
import type { Question } from '../core/quiz';
import { Jp } from './Jp';
import { speak } from './speech';
import { getState, useStore } from './store';
import { TraceCanvas } from './Trace';

export interface AnswerEvent {
  correct: boolean;
  given: string;
}

export function QuestionView({
  q,
  onAnswer,
  answered,
  onPeek,
}: {
  q: Question;
  onAnswer: (a: AnswerEvent) => void;
  answered: AnswerEvent | null;
  onPeek: () => void;
}) {
  return (
    <div>
      <div class="instruction">{q.instruction}</div>
      <Prompt q={q} onPeek={onPeek} />
      <AnswerArea q={q} onAnswer={onAnswer} answered={answered} />
    </div>
  );
}

function Prompt({ q, onPeek }: { q: Question; onPeek: () => void }) {
  const { progress, content } = useStore();
  const rate = progress.settings.speechRate;
  const p = q.prompt;
  useEffect(() => {
    if (p.t === 'audio') {
      const t = setTimeout(() => speak(p.say, rate), 250);
      return () => clearTimeout(t);
    }
  }, [q.key]);

  if (p.t === 'jp') {
    return (
      <div class="prompt">
        <div class={p.size ?? 'lg'}>
          {p.furi ? <Jp furi={p.furi} onPeek={onPeek} /> : <Jp text={p.text} reading={q.reveal.reading} onPeek={onPeek} />}
        </div>
      </div>
    );
  }
  if (p.t === 'en') {
    return (
      <div class="prompt">
        <div>
          <div class="en">{p.text}</div>
          {p.sub && <div class="en-sub">{p.sub}</div>}
        </div>
      </div>
    );
  }
  if (p.t === 'audio') {
    return (
      <div class="prompt">
        <div class="stack" style={{ alignItems: 'center' }}>
          <button class="audio-btn" onClick={() => speak(p.say, rate)} aria-label="Play again">
            🔊
          </button>
          <button class="btn small ghost" onClick={() => speak(p.say, 0.6)}>
            🐢 Slower
          </button>
        </div>
      </div>
    );
  }
  if (p.t === 'blank') {
    const [before, after] = p.furi.split('＿');
    return (
      <div class="prompt">
        <div>
          <div class="md">
            <Jp furi={before} onPeek={onPeek} />
            <span class="blank">&nbsp;</span>
            <Jp furi={after ?? ''} onPeek={onPeek} />
          </div>
          <div class="en-sub" style={{ marginTop: '8px' }}>
            {p.en}
          </div>
        </div>
      </div>
    );
  }
  // passage question
  const passage = content?.passages[p.passageId];
  return (
    <div class="card" style={{ textAlign: 'left' }}>
      {passage && (
        <details>
          <summary class="small muted" style={{ cursor: 'pointer', marginBottom: '6px' }}>
            Show the passage
          </summary>
          {passage.lines.map((l, i) => (
            <div key={i} style={{ fontSize: '1.1rem' }}>
              <Jp furi={l.jp} meaning={l.en} />
            </div>
          ))}
        </details>
      )}
      <div class="en" style={{ fontWeight: 700, fontSize: '1.2rem', marginTop: '8px' }}>
        {p.q}
      </div>
    </div>
  );
}

function AnswerArea({ q, onAnswer, answered }: { q: Question; onAnswer: (a: AnswerEvent) => void; answered: AnswerEvent | null }) {
  const a = q.answer;
  switch (a.t) {
    case 'choice':
      return <Choices q={q} onAnswer={onAnswer} answered={answered} />;
    case 'romaji':
      return <TextAnswer key={q.key} mode="romaji" placeholder="romaji…" check={(s) => gradeRomaji(s, a.kana, a.alts)} onAnswer={onAnswer} answered={answered} />;
    case 'meaning':
      return <TextAnswer key={q.key} mode="english" placeholder="meaning in English…" check={(s) => gradeMeaning(s, a.meanings)} onAnswer={onAnswer} answered={answered} />;
    case 'kana':
      return <TextAnswer key={q.key} mode={a.script === 'k' ? 'katakana' : 'hiragana'} placeholder="type romaji → かな" check={(s) => gradeKana(s, a.expect)} onAnswer={onAnswer} answered={answered} />;
    case 'trace':
      return <TraceAnswer key={q.key} char={a.char} onAnswer={onAnswer} answered={answered} />;
    case 'tiles':
      return <Tiles key={q.key} tiles={a.tiles} answer={a.answer} onAnswer={onAnswer} answered={answered} />;
  }
}

function Choices({ q, onAnswer, answered }: { q: Question; onAnswer: (a: AnswerEvent) => void; answered: AnswerEvent | null }) {
  const { options, correct } = q.answer as Extract<Question['answer'], { t: 'choice' }>;
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => setPicked(null), [q.key]);
  const long = options.some((o) => (o.jp ? furiText(o.label).length > 5 : o.label.length > 14));
  const choose = (i: number) => {
    if (answered) return;
    setPicked(i);
    onAnswer({ correct: i === correct, given: options[i].label });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= options.length && !answered) choose(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div>
      <div class={`choices ${long ? 'long' : ''}`}>
        {options.map((o, i) => {
          const state = answered ? (i === correct ? 'right' : i === picked ? 'wrong' : '') : '';
          return (
            <button key={i} class={`choice ${o.jp ? 'jp-opt' : ''} ${state}`} onClick={() => choose(i)} disabled={!!answered} lang={o.jp ? 'ja' : 'en'}>
              <span class="key">{i + 1}</span>
              {o.jp ? furiText(o.label) : o.label}
            </button>
          );
        })}
      </div>
      <div class="kbd-hint">Keys 1–{options.length} to answer, Enter to continue</div>
    </div>
  );
}

function TextAnswer({
  mode,
  placeholder,
  check,
  onAnswer,
  answered,
}: {
  mode: 'romaji' | 'english' | 'hiragana' | 'katakana';
  placeholder: string;
  check: (s: string) => boolean;
  onAnswer: (a: AnswerEvent) => void;
  answered: AnswerEvent | null;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (mode === 'hiragana' || mode === 'katakana') bind(el, { IMEMode: mode === 'katakana' ? 'toKatakana' : 'toHiragana' });
    // Focus without scrolling the prompt away on phones.
    el.focus({ preventScroll: true });
    return () => {
      if (mode === 'hiragana' || mode === 'katakana') {
        try {
          unbind(el);
        } catch {
          /* already unbound */
        }
      }
    };
  }, []);
  const submit = (e?: Event) => {
    e?.preventDefault();
    const v = ref.current?.value ?? value;
    if (answered || !v.trim()) return;
    onAnswer({ correct: check(v), given: v });
  };
  const state = answered ? (answered.correct ? 'right' : 'wrong') : '';
  return (
    <form onSubmit={submit} class="stack">
      <input
        ref={ref}
        class={`answer-input ${state}`}
        lang={mode === 'romaji' || mode === 'english' ? 'en' : 'ja'}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellcheck={false}
        enterKeyHint="done"
        readOnly={!!answered}
        onInput={(e) => setValue((e.target as HTMLInputElement).value)}
      />
      {!answered && (
        <button class="btn primary block" type="submit" disabled={!value.trim()}>
          Check
        </button>
      )}
    </form>
  );
}

function TraceAnswer({ char, onAnswer, answered }: { char: string; onAnswer: (a: AnswerEvent) => void; answered: AnswerEvent | null }) {
  const paths = getState().strokes[char];
  if (!paths) {
    return (
      <div class="card center">
        <p>Stroke data isn’t loaded yet.</p>
        <button class="btn" onClick={() => onAnswer({ correct: true, given: char })}>
          Skip
        </button>
      </div>
    );
  }
  return (
    <TraceCanvas
      paths={paths}
      disabled={!!answered}
      onDone={(r) => onAnswer({ correct: r.misses <= Math.max(2, Math.floor(r.strokes / 3)), given: char })}
    />
  );
}

function Tiles({ tiles, answer, onAnswer, answered }: { tiles: string[]; answer: string[]; onAnswer: (a: AnswerEvent) => void; answered: AnswerEvent | null }) {
  const [chosen, setChosen] = useState<number[]>([]);
  const add = (i: number) => !answered && setChosen((c) => [...c, i]);
  const remove = (pos: number) => !answered && setChosen((c) => c.filter((_, j) => j !== pos));
  const check = () => {
    const built = chosen.map((i) => furiText(tiles[i]));
    const want = answer.map(furiText);
    onAnswer({ correct: built.join('') === want.join(''), given: built.join('') });
  };
  return (
    <div>
      <div class="tiles answer-row" lang="ja">
        {chosen.map((i, pos) => (
          <button key={`${i}-${pos}`} class="tile" onClick={() => remove(pos)}>
            {furiText(tiles[i])}
          </button>
        ))}
      </div>
      <div class="tiles" lang="ja">
        {tiles.map((t, i) => (
          <button key={i} class={`tile ${chosen.includes(i) ? 'used' : ''}`} onClick={() => add(i)} disabled={chosen.includes(i)}>
            {furiText(t)}
          </button>
        ))}
      </div>
      {!answered && (
        <button class="btn primary block" style={{ marginTop: '16px' }} disabled={!chosen.length} onClick={check}>
          Check
        </button>
      )}
    </div>
  );
}
