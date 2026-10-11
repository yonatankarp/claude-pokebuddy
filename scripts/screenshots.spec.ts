import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderScene, sceneSave } from './screenshots.ts'

test('a scene is an SVG with the species name and the icon drawn in pixel rects', () => {
  const svg = renderScene({ save: sceneSave(4, 12), bubble: 'hello', showFull: true, evolving: false }, 20, 100)
  assert.match(svg, /^<svg /)
  assert.match(svg, /CHARMANDER/)
  assert.match(svg, /<rect x="\d+" y="\d+" width="\d+" height="9" fill="#/)
})
