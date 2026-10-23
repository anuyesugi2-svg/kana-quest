// "Learn" cards shown before a unit quiz, and the grammar lesson card.

import { useState } from 'preact/hooks';
import type { Content } from '../content/index';
import { kanaToRomaji } from '../core/romaji';
import { shortMeaning } from '../core/quiz';
import type { GrammarPoint, Item, Passage, Unit } from '../core/types';
import { Jp } from './Jp';
import { href } from './router';
import { speak } from './speech';
import { useStore } from './store';
import { StrokeOrder, TraceCanvas } from './Trace';

function SpeakBtn({ text }: { text: string }) {
  const { progress } = useStore();
  return (
    <button class="icon-btn" onClick={() => speak(text, progress.settings.speechRate)} aria-label="Play audio">
      🔊
    </button>
  );
}

export function GrammarLesson({ g }: { g: GrammarPoint }) {
  return (
    <div class="lesson">
      <h2>{g.title}</h2>
      <div class="pattern" lang="ja">
        {g.pattern}
      </div>
      <p>
        <strong>{g.meaning}</strong>
      </p>
      {g.explanation.map((e, i) => (
        <p key={i}>{e}</p>
      ))}
      {g.table && (
        <div class="table-wrap">
          <table class="conj">
            {g.table.caption && <caption>{g.table.caption}</caption>}
            <thead>
              <tr>
                {g.table.head.map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{/[぀-ヿ一-鿿]/.test(c) ? <Jp furi={c} /> : c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div class="section-title">Examples (tap for romaji)</div>
      <div class="card flat">
        {g.examples.map((e, i) => (
          <ExampleRow key={i} jp={e.jp} en={e.en} />
        ))}
      </div>
      <div class="section-title">Common mistakes</div>
      <div class="card flat">
        {g.mistakes.map((m, i) => (
          <div class="mistake" key={i}>
            <span>{m}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExampleRow({ jp, en }: { jp: string; en: string }) {
  const { progress } = useStore();
  return (
    <div class="example">
      <div class="row">
        <div class="grow ex-jp">
          <Jp furi={jp} meaning={en} />
        </div>
        <button class="icon-btn" onClick={() => speak(readingOf(jp), progress.settings.speechRate)} aria-label="Play">
          🔊
        </button>
      </div>
      <div class="ex-en">{en}</div>
    </div>
  );
}

function readingOf(furi: string): string {
  return furi.replace(/\[([^\]|]+)((?:\|[^\]|]*)+)\]/g, (_, _base, r: string) => r.split('|').join('')).replace(/[_ ]/g, '');
}

export function PassageCard({ p }: { p: Passage }) {
  const [showEn, setShowEn] = useState(false);
  return (
    <div class="card">
      <div class="row between">
        <h2 style={{ margin: 0 }}>
          <Jp furi={p.title} />
        </h2>
        <SpeakBtn text={p.lines.map((l) => readingOf(l.jp)).join('。')} />
      </div>
      <div style={{ fontSize: '1.2rem', lineHeight: 1.9, margin: '10px 0' }}>
        {p.lines.map((l, i) => (
          <div key={i}>
            <Jp furi={l.jp} meaning={l.en} />
            {showEn && <div class="small muted">{l.en}</div>}
          </div>
        ))}
      </div>
      <button class="btn small" onClick={() => setShowEn(!showEn)}>
        {showEn ? 'Hide' : 'Show'} translation
      </button>
    </div>
  );
}

function ItemCard({ item, content }: { item: Item; content: Content }) {
  const { strokes } = useStore();
  const [practice, setPractice] = useState(false);
  switch (item.kind) {
    case 'kana': {
      const paths = strokes[item.char];
      return (
        <div class="card">
          <div class="learn-hero">
            <div class="big" lang="ja">
              {item.char}
            </div>
            <div class="romaji">{item.romaji}</div>
            {item.alts?.length ? <div class="small muted">also typed: {item.alts.join(', ')}</div> : null}
          </div>
          <div class="row" style={{ justifyContent: 'center', marginBottom: '8px' }}>
            <SpeakBtn text={item.char} />
          </div>
          {paths && [...item.char].length === 1 && (
            <>
              {practice ? <TraceCanvas paths={paths} onDone={() => {}} /> : <StrokeOrder paths={paths} />}
              <div class="center">
                <button class="btn small" onClick={() => setPractice(!practice)}>
                  {practice ? 'Watch stroke order' : '✍️ Try writing it'}
                </button>
              </div>
            </>
          )}
        </div>
      );
    }
    case 'word': {
      const ex = (item.ex ?? []).map((id) => content.sentences[id]).filter(Boolean);
      return (
        <div class="card">
          <div class="learn-hero">
            <div class="lg" style={{ fontSize: '2.6rem' }}>
              <Jp text={item.jp} reading={item.reading} meaning={item.meanings[0]} />
            </div>
            {item.reading !== item.jp && (
              <div class="muted" lang="ja" style={{ fontSize: '1.2rem' }}>
                {item.reading}
              </div>
            )}
            <div class="romaji">{kanaToRomaji(item.reading)}</div>
          </div>
          <div class="row" style={{ justifyContent: 'center' }}>
            <SpeakBtn text={item.reading} />
          </div>
          <ol style={{ paddingLeft: '20px' }}>
            {item.meanings.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ol>
          {item.kanji && <p class="small muted">Usually written in kana; kanji: {item.kanji}</p>}
          {ex.length > 0 && (
            <>
              <div class="section-title">Examples</div>
              {ex.map((s, i) => (
                <ExampleRow key={i} jp={s.furi} en={s.en} />
              ))}
            </>
          )}
        </div>
      );
    }
    case 'kanji': {
      const paths = strokes[item.char];
      const words = item.words.map((id) => content.items.get(id)).filter((w) => w?.kind === 'word') as Extract<Item, { kind: 'word' }>[];
      return (
        <div class="card">
          <div class="learn-hero">
            <div class="big" lang="ja">
              {item.char}
            </div>
            <div class="romaji" style={{ fontSize: '1.2rem' }}>
              {item.meanings.join(', ')}
            </div>
          </div>
          <div class="stat-grid" style={{ gridTemplateColumns: '1fr 1fr', margin: '8px 0' }}>
            <div class="stat">
              <div class="k">on’yomi</div>
              <div lang="ja">
                {item.on.length
                  ? item.on.map((r, i) => (
                      <span key={r}>
                        {i > 0 && '、'}
                        <Jp text={r} reading={r} />
                      </span>
                    ))
                  : '—'}
              </div>
            </div>
            <div class="stat">
              <div class="k">kun’yomi</div>
              <div lang="ja">
                {item.kun.length
                  ? item.kun.map((r, i) => (
                      <span key={r}>
                        {i > 0 && '、'}
                        <Jp text={r.replace(/[.-]/g, '')} reading={r.replace(/[.-]/g, '')} />
                      </span>
                    ))
                  : '—'}
              </div>
            </div>
          </div>
          {paths && (
            <>
              {practice ? <TraceCanvas paths={paths} onDone={() => {}} /> : <StrokeOrder paths={paths} />}
              <div class="center">
                <button class="btn small" onClick={() => setPractice(!practice)}>
                  {practice ? 'Watch stroke order' : '✍️ Try writing it'}
                </button>
              </div>
            </>
          )}
          {words.length > 0 && (
            <>
              <div class="section-title">Words</div>
              {words.map((w) => (
                <div class="list-item" key={w.id}>
                  <span class="li-jp">
                    <Jp text={w.jp} reading={w.reading} meaning={w.meanings[0]} />
                  </span>
                  <span class="grow small">
                    {w.reading} · {shortMeaning(w.meanings[0])}
                  </span>
                </div>
              ))}
            </>
          )}
          <p class="small muted">{item.strokes} strokes</p>
        </div>
      );
    }
    case 'sentence':
      return (
        <div class="card">
          <ExampleRow jp={item.furi} en={item.en} />
        </div>
      );
    default:
      return null;
  }
}

/** Unit intro: step through the items (or lesson cards), then start the quiz. */
export function UnitLesson({ unit, content, stageId }: { unit: Unit; content: Content; stageId: string }) {
  const { progress } = useStore();
  const attempted = !!progress.units[unit.id];
  const cards: { key: string; node: preact.JSX.Element }[] = [];
  if (unit.kind === 'grammar') {
    for (const gid of unit.grammar ?? []) cards.push({ key: gid, node: <GrammarLesson g={content.grammar[gid]} /> });
  } else if (unit.kind === 'reading') {
    if (unit.passage) cards.push({ key: 'passage', node: <PassageCard p={content.passages[unit.passage]} /> });
    const sentences = unit.items.filter((id) => id.startsWith('s:')).map((id) => content.items.get(id)!);
    cards.push({
      key: 'sentences',
      node: (
        <div class="card">
          <h3>Read these first</h3>
          <p class="small muted">Tap any word for its reading, romaji and meaning.</p>
          {sentences.map((s) => s.kind === 'sentence' && <ExampleRow key={s.id} jp={s.furi} en={s.en} />)}
        </div>
      ),
    });
  } else {
    const items = unit.items.map((id) => content.items.get(id)).filter(Boolean) as Item[];
    const show = unit.kind === 'confusables' ? items.slice(0, 3) : items;
    for (const it of show) cards.push({ key: it.id, node: <ItemCard item={it} content={content} /> });
    if (unit.kind === 'confusables') {
      cards.push({
        key: 'lookalikes',
        node: (
          <div class="card">
            <h3>Look-alikes</h3>
            <p class="muted">These pairs trip everyone up. The quiz will mix them.</p>
            {content.confusables
              .filter((set) => set.some((c) => unit.items.includes(`${unit.id.startsWith('h') ? 'h' : 'k'}:${c}`)))
              .map((set) => (
                <div class="list-item" key={set.join('')}>
                  {set.map((c) => {
                    const it = content.items.get(`${unit.id.startsWith('h') ? 'h' : 'k'}:${c}`);
                    return (
                      <span key={c} class="li-jp" style={{ minWidth: '70px' }}>
                        <span lang="ja">{c}</span>
                        <div class="small muted">{it?.kind === 'kana' ? it.romaji : ''}</div>
                      </span>
                    );
                  })}
                </div>
              ))}
          </div>
        ),
      });
    }
  }

  const [i, setI] = useState(0);
  const last = i >= cards.length - 1;
  return (
    <div>
      <div class="quiz-top">
        <a class="icon-btn" href={href(`/stage/${stageId}`)} aria-label="Back">
          ←
        </a>
        <div class="grow">
          <div style={{ fontWeight: 700 }}>{unit.title}</div>
          <div class="small muted">{unit.subtitle}</div>
        </div>
      </div>
      {cards.length > 1 && (
        <div class="dots" aria-hidden="true">
          {cards.map((c, j) => (
            <span key={c.key} class={j === i ? 'on' : ''} />
          ))}
        </div>
      )}
      <div key={cards[i]?.key}>{cards[i]?.node}</div>
      <div class="row" style={{ gap: '10px' }}>
        {i > 0 && (
          <button class="btn" onClick={() => setI(i - 1)}>
            ←
          </button>
        )}
        {!last ? (
          <button class="btn primary grow" onClick={() => (setI(i + 1), window.scrollTo(0, 0))}>
            Next ({i + 1}/{cards.length})
          </button>
        ) : (
          <a class="btn primary grow" href={href(`/quiz/unit/${unit.id}`)}>
            Start quiz →
          </a>
        )}
      </div>
      {attempted && !last && (
        <a class="btn ghost block" style={{ marginTop: '8px' }} href={href(`/quiz/unit/${unit.id}`)}>
          Skip to quiz
        </a>
      )}
    </div>
  );
}
