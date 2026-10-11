import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderPanel, renderScene, sceneSave } from './screenshots.ts'

test('a scene is an SVG with the species name and the icon drawn in pixel rects', () => {
  const svg = renderScene({ save: sceneSave(4, 12), bubble: 'hello', showFull: true, evolving: false }, 20, 100)
  assert.match(svg, /^<svg /)
  assert.match(svg, /CHARMANDER/)
  assert.match(svg, /<rect x="\d+" y="\d+" width="\d+" height="9" fill="#/)
})

test('the panel draws its buttons as the terminal does: [ label ], or key: label when plain', () => {
  const save = { ...sceneSave(4, 12), box: [{ species: 92, isShiny: false, personality: 'brave' as const, nickname: null, level: 1, exp: 0 }] }
  const view = { save, releasing: null, note: null, dex: { page: 0, entry: null }, today: '2026-10-11', columns: 96 }
  // The SVG writes each word as its own <text>.
  const words = (svg: string) => [...svg.matchAll(/>([^<>]+)<\/text>/g)].map(m => m[1]).join(' ')
  assert.match(words(renderPanel({ ...view, tab: 'box' })), /\[ Make buddy \]/)
  assert.match(words(renderPanel({ ...view, tab: 'buddy' })), /f: Feed/)
})
