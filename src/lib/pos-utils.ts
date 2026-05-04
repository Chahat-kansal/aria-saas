// Sound engine — exact from pos-3d-core.jsx
export const SFX = (() => {
  let ctx: AudioContext | null = null;
  const getCtx = () => {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return ctx;
  };
  const beep = (freq = 880, dur = 0.06, vol = 0.18, type: OscillatorType = 'sine') => {
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type = type; osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      osc.start(c.currentTime); osc.stop(c.currentTime + dur);
    } catch { /* ignore — audio not available */ }
  };
  return {
    scan:    () => { beep(1200, 0.04, 0.15, 'square'); setTimeout(() => beep(1600, 0.04, 0.12, 'square'), 50); },
    add:     () => beep(880, 0.08, 0.12, 'sine'),
    tap:     () => beep(600, 0.04, 0.08, 'sine'),
    remove:  () => beep(400, 0.08, 0.10, 'sine'),
    ching:   () => {
      [0, 80, 160, 240].forEach((d, i) => setTimeout(() => beep(1000 + i * 300, 0.12, 0.15 - i * 0.02, 'triangle'), d));
      setTimeout(() => { beep(2000, 0.4, 0.2, 'sine'); beep(2500, 0.3, 0.15, 'sine'); }, 320);
    },
    approve: () => { beep(600, 0.1, 0.15, 'sine'); setTimeout(() => beep(800, 0.1, 0.15, 'sine'), 100); setTimeout(() => beep(1000, 0.2, 0.18, 'sine'), 200); },
    error:   () => { beep(220, 0.15, 0.15, 'sawtooth'); setTimeout(() => beep(180, 0.15, 0.12, 'sawtooth'), 160); },
    nav:     () => beep(700, 0.04, 0.06, 'sine'),
  };
})();

export const CAT_META: Record<string, { a: string; b: string }> = {
  beer:          { a: '#F59E0B', b: '#92400E' },
  'beer & cider':{ a: '#F59E0B', b: '#92400E' },
  wine:          { a: '#9333EA', b: '#4C1D95' },
  spirits:       { a: '#3B82F6', b: '#1E3A5F' },
  rtd:           { a: '#10B981', b: '#064E3B' },
  coffee:        { a: '#A16207', b: '#451A03' },
  food:          { a: '#EF4444', b: '#7F1D1D' },
  soft:          { a: '#10B981', b: '#064E3B' },
  'soft drinks': { a: '#10B981', b: '#064E3B' },
  snacks:        { a: '#F97316', b: '#7C2D12' },
  other:         { a: '#6366F1', b: '#312E81' },
};

export function fmt(n: number): string {
  return 'A$' + Number(n).toFixed(2);
}
