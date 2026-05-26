// Maps text characters to VRoid mouth blendshape names
// Aria.glb uses Fcl_MTH_A/I/U/E/O naming

export type MorphName = 'Fcl_MTH_A' | 'Fcl_MTH_I' | 'Fcl_MTH_U' | 'Fcl_MTH_E' | 'Fcl_MTH_O' | 'Fcl_MTH_Close';

export interface Viseme {
  start: number;
  end: number;
  morph: MorphName;
  value: number;
}

function charToMorph(char: string): MorphName {
  const c = char.toLowerCase();
  if ('a'.includes(c)) return 'Fcl_MTH_A';
  if ('i'.includes(c)) return 'Fcl_MTH_I';
  if ('u'.includes(c)) return 'Fcl_MTH_U';
  if ('e'.includes(c)) return 'Fcl_MTH_E';
  if ('o'.includes(c)) return 'Fcl_MTH_O';
  if (' ,.!?;:\n'.includes(char)) return 'Fcl_MTH_Close';
  return 'Fcl_MTH_A'; // consonants — small open
}

function charDuration(char: string): number {
  if (char === ' ') return 0.055;
  if ('.!?'.includes(char)) return 0.28;
  if (',;:'.includes(char)) return 0.16;
  return 0.048;
}

export function buildVisemes(text: string): Viseme[] {
  let time = 0;
  return text.split('').map(char => {
    const duration = charDuration(char);
    const morph = charToMorph(char);
    const v: Viseme = { start: time, end: time + duration, morph, value: morph === 'Fcl_MTH_Close' ? 0 : 0.7 };
    time += duration;
    return v;
  });
}

export function getTextDuration(text: string): number {
  return text.split('').reduce((t, c) => t + charDuration(c), 0);
}
