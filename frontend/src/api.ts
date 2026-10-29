// Typed client for the FastAPI backend.

export type Mode = 'dayahead' | 'horizon'

export interface Rule {
  mode: Mode
  horizon: number // hours, used in horizon mode
  cutoff: string // HH:MM UK local time on D-1, used in day-ahead mode
}

export interface Meta {
  fetchedAt: string
  firstTarget: string
  lastTarget: string
  evalStart: string
  evalEnd: string
  runs: number
  maxHorizonH: number
}

export interface Stats {
  n: number
  mae: number
  rmse: number
  bias: number
  nmae: number | null
  medianAe: number
  p90Ae: number
  p99Ae: number
  maxAe: number
  errP10: number
  errP90: number
  correlation: number | null
  meanActual: number
  meanForecast: number
}

export interface Point {
  t: string
  mw: number
}

export interface ForecastPoint extends Point {
  publishTime: string
  horizonH: number
  low: number | null
  high: number | null
}

export interface Series {
  actuals: Point[]
  forecasts: ForecastPoint[]
  summary: Stats
}

export interface Metrics {
  summary: Stats
  histogram: { from: number; to: number; count: number }[]
  byHour: { hour: number; mae: number; bias: number; n: number }[]
  byDay: { date: string; mae: number; bias: number; n: number }[]
  meanHorizonH: number | null
}

export interface HorizonRow {
  horizonH: number
  n: number
  mae: number | null
  rmse: number | null
  bias: number | null
  p90Ae: number | null
}

export interface Evolution {
  runs: { publishTime: string; points: Point[] }[]
  actuals: Point[]
}

async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
  const res = await fetch(`/api/${path}${qs.size ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

const ruleParams = (r: Rule) => ({ mode: r.mode, horizon: r.horizon, cutoff: r.cutoff })

export const api = {
  meta: () => get<Meta>('meta'),
  series: (start: string, end: string, rule: Rule) => get<Series>('series', { start, end, ...ruleParams(rule) }),
  metrics: (rule: Rule) => get<Metrics>('metrics', ruleParams(rule)),
  horizonCurve: () => get<HorizonRow[]>('horizon-curve'),
  evolution: (day: string) => get<Evolution>('evolution', { day }),
}
