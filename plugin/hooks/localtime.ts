export type LocalTime = { date: string; hour: number }

const pad = (n: number) => String(n).padStart(2, '0')

/** The day and hour in the sandbox's own time zone, which is the person's. */
export function localTime(nowMs: number): LocalTime {
  const d = new Date(nowMs)
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, hour: d.getHours() }
}

export function previousDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}
