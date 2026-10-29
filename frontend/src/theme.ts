import { useEffect, useState } from 'react'

// Chart colours for light / dark. Kept in TS (not CSS vars) because Recharts
// writes them into SVG attributes.
const light = {
  actual: '#1f2937',
  forecast: '#2563eb',
  band: '#93c5fd',
  bias: '#d97706',
  p90: '#dc2626',
  bar: '#2563eb',
  grid: '#e5e7eb',
  axis: '#6b7280',
  old: '#cbd5e1',
}

const dark: typeof light = {
  actual: '#f3f4f6',
  forecast: '#60a5fa',
  band: '#1e3a8a',
  bias: '#fbbf24',
  p90: '#f87171',
  bar: '#60a5fa',
  grid: '#1f2937',
  axis: '#9ca3af',
  old: '#334155',
}

export type Palette = typeof light

export function usePalette(): Palette {
  const query = '(prefers-color-scheme: dark)'
  const [isDark, setDark] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return isDark ? dark : light
}
