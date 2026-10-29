import { useEffect, useState, type ReactNode } from 'react'
import { api, type Evolution, type HorizonRow, type Meta, type Metrics, type Rule, type Series } from './api'
import { ByHourChart, DailyChart, EvolutionChart, ForecastChart, HistogramChart, HorizonChart } from './charts'
import { gw, pct, shortDate, signedGw, ukDateTime } from './format'
import { usePalette } from './theme'

const DEFAULT_RULE: Rule = { mode: 'dayahead', horizon: 24, cutoff: '10:00' }

/** Fetch whenever `deps` change; keeps the previous value while loading. */
function useFetch<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    let live = true
    load().then(
      (d) => live && (setData(d), setError(undefined)),
      (e: Error) => live && setError(e.message),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { data, error }
}

function Card({ title, sub, children, wide }: { title: string; sub?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`card${wide ? ' wide' : ''}`}>
      <h2>{title}</h2>
      {sub && <p className="sub">{sub}</p>}
      {children}
    </section>
  )
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: 'warn' }) {
  return (
    <div className={`kpi${tone ? ` ${tone}` : ''}`} title={hint}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-hint">{hint}</div>
    </div>
  )
}

function RuleControls({ rule, onChange }: { rule: Rule; onChange: (r: Rule) => void }) {
  return (
    <div className="rule">
      <div className="seg" role="radiogroup" aria-label="Forecast selection rule">
        <button role="radio" aria-checked={rule.mode === 'dayahead'} onClick={() => onChange({ ...rule, mode: 'dayahead' })}>
          Day-ahead decision
        </button>
        <button role="radio" aria-checked={rule.mode === 'horizon'} onClick={() => onChange({ ...rule, mode: 'horizon' })}>
          Fixed lead time
        </button>
      </div>
      {rule.mode === 'dayahead' ? (
        <label>
          Decide by
          <input type="time" step={1800} value={rule.cutoff}
            onChange={(e) => e.target.value && onChange({ ...rule, cutoff: e.target.value })} />
          UK time, the day before delivery
        </label>
      ) : (
        <label>
          Latest forecast at least
          <input type="range" min={0} max={48} step={1} value={rule.horizon} aria-label="Lead time in hours"
            onChange={(e) => onChange({ ...rule, horizon: Number(e.target.value) })} />
          <b>{rule.horizon}h</b> before delivery
        </label>
      )}
    </div>
  )
}

