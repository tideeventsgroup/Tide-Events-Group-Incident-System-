const TZ = 'Europe/London'

const hhmm = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: TZ,
})

const hhmmss = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: TZ,
})

const shortDate = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: '2-digit',
  timeZone: TZ,
})

const longDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: TZ,
})

export const clockTime = (d: Date | string) => hhmm.format(new Date(d))
export const clockSeconds = (d: Date | string) => hhmmss.format(new Date(d))
export const dateShort = (d: Date | string) => shortDate.format(new Date(d))
export const dateLong = (d: Date | string) => longDate.format(new Date(d))

export const stamp = (d: Date | string) => `${dateShort(d)} ${clockTime(d)}`

/** "Fri 11 Sep" style, for event day headers. */
export function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: TZ,
  }).format(new Date(`${iso}T12:00:00Z`))
}

/** Nth day of an event, 1-indexed, from its start date. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T12:00:00Z`).getTime()
  const b = new Date(`${endIso}T12:00:00Z`).getTime()
  return Math.round((b - a) / 86_400_000)
}

/** Elapsed time since an incident was raised, for the live board. */
export function elapsed(from: string, now: number = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - new Date(from).getTime()) / 60_000))
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ${mins % 60}m`
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`
}

/**
 * Running clock since an incident was raised, for the console queue. Dispatch
 * screens count up rather than describing — an operator reads `01:47:12` off a
 * row and knows the shape of it without doing arithmetic.
 */
export function elapsedClock(from: string, now: number = Date.now()): string {
  const secs = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(secs / 3600)
  if (h >= 24) return `${Math.floor(h / 24)}d ${pad(h % 24)}h`
  return `${pad(h)}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`
}

export function retentionUntil(endDate: string | null, months: number): string | null {
  if (!endDate) return null
  const d = new Date(`${endDate}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}
