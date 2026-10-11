import { IDLE_REST_MS, TICK_MS } from '../config'
import type { Animation, AnimStep } from '../data/types'

type Anim = Animation['anim']

const lengthMs = (steps: readonly AnimStep[]) => steps.reduce((ms, s) => ms + s.ticks * TICK_MS, 0)

/** The frame `tMs` into the steps, or null before they start or once they are over. */
function stepAt(steps: readonly AnimStep[], tMs: number): number | null {
  if (tMs < 0) return null
  let end = 0
  for (const s of steps) {
    end += s.ticks * TICK_MS
    if (tMs < end) return s.frame
  }
  return null
}

const known = (frame: number, frameCount: number) => (frame < frameCount ? frame : 0)

/** The intro `tMs` after it started, or null once it has played. */
export function introFrameAt(anim: Anim, tMs: number): number | null {
  return stepAt(anim.intro, tMs)
}

/** The idle loop at `tMs`: its steps once, then frame 0 for IDLE_REST_MS, again and again. */
export function idleFrameAt(anim: Anim, frameCount: number, tMs: number): number {
  const cycle = lengthMs(anim.idle) + IDLE_REST_MS
  return known(stepAt(anim.idle, ((tMs % cycle) + cycle) % cycle) ?? 0, frameCount)
}

/** The frame to draw at `now`: the idle on the wall clock, or from `flashStart` the intro and then the idle. */
export function frameAt(anim: Anim, frameCount: number, now: number, flashStart: number | null): number {
  if (flashStart === null || now < flashStart) return idleFrameAt(anim, frameCount, now)
  const t = now - flashStart
  const intro = introFrameAt(anim, t)
  return intro === null ? idleFrameAt(anim, frameCount, t - lengthMs(anim.intro)) : known(intro, frameCount)
}
