import { base64Encode } from '../plugin/hooks/codec.ts'
import type { Idle } from '../plugin/hooks/data/types.ts'
import { packNibbles } from './pack.ts'

/** The `<Anim>` block named `name` in a SpriteCollab AnimData.xml. */
const animBlock = (xml: string, name: string) => xml.split('<Anim>').find(a => a.includes(`<Name>${name}</Name>`))

/** The animation that plays as the idle: `Idle`, or the one it is a copy of. */
export function idleAnim(xml: string): string {
  const idle = animBlock(xml, 'Idle')
  if (!idle) throw new Error('AnimData has no Idle')
  return /<CopyOf>(\w+)<\/CopyOf>/.exec(idle)?.[1] ?? 'Idle'
}

/** The idle's frame size and how long each frame shows, in sixtieths of a second. */
export function idleTiming(xml: string): { fw: number; fh: number; durations: number[] } {
  const block = animBlock(xml, idleAnim(xml))!
  const num = (tag: string) => Number(new RegExp(`<${tag}>(\\d+)</${tag}>`).exec(block)?.[1])
  const durations = [...block.matchAll(/<Duration>(\d+)<\/Duration>/g)].map(m => Number(m[1]))
  if (!num('FrameWidth') || !num('FrameHeight') || durations.length === 0) throw new Error('AnimData idle has no frames')
  return { fw: num('FrameWidth'), fh: num('FrameHeight'), durations }
}

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')

/**
 * The idle's first row, the one facing the viewer, as frames cropped to the box they all share, in one palette of at
 * most 15 colours. The shiny sheet is the same pixels recoloured, so each colour's shiny is the shiny pixel where it
 * first shows.
 */
export function bakeIdle(sheet: { data: Uint8Array; width: number }, shinySheet: { data: Uint8Array; width: number }, timing: ReturnType<typeof idleTiming>): Idle {
  const { fw, fh, durations } = timing
  const at = (f: number, x: number, y: number) => (y * sheet.width + f * fw + x) * 4
  if (sheet.width < fw * durations.length) throw new Error('sheet is narrower than its frames')
  if (shinySheet.width !== sheet.width) throw new Error('shiny sheet is another size')
  const solid = (f: number, x: number, y: number) => sheet.data[at(f, x, y) + 3]! >= 128
  let minX = fw, minY = fh, maxX = -1, maxY = -1
  for (let f = 0; f < durations.length; f++) for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    if (solid(f, x, y)) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  }
  if (maxX < 0) throw new Error('idle is fully transparent')
  const palette = [''], shiny = ['']
  const frames = durations.map((_, f) => {
    const indexes: number[] = []
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      if (!solid(f, x, y)) { indexes.push(0); continue }
      const i = at(f, x, y)
      const c = hex(sheet.data[i]!, sheet.data[i + 1]!, sheet.data[i + 2]!)
      let k = palette.indexOf(c)
      if (k < 0) {
        k = palette.push(c) - 1
        if (k > 15) throw new Error('idle has more than 15 colours')
        if (shinySheet.data[i + 3]! < 128) throw new Error('shiny sheet is not the same pixels')
        shiny.push(hex(shinySheet.data[i]!, shinySheet.data[i + 1]!, shinySheet.data[i + 2]!))
      }
      indexes.push(k)
    }
    return base64Encode(packNibbles(indexes))
  })
  return { w: maxX - minX + 1, h: maxY - minY + 1, frames, durations, palette, shiny }
}

/**
 * The artists of `anim` in a SpriteCollab credits.txt (tab-separated: date, author, status, licence, animations), as
 * credit_names.txt names them; an author missing from that list keeps their id.
 */
export function artists(credits: string, names: string, anim: string): string[] {
  const byId = new Map(names.split('\n').slice(1).map(l => l.split('\t')).filter(c => c.length >= 2).map(c => [c[1]!.trim(), c[0]!.trim()]))
  const who = credits.split('\n').map(l => l.split('\t')).filter(c => c.length >= 5 && c[4]!.split(',').map(a => a.trim()).includes(anim))
    .map(c => byId.get(c[1]!.trim()) ?? c[1]!.trim())
  return [...new Set(who)]
}