export default function App() {
  const c = usePalette()
  const [rule, setRule] = useState<Rule>(DEFAULT_RULE)
  const [range, setRange] = useState({ start: '2026-01-12', end: '2026-01-18' })
  const [day, setDay] = useState('2026-01-15')

  const meta = useFetch<Meta>(api.meta, [])
  const series = useFetch<Series>(() => api.series(range.start, range.end, rule), [range.start, range.end, rule])
  const metrics = useFetch<Metrics>(() => api.metrics(rule), [rule])
  const curve = useFetch<HorizonRow[]>(api.horizonCurve, [])
  const evolution = useFetch<Evolution>(() => api.evolution(day), [day])

  const s = metrics.data?.summary
  const error = meta.error ?? series.error ?? metrics.error ?? curve.error ?? evolution.error
  const minDay = meta.data?.firstTarget.slice(0, 10) ?? '2026-01-01'
  const maxDay = meta.data?.evalEnd ?? '2026-02-01'
  const ruleText =
    rule.mode === 'dayahead'
      ? `the latest forecast published by ${rule.cutoff} UK time on the day before delivery`
      : `the latest forecast published at least ${rule.horizon}h before each half-hour`

  return (
    <div className="page">
      <header>
        <div>
          <h1>Windcast</h1>
          <p className="tagline">GB national wind generation: what the forecast said when you had to buy, and how far to trust it.</p>
        </div>
        {meta.data && (
          <p className="source">
            Elexon BMRS · FUELHH (actual) &amp; WINDFOR (forecast) · {meta.data.runs} forecast runs ·
            delivery {shortDate(meta.data.evalStart)} – {shortDate(meta.data.evalEnd)} 2026
          </p>
        )}
      </header>

      <div className="toolbar">
        <RuleControls rule={rule} onChange={setRule} />
        <div className="dates">
          <label>
            From
            <input type="date" min={minDay} max={range.end} value={range.start}
              onChange={(e) => e.target.value && setRange({ ...range, start: e.target.value })} />
          </label>
          <label>
            To
            <input type="date" min={range.start} max={maxDay} value={range.end}
              onChange={(e) => e.target.value && setRange({ ...range, end: e.target.value })} />
          </label>
        </div>
      </div>

      {error && <div className="error">Couldn't load data: {error}</div>}

      <main className="grid">
        <Card wide title="Forecast at decision time vs actual"
          sub={<>Blue is {ruleText}. The shaded band is where actual output landed 80% of the time for forecasts chosen this way in January (P10–P90).</>}>
          {series.data ? <ForecastChart data={series.data} c={c} /> : <div className="skeleton" style={{ height: 360 }} />}
          {series.data && series.data.forecasts.length > 0 && (
            <p className="foot">
              In this window: MAE {gw(series.data.summary.mae, 2)}, bias {signedGw(series.data.summary.bias)}. Latest run
              used: {ukDateTime(series.data.forecasts[series.data.forecasts.length - 1].publishTime)}.
            </p>
          )}
        </Card>

        <section className="kpis wide" aria-label="January accuracy for this rule">
          <Kpi label="Mean absolute error" value={gw(s?.mae, 2)} hint={`${pct(s?.nmae)} of mean actual wind`} />
          <Kpi label="RMSE" value={gw(s?.rmse, 2)} hint="penalises big misses" />
          <Kpi label="Bias" value={signedGw(s?.bias)} tone={s && Math.abs(s.bias) > 500 ? 'warn' : undefined}
            hint={s && s.bias > 0 ? 'forecast runs high: wind under-delivers' : 'forecast runs low'} />
          <Kpi label="Surplus (P10)" value={gw(s ? -s.errP10 : null, 2)}
            hint="actual beat forecast by this 1 hour in 10" />
          <Kpi label="Shortfall to cover (P90)" value={gw(s?.errP90, 2)} tone="warn"
            hint="actual fell this far below forecast 1 hour in 10" />
          <Kpi label="Avg lead time" value={metrics.data?.meanHorizonH != null ? `${metrics.data.meanHorizonH.toFixed(1)} h` : '–'}
            hint={`${s?.n ?? '–'} hourly points evaluated`} />
        </section>

        <Card title="Accuracy vs lead time" sub="How error grows the earlier you commit. Dashed line marks the current rule.">
          {curve.data ? (
            <HorizonChart rows={curve.data} c={c}
              current={rule.mode === 'horizon' ? rule.horizon : metrics.data?.meanHorizonH ?? undefined} />
          ) : <div className="skeleton" style={{ height: 260 }} />}
        </Card>

        <Card title="Error distribution" sub="Forecast − actual. Right of zero means wind came in below forecast.">
          {metrics.data ? <HistogramChart m={metrics.data} c={c} /> : <div className="skeleton" style={{ height: 240 }} />}
        </Card>

        <Card title="Error by time of day" sub="Where in the day the forecast is least reliable.">
          {metrics.data ? <ByHourChart m={metrics.data} c={c} /> : <div className="skeleton" style={{ height: 240 }} />}
        </Card>

        <Card title="Daily error" sub="Mean absolute error per delivery day. Click a bar to inspect that day below.">
          {metrics.data ? <DailyChart m={metrics.data} c={c} onPick={setDay} /> :
            <div className="skeleton" style={{ height: 240 }} />}
        </Card>

        <Card wide title={`How the forecast evolved for ${shortDate(day)}`}
          sub={<>Every forecast run for this delivery day; blue is the last run before the day began (what a day-ahead buyer saw), black is actual.{' '}
            <input type="date" min={minDay} max={maxDay} value={day} aria-label="Delivery day"
              onChange={(e) => e.target.value && setDay(e.target.value)} /></>}>
          {evolution.data ? <EvolutionChart ev={evolution.data} c={c} /> : <div className="skeleton" style={{ height: 320 }} />}
        </Card>

        <Card wide title="Method">
          <ul className="method">
            <li>Actuals: Elexon FUELHH, fuelType WIND, half-hourly. Forecasts: Elexon WINDFOR, hourly, every run kept with its publish time.</li>
            <li>For each target hour we select the forecast a buyer could actually have seen under the chosen rule, never a later one. Runs' hindcast rows (target before publish) are excluded.</li>
            <li>Errors are computed where forecast and actual share a start time (on the hour). Statistics cover delivery days 2 Jan – 1 Feb 2026, i.e. decisions made in January.</li>
            <li>The P10–P90 band is in-sample: it uses January's own errors. In production it would be estimated from a trailing window.</li>
          </ul>
        </Card>
      </main>
      {meta.data && <footer>Data snapshot fetched {ukDateTime(meta.data.fetchedAt)}.</footer>}
    </div>
  )
}
