import { describe, expect, test } from 'claude-code/testing'
import { IDLE_REST_MS, TICK_MS } from '../hooks/config'
import { frameAt, idleFrameAt, introFrameAt } from '../hooks/render/anim'

const anim = {
  intro: [{ frame: 1, ticks: 2 }, { frame: 2, ticks: 1 }],
  idle: [{ frame: 3, ticks: 1 }, { frame: 0, ticks: 1 }, { frame: 4, ticks: 2 }],
}
const IDLE_MS = 4 * TICK_MS
const mid = (ticks: number) => (ticks + 0.5) * TICK_MS

describe('animation clock', () => {
  test('idle plays its steps once, rests on frame 0, then loops', () => {
    expect([0, 1, 2, 3].map(t => idleFrameAt(anim, 5, mid(t)))).toEqual([3, 0, 4, 4])
    expect(idleFrameAt(anim, 5, IDLE_MS + 1)).toBe(0)
    expect(idleFrameAt(anim, 5, IDLE_MS + IDLE_REST_MS - 1)).toBe(0)
    expect(idleFrameAt(anim, 5, IDLE_MS + IDLE_REST_MS + mid(0))).toBe(3)
    expect(idleFrameAt(anim, 5, 7 * (IDLE_MS + IDLE_REST_MS) + mid(2))).toBe(4)
  })
  test('a step naming a frame that does not exist shows frame 0', () => {
    expect(idleFrameAt(anim, 4, mid(2))).toBe(0)
  })
  test('an empty idle is frame 0', () => {
    expect(idleFrameAt({ intro: [], idle: [] }, 1, 12345)).toBe(0)
  })
  test('intro plays once, then null', () => {
    expect([0, 1, 2].map(t => introFrameAt(anim, mid(t)))).toEqual([1, 1, 2])
    expect(introFrameAt(anim, 3 * TICK_MS)).toBe(null)
    expect(introFrameAt(anim, -1)).toBe(null)
  })
  test('a flash plays the intro from its start, then the idle', () => {
    const start = 1_000_000
    expect(frameAt(anim, 5, start + mid(0), start)).toBe(1)
    expect(frameAt(anim, 5, start + mid(2), start)).toBe(2)
    expect(frameAt(anim, 5, start + 3 * TICK_MS + mid(0), start)).toBe(3)
    expect(frameAt(anim, 5, start + 3 * TICK_MS + mid(2), start)).toBe(4)
  })
  test('without a flash the idle runs on the wall clock', () => {
    expect(frameAt(anim, 5, mid(0), null)).toBe(3)
    expect(frameAt(anim, 5, IDLE_MS + 1, null)).toBe(0)
  })
  test('a Crystal tick is two 60 Hz frames', () => {
    expect(Math.abs(TICK_MS - 1000 / 30) < 1e-9).toBe(true)
  })
})
