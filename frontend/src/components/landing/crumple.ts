/**
 * Knob position (0 … n-1) to what the team slide shows: which poster, how crumpled. The first half of each gap
 * crumples the current poster into a ball; the second half unfolds the next one out of it.
 */
export function scrubToView(p: number, n: number): { index: number; crumple: number } {
  if (n <= 1) return { index: 0, crumple: 0 }
  const q = Math.min(Math.max(p, 0), n - 1)
  const i = Math.floor(q)
  if (i >= n - 1) return { index: n - 1, crumple: 0 }
  const f = q - i
  return f < 0.5 ? { index: i, crumple: f * 2 } : { index: i + 1, crumple: (1 - f) * 2 }
}
