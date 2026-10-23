// Stroke-order checking for the tracing exercise. Coordinates are in KanjiVG's
// 109×109 box. Reference strokes are sampled from SVG paths in the browser
// (see ui/TraceCanvas); this module only compares point lists.

export type Pt = [number, number];

export const SAMPLES = 24;

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function pathLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

/** Resample a polyline to n points evenly spaced along its length. */
export function resample(pts: Pt[], n = SAMPLES): Pt[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => pts[0]);
  const total = pathLength(pts);
  if (total === 0) return Array.from({ length: n }, () => pts[0]);
  const step = total / (n - 1);
  const out: Pt[] = [pts[0]];
  let acc = 0;
  let i = 1;
  let prev = pts[0];
  while (out.length < n - 1 && i < pts.length) {
    const d = dist(prev, pts[i]);
    if (acc + d >= step) {
      const t = (step - acc) / d;
      const p: Pt = [prev[0] + t * (pts[i][0] - prev[0]), prev[1] + t * (pts[i][1] - prev[1])];
      out.push(p);
      prev = p;
      acc = 0;
    } else {
      acc += d;
      prev = pts[i];
      i++;
    }
  }
  while (out.length < n) out.push(pts[pts.length - 1]);
  return out;
}

export type StrokeVerdict = 'ok' | 'reversed' | 'off';

export interface MatchOptions {
  /** Average distance allowed (KanjiVG units). */
  tolerance?: number;
}

/**
 * Compare a drawn stroke with the reference stroke.
 * 'ok' when the shapes line up in the right direction, 'reversed' when drawn backwards.
 */
export function matchStroke(drawn: Pt[], ref: Pt[], opts: MatchOptions = {}): StrokeVerdict {
  const tol = opts.tolerance ?? 16;
  const refLen = pathLength(ref);
  const drawnLen = pathLength(drawn);
  const a = resample(drawn);
  const b = resample(ref);
  if (!a.length || !b.length) return 'off';

  // Dots and tiny ticks: close to the right place and not a long line.
  if (refLen < 12) {
    const ca = centroid(a);
    const cb = centroid(b);
    return dist(ca, cb) < tol * 1.2 && drawnLen < 40 ? 'ok' : 'off';
  }
  // Wildly different lengths are never a match.
  if (drawnLen < refLen * 0.35 || drawnLen > refLen * 2.5 + 20) return 'off';

  const fwd = avgDist(a, b);
  const rev = avgDist([...a].reverse(), b);
  if (fwd <= tol && dist(a[0], b[0]) < tol * 2) return 'ok';
  if (rev <= tol && rev < fwd) return 'reversed';
  return 'off';
}

function avgDist(a: Pt[], b: Pt[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += dist(a[i], b[i]);
  return s / a.length;
}

function centroid(pts: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}
