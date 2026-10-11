import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAnim } from './anim.ts'

const steps = (...pairs: [number, number][]) => pairs.map(([frame, ticks]) => ({ frame, ticks }))

test('frame lines become steps, durations read as decimal', () => {
  assert.deepEqual(parseAnim('\tframe 0, 08\n\tframe 3, 26\n\tendanim\n'), steps([0, 8], [3, 26]))
})

test('setrepeat K runs the body K times in all; dorepeat L jumps to command index L', () => {
  // Pikachu's anim.asm: dorepeat 2 and dorepeat 7 count every command, setrepeat lines included.
  const asm = [
    'frame 1, 07', 'setrepeat 2', 'frame 2, 07', 'frame 3, 07', 'dorepeat 2',
    'frame 2, 26', 'setrepeat 2', 'frame 0, 05', 'frame 4, 05', 'dorepeat 7', 'endanim',
  ].map(l => `\t${l}`).join('\n')
  assert.deepEqual(parseAnim(asm), steps([1, 7], [2, 7], [3, 7], [2, 7], [3, 7], [2, 26], [0, 5], [4, 5], [0, 5], [4, 5]))
})

test('two repeat blocks in a row share the one timer (Pikachu anim_idle.asm)', () => {
  const asm = ['setrepeat 3', 'frame 0, 05', 'frame 5, 05', 'dorepeat 1', 'setrepeat 2', 'frame 0, 05', 'frame 4, 05', 'dorepeat 5', 'endanim'].join('\n')
  assert.deepEqual(parseAnim(asm), steps([0, 5], [5, 5], [0, 5], [5, 5], [0, 5], [5, 5], [0, 5], [4, 5], [0, 5], [4, 5]))
})

test('a dorepeat with no setrepeat before it falls through', () => {
  assert.deepEqual(parseAnim('frame 1, 02\ndorepeat 0\nframe 2, 03\nendanim'), steps([1, 2], [2, 3]))
})

test('comments, labels and blank lines are skipped', () => {
  assert.deepEqual(parseAnim('; idle\n\n\tframe 1, 4 ; blink\n\tendanim\n'), steps([1, 4]))
})

test('a script that never ends, or an unknown command, throws', () => {
  assert.throws(() => parseAnim('setrepeat 2\nframe 0, 1\ndorepeat 0\nendanim'), /does not end/)
  assert.throws(() => parseAnim('frame 0, 1'), /endanim/)
  assert.throws(() => parseAnim('wobble 3\nendanim'), /unknown/)
})
