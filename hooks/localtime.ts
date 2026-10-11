import type { EngineInterface } from 'claude-code'
import { LOCALTIME_MODE } from './config'

export type LocalTime = { date: string; hour: number }

const pad = (n: number) => String(n).padStart(2, '0')

/** Minutes east of UTC, or null to use the sandbox's own local time. */
export async function readOffset($: EngineInterface): Promise<number | null> {
  if (LOCALTIME_MODE !== 'process') return null
  try {
    const z = (await $.process.run(['date', '+%z'])).stdout.trim()
    const m = z.match(/^([+-])(\d{2})(\d{2})$/)
    if (!m) return null
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
  } catch {
    return null
  }
}

export function localTime(nowMs: number, offsetMin: number | null): LocalTime {
  if (offsetMin === null) {
    const d = new Date(nowMs)
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, hour: d.getHours() }
  }
  const d = new Date(nowMs + offsetMin * 60000)
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() }
}

export function previousDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}
