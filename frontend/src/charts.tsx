import { useMemo } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Evolution, HorizonRow, Metrics, Series } from './api'
import { gw, shortDate, ukDateTime, ukHour, ukTick } from './format'
import type { Palette } from './theme'

const gwTick = (mw: number) => `${(mw / 1000).toFixed(0)}`
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }

interface Row {
  ts: number
  actual?: number
  forecast?: number
  band?: [number, number]
  publishTime?: string
  horizonH?: number
}

export function ForecastChart({ data, c }: { data: Series; c: Palette }) {
  const rows = useMemo(() => {
    const byTs = new Map<number, Row>()
    const row = (iso: string) => {
      const ts = Date.parse(iso)
      if (!byTs.has(ts)) byTs.set(ts, { ts })
      return byTs.get(ts)!
    }
    data.actuals.forEach((p) => (row(p.t).actual = p.mw))
    data.forecasts.forEach((p) => {
      const r = row(p.t)
      r.forecast = p.mw
      r.publishTime = p.publishTime
      r.horizonH = p.horizonH
      if (p.low != null && p.high != null) r.band = [p.low, p.high]
    })
    return [...byTs.values()].sort((a, b) => a.ts - b.ts)
  }, [data])

  return (
    <ResponsiveContainer width="100%" height={360}>
      <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={ukTick}
          stroke={c.axis}
          fontSize={12}
          minTickGap={40}
        />
        <YAxis tickFormatter={gwTick} stroke={c.axis} fontSize={12} width={44}
          label={{ value: 'GW', angle: -90, position: 'insideLeft', fill: c.axis, fontSize: 12 }} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(ts) => ukDateTime(new Date(ts as number).toISOString())}
          formatter={(v, name, item) => {
            if (name === 'P10–P90 range' && Array.isArray(v)) return [`${gw(Number(v[0]))} – ${gw(Number(v[1]))}`, name]
            if (name === 'Forecast') {
              const r = item.payload as Row
              return [`${gw(v as number, 2)} (run ${ukDateTime(r.publishTime!)}, ${r.horizonH}h ahead)`, name]
            }
            return [gw(v as number, 2), name]
          }}
        />
        <Legend />
        <Area dataKey="band" name="P10–P90 range" stroke="none" fill={c.band} fillOpacity={0.45}
          connectNulls isAnimationActive={false} />
        <Line dataKey="actual" name="Actual" stroke={c.actual} dot={false} strokeWidth={1.6}
          connectNulls isAnimationActive={false} />
        <Line dataKey="forecast" name="Forecast" stroke={c.forecast} dot={false} strokeWidth={2}
          connectNulls isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function HorizonChart({ rows, c, current }: { rows: HorizonRow[]; c: Palette; current?: number }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows.filter((r) => r.n > 0)} margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="horizonH" type="number" domain={[0, 48]} ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48]}
          stroke={c.axis} fontSize={12}
          label={{ value: 'hours ahead of delivery', position: 'insideBottom', offset: -8, fill: c.axis, fontSize: 12 }} />
        <YAxis tickFormatter={(v) => (v / 1000).toFixed(1)} stroke={c.axis} fontSize={12} width={44} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(h) => `${h}h ahead`}
          formatter={(v) => gw(v as number, 2)} />
        <Legend verticalAlign="top" height={28} />
        {current != null && <ReferenceLine x={current} stroke={c.axis} strokeDasharray="4 4" />}
        <Line dataKey="mae" name="MAE" stroke={c.forecast} strokeWidth={2} isAnimationActive={false} />
        <Line dataKey="p90Ae" name="P90 abs error" stroke={c.p90} strokeWidth={2} isAnimationActive={false} />
        <Line dataKey="bias" name="Bias (forecast − actual)" stroke={c.bias} strokeWidth={2}
          strokeDasharray="5 3" isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function HistogramChart({ m, c }: { m: Metrics; c: Palette }) {
  const rows = m.histogram.map((b) => ({ mid: (b.from + b.to) / 2, count: b.count }))
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 16, left: 0 }} barCategoryGap={1}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="mid" tickFormatter={(v) => (v / 1000).toFixed(1)} stroke={c.axis} fontSize={12}
          label={{ value: 'forecast − actual (GW)', position: 'insideBottom', offset: -8, fill: c.axis, fontSize: 12 }} />
        <YAxis stroke={c.axis} fontSize={12} width={36} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => `around ${gw(v as number, 2)}`}
          formatter={(v) => [v, 'hours']} />
        <ReferenceLine x={0} stroke={c.axis} />
        <Bar dataKey="count" fill={c.bar} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ByHourChart({ m, c }: { m: Metrics; c: Palette }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={m.byHour} margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="hour" stroke={c.axis} fontSize={12} tickFormatter={(h) => `${h}:00`}
          label={{ value: 'hour of day (UK)', position: 'insideBottom', offset: -8, fill: c.axis, fontSize: 12 }} />
        <YAxis tickFormatter={(v) => (v / 1000).toFixed(1)} stroke={c.axis} fontSize={12} width={36} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(h) => `${h}:00`} formatter={(v) => gw(v as number, 2)} />
        <Legend verticalAlign="top" height={28} />
        <Bar dataKey="mae" name="MAE" fill={c.bar} isAnimationActive={false} />
        <Bar dataKey="bias" name="Bias" fill={c.bias} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function DailyChart({ m, c, onPick }: { m: Metrics; c: Palette; onPick: (day: string) => void }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={m.byDay} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
        onClick={(e) => e?.activeLabel && onPick(String(e.activeLabel))} style={{ cursor: 'pointer' }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} stroke={c.axis} fontSize={12} minTickGap={16} />
        <YAxis tickFormatter={(v) => (v / 1000).toFixed(1)} stroke={c.axis} fontSize={12} width={36} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(d) => `Delivery ${shortDate(d as string)} (click to inspect)`}
          formatter={(v) => gw(v as number, 2)} />
        <Bar dataKey="mae" name="MAE" fill={c.bar} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function EvolutionChart({ ev, c }: { ev: Evolution; c: Palette }) {
  const { rows, keys, used } = useMemo(() => {
    const byTs = new Map<number, Record<string, number>>()
    const put = (iso: string, key: string, mw: number) => {
      const ts = Date.parse(iso)
      const r = byTs.get(ts) ?? { ts }
      r[key] = mw
      byTs.set(ts, r)
    }
    ev.actuals.forEach((p) => put(p.t, 'actual', p.mw))
    const keys = ev.runs.map((r) => r.publishTime)
    ev.runs.forEach((r) => r.points.forEach((p) => put(p.t, r.publishTime, p.mw)))
    // Highlight the last run published before the delivery day began.
    const dayStart = Math.min(...ev.actuals.map((p) => Date.parse(p.t)))
    const used = keys.filter((k) => Date.parse(k) < dayStart).at(-1)
    return { rows: [...byTs.values()].sort((a, b) => a.ts - b.ts), keys, used }
  }, [ev])

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={ukHour}
          stroke={c.axis} fontSize={12} />
        <YAxis tickFormatter={gwTick} stroke={c.axis} fontSize={12} width={44} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(ts) => ukDateTime(new Date(ts as number).toISOString())}
          formatter={(v, name) => [gw(v as number, 2), name === 'actual' ? 'Actual' : `Run ${ukDateTime(String(name))}`]} />
        {keys.filter((k) => k !== used).map((k, i) => (
          // Older runs fade out.
          <Line key={k} dataKey={k} stroke={c.old} strokeOpacity={0.35 + 0.65 * (i / Math.max(1, keys.length - 1))}
            dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />
        ))}
        {used && <Line dataKey={used} stroke={c.forecast} strokeWidth={2.4} dot={false} connectNulls isAnimationActive={false} />}
        <Line dataKey="actual" stroke={c.actual} strokeWidth={2.4} dot={false} connectNulls isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
