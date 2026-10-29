// Display helpers. All times are shown in UK local time, the market's clock.

const TZ = 'Europe/London'

export const gw = (mw: number | null | undefined, digits = 1) =>
  mw == null ? '–' : `${(mw / 1000).toFixed(digits)} GW`

export const signedGw = (mw: number | null | undefined) =>
  mw == null ? '–' : `${mw > 0 ? '+' : ''}${(mw / 1000).toFixed(2)} GW`

export const pct = (x: number | null | undefined) => (x == null ? '–' : `${(x * 100).toFixed(1)}%`)

export const ukDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

export const ukTick = (ms: number) =>
  new Date(ms).toLocaleString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export const ukHour = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })

export const shortDate = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
