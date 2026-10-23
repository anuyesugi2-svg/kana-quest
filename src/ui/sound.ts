// Small synthesized sound effects (no audio files, works offline).

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export type Sfx = 'correct' | 'wrong' | 'combo' | 'complete' | 'fail' | 'tap';

export function play(sfx: Sfx, enabled: boolean, combo = 0) {
  if (!enabled) return;
  switch (sfx) {
    case 'correct': {
      const lift = Math.min(combo, 10) * 30;
      tone(660 + lift, 0, 0.12, 'triangle');
      tone(990 + lift, 0.08, 0.16, 'triangle');
      break;
    }
    case 'combo':
      [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.06, 0.14, 'triangle', 0.1));
      break;
    case 'wrong':
      tone(220, 0, 0.18, 'square', 0.06);
      tone(165, 0.1, 0.22, 'square', 0.06);
      break;
    case 'complete':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.3, 'triangle', 0.11));
      break;
    case 'fail':
      [392, 330, 262].forEach((f, i) => tone(f, i * 0.14, 0.28, 'sine', 0.1));
      break;
    case 'tap':
      tone(880, 0, 0.05, 'sine', 0.05);
      break;
  }
}
