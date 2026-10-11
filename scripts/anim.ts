import type { AnimStep } from '../hooks/data/types.ts'

type Command =
  | { op: 'frame'; frame: number; ticks: number }
  | { op: 'setrepeat'; count: number }
  | { op: 'dorepeat'; to: number }
  | { op: 'endanim' }

const MAX_STEPS = 1000

function commands(asm: string): Command[] {
  const out: Command[] = []
  for (const raw of asm.split('\n')) {
    const line = raw.replace(/;.*/, '').trim()
    if (!line || line.endsWith(':')) continue
    const [op = '', ...args] = line.split(/[\s,]+/)
    const n = args.map(a => Number.parseInt(a, 10))
    if (op === 'frame' && n.length === 2) out.push({ op, frame: n[0]!, ticks: n[1]! })
    else if (op === 'setrepeat' && n.length === 1) out.push({ op, count: n[0]! })
    else if (op === 'dorepeat' && n.length === 1) out.push({ op, to: n[0]! })
    else if (op === 'endanim' && n.length === 0) out.push({ op })
    else throw new Error(`unknown pic animation command: ${line}`)
    if (n.some(v => Number.isNaN(v))) throw new Error(`bad number in: ${line}`)
  }
  return out
}

/**
 * Plays a pokecrystal pic animation script (gfx/pokemon/<name>/anim.asm or anim_idle.asm) as
 * engine/gfx/pic_animation.asm does and returns the frames it shows, loops unrolled.
 * `frame N, D` shows frame N for D ticks (decimal). `setrepeat K` sets the one repeat timer;
 * `dorepeat L` decrements it and, unless it reached 0 (or was 0), jumps to command index L,
 * counting every command; so the body between them runs K times in all.
 */
export function parseAnim(asm: string): AnimStep[] {
  const script = commands(asm)
  const steps: AnimStep[] = []
  let pc = 0, timer = 0
  for (let budget = 0; budget < MAX_STEPS; budget++) {
    const c = script[pc++]
    if (!c) throw new Error('pic animation has no endanim')
    if (c.op === 'endanim') return steps
    if (c.op === 'frame') steps.push({ frame: c.frame, ticks: c.ticks })
    else if (c.op === 'setrepeat') timer = c.count
    else if (timer > 0 && --timer > 0) pc = c.to
  }
  throw new Error(`pic animation does not end within ${MAX_STEPS} commands`)
}
