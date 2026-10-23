// Japanese text-to-speech via the Web Speech API (ja-JP voice).

let voice: SpeechSynthesisVoice | null = null;
let listeners: (() => void)[] = [];

function pickVoice() {
  if (typeof speechSynthesis === 'undefined') return;
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('ja'));
  // Prefer higher-quality voices when the platform offers several.
  voice =
    voices.find((v) => /natural|online|enhanced|premium/i.test(v.name)) ??
    voices.find((v) => /google/i.test(v.name)) ??
    voices[0] ??
    null;
  listeners.forEach((l) => l());
}

if (typeof speechSynthesis !== 'undefined') {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

export function speechAvailable(): boolean {
  return voice !== null;
}

export function onVoicesChanged(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function voiceName(): string | null {
  return voice?.name ?? null;
}

export function speak(text: string, rate = 0.9) {
  if (typeof speechSynthesis === 'undefined' || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  if (voice) u.voice = voice;
  u.rate = rate;
  speechSynthesis.speak(u);
}
