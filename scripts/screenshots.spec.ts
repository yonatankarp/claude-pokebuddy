import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderPanel, renderScene, sceneSave } from './screenshots.ts'
import { renderDesktopPanel } from './desktop.ts'

test('a scene is an SVG with the species name and the icon drawn in pixel rects', () => {
  const svg = renderScene({ save: sceneSave(4, 12), bubble: 'hello', showFull: true, evolving: false }, 20, 100)
  assert.match(svg, /^<svg /)
  assert.match(svg, /CHARMANDER/)
  assert.match(svg, /<rect x="\d+" y="\d+" width="\d+" height="9" fill="#/)
})

test('the panel draws its buttons as the terminal does: [ label ], or key: label when plain', () => {
  const save = { ...sceneSave(4, 12), box: [{ species: 92, isShiny: false, personality: 'brave' as const, nickname: null, level: 1, exp: 0, lifetimeExp: 0, expBySource: {} }] }
  const view = { save, releasing: null, note: null, dex: { page: 0, entry: null }, today: '2026-10-11', columns: 96 }
  // The SVG writes each word as its own <text>.
  const words = (svg: string) => [...svg.matchAll(/>([^<>]+)<\/text>/g)].map(m => m[1]).join(' ')
  assert.match(words(renderPanel({ ...view, tab: 'box' })), /\[ Make buddy \]/)
  assert.match(words(renderPanel({ ...view, tab: 'buddy' })), /f: Feed/)
})

test('the desktop panel draws the Pokédex case with its lens and the box as cards with their sprites', () => {
  const save = { ...sceneSave(4, 12), box: [{ species: 92, isShiny: false, personality: 'brave' as const, nickname: null, level: 1, exp: 0, lifetimeExp: 0, expBySource: {} }], caught: [4, 7, 92] }
  const view = { save, releasing: null, note: null, dex: { page: 0, entry: null }, today: '2026-10-11', columns: 96 }
  const dex = renderDesktopPanel({ ...view, tab: 'dex' })
  assert.match(dex, /^<svg /)
  assert.match(dex, />POKéDEX</)
  assert.match(dex, /fill="#cc2a0a"/)
  // The lens and a ball slot on each of the page's 26 rows, every one a nested <svg>; the cursor on the first caught.
  assert.equal(dex.match(/<svg x=/g)?.length, 27)
  assert.match(dex, />▶</)
  assert.match(dex, /font-weight="700" text-decoration="underline">CHARMANDER</)
  const box = renderDesktopPanel({ ...view, tab: 'box' })
  assert.match(box, />BOX 1</)
  assert.match(box, />Make buddy</)
  assert.equal(box.match(/<svg x=/g)?.length, 2)
})
