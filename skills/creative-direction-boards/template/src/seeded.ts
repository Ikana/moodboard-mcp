/** A small seeded PRNG: the same seed string always gives the same sequence in [0, 1). */
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (): number => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Linear interpolation through a list of samples at u in [0, 1]. Lets fixed tables fit any step count. */
export function sample(table: readonly number[], u: number): number {
  if (table.length === 0) return 0;
  const x = Math.min(Math.max(u, 0), 1) * (table.length - 1);
  const i = Math.floor(x);
  const a = table[i] ?? 0;
  const b = table[Math.min(i + 1, table.length - 1)] ?? a;
  return a + (b - a) * (x - i);
}

/** u for step i of n, spread evenly from 0 to 1. */
export const along = (i: number, n: number): number => (n <= 1 ? 0 : i / (n - 1));
