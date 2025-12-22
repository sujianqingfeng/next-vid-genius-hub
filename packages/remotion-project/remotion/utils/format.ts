// Minimal formatting helpers for Remotion bundle (self-contained)

export function formatCount(num: number): string {
  if (num < 1000) return String(num)
  if (num < 1_000_000) return (num / 1_000).toFixed(1) + 'K'
  if (num < 1_000_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  return (num / 1_000_000_000).toFixed(1) + 'B'
}

