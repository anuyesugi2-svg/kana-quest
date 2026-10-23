// Stroke-order tracing (mouse or finger) on KanjiVG paths, plus a stroke-order animation.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { matchStroke, type Pt } from '../core/strokes';

const VIEW = 109;

/** Sample an SVG path's geometry using the browser. */
function samplePath(d: string, n = 32): Pt[] {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  svg.appendChild(p);
  svg.style.position = 'absolute';
  svg.style.visibility = 'hidden';
  document.body.appendChild(svg);
  const len = p.getTotalLength();
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const q = p.getPointAtLength((len * i) / (n - 1));
    pts.push([q.x, q.y]);
  }
  svg.remove();
  return pts;
}

export interface TraceResult {
  misses: number;
  strokes: number;
}

export function TraceCanvas({
  paths,
  onDone,
  ghost = true,
  disabled,
}: {
  paths: string[];
  onDone: (r: TraceResult) => void;
  ghost?: boolean;
  disabled?: boolean;
}) {
  const refPts = useMemo(() => paths.map((d) => samplePath(d)), [paths]);
  const [done, setDone] = useState(0);
  const [ink, setInk] = useState<Pt[]>([]);
  const [misses, setMisses] = useState(0);
  const [strokeMisses, setStrokeMisses] = useState(0);
  const [hintKey, setHintKey] = useState(0);
  const [note, setNote] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    setDone(0);
    setInk([]);
    setMisses(0);
    setStrokeMisses(0);
    setNote('');
  }, [paths]);

  const toPt = (e: PointerEvent): Pt => {
    const r = box.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * VIEW, ((e.clientY - r.top) / r.height) * VIEW];
  };

  const finished = done >= paths.length;

  const down = (e: PointerEvent) => {
    if (disabled || finished) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawing.current = true;
    setInk([toPt(e)]);
  };
  const move = (e: PointerEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const p = toPt(e);
    setInk((s) => [...s, p]);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const stroke = ink;
    setInk([]);
    if (stroke.length < 2) {
      if (refPts[done] && matchStroke(stroke.concat(stroke), refPts[done]) === 'ok') accept();
      return;
    }
    const verdict = matchStroke(stroke, refPts[done]);
    if (verdict === 'ok') {
      accept();
    } else {
      setMisses((m) => m + 1);
      const sm = strokeMisses + 1;
      setStrokeMisses(sm);
      setNote(verdict === 'reversed' ? 'Wrong direction — start at the red dot.' : `That doesn’t match stroke ${done + 1}. Try again.`);
      if (sm >= 2) setHintKey((k) => k + 1);
      if (sm >= 3) {
        // Show it and move on so nobody gets stuck.
        setNote('Here’s that stroke — keep going.');
        accept(true);
      }
    }
  };
  const accept = (forced = false) => {
    const next = done + 1;
    setDone(next);
    setStrokeMisses(0);
    if (!forced) setNote('');
    if (next >= paths.length) onDone({ misses: misses + (forced ? 1 : 0), strokes: paths.length });
  };

  const start = refPts[done]?.[0];

  return (
    <div>
      <div
        class="trace-wrap"
        ref={box}
        onPointerDown={down as any}
        onPointerMove={move as any}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <svg viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden="true">
          <g class="trace-grid">
            <line x1="54.5" y1="0" x2="54.5" y2="109" />
            <line x1="0" y1="54.5" x2="109" y2="54.5" />
          </g>
          {ghost && (
            <g class="trace-ghost">
              {paths.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
          )}
          <g class="trace-done">
            {paths.slice(0, done).map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          {hintKey > 0 && !finished && (
            <g class="trace-hint" key={hintKey}>
              <path d={paths[done]} />
            </g>
          )}
          {start && !finished && !disabled && (
            <g class="trace-start">
              <circle cx={start[0]} cy={start[1]} r="4" />
            </g>
          )}
          <g class="trace-ink">{ink.length > 1 && <polyline points={ink.map((p) => p.join(',')).join(' ')} />}</g>
        </svg>
      </div>
      <p class="center small muted" style={{ marginTop: '8px', minHeight: '20px' }}>
        {finished ? 'Done!' : note || `Stroke ${done + 1} of ${paths.length}`}
      </p>
    </div>
  );
}

/** Animated stroke order: strokes draw one after another, numbered. */
export function StrokeOrder({ paths, size = 160 }: { paths: string[]; size?: number }) {
  const [run, setRun] = useState(0);
  const lengths = useMemo(() => paths.map((d) => {
    const pts = samplePath(d, 24);
    let l = 0;
    for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return Math.ceil(l) + 2;
  }), [paths]);
  const firstPts = useMemo(() => paths.map((d) => samplePath(d, 2)[0]), [paths]);
  const per = 0.55;
  return (
    <div class="center">
      <svg key={run} class="stroke-anim" viewBox={`0 0 ${VIEW} ${VIEW}`} width={size} height={size} role="img" aria-label="Stroke order">
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            style={{
              strokeDasharray: lengths[i],
              strokeDashoffset: lengths[i],
              animation: `draw ${per}s ease forwards`,
              animationDelay: `${i * per}s`,
            }}
          />
        ))}
        {firstPts.map((p, i) => (
          <text key={`n${i}`} x={p[0] - 5} y={p[1] - 2}>
            {i + 1}
          </text>
        ))}
      </svg>
      <div>
        <button class="btn small ghost" onClick={() => setRun((r) => r + 1)}>
          ↻ Replay strokes
        </button>
      </div>
    </div>
  );
}
