import assert from 'node:assert/strict'
import { test } from 'node:test'
import { artists, bakeIdle, idleAnim, idleTiming } from './pmd.ts'

const xml = (idle: string) => `<AnimData><Anims>
<Anim><Name>Walk</Name><FrameWidth>4</FrameWidth><FrameHeight>2</FrameHeight><Durations><Duration>8</Duration><Duration>10</Duration></Durations></Anim>
<Anim><Name>Idle</Name>${idle}</Anim></Anims></AnimData>`

test('the idle is Idle, or the animation it is a copy of, with that one\'s frames', () => {
  assert.equal(idleAnim(xml('<FrameWidth>2</FrameWidth><FrameHeight>2</FrameHeight><Durations><Duration>40</Duration></Durations>')), 'Idle')
  assert.equal(idleAnim(xml('<CopyOf>Walk</CopyOf>')), 'Walk')
  assert.deepEqual(idleTiming(xml('<CopyOf>Walk</CopyOf>')), { fw: 4, fh: 2, durations: [8, 10] })
})

test('bakeIdle crops the front row\'s frames to the box they share, in one palette, the shiny taken where each colour first shows', () => {
  // Two 3x2 frames side by side on a 6x4 sheet (the second row, another direction, is ignored).
  const R = [255, 0, 0, 255], B = [0, 0, 255, 255], G = [0, 255, 0, 255], _ = [0, 0, 0, 0]
  const sheet = (a: number[], b: number[]) => ({
    width: 6,
    data: new Uint8Array([
      ..._, ...a, ..._, /* frame 2 */ ..._, ..._, ..._,
      ..._, ...a, ..._, /* frame 2 */ ..._, ...b, ...a,
      ...R, ...R, ...R, ...R, ...R, ...R,
      ...R, ...R, ...R, ...R, ...R, ...R,
    ]),
  })
  const idle = bakeIdle(sheet(R, B), sheet(G, B), { fw: 3, fh: 2, durations: [30, 20] })
  assert.equal(idle.w, 2)
  assert.equal(idle.h, 2)
  assert.deepEqual(idle.durations, [30, 20])
  assert.deepEqual(idle.palette, ['', '#ff0000', '#0000ff'])
  assert.deepEqual(idle.shiny, ['', '#00ff00', '#0000ff'])
  // Frame 1: [R, _ / R, _]; frame 2: [_, _ / B, R].
  assert.deepEqual(idle.frames, [Buffer.from([0x10, 0x10]).toString('base64'), Buffer.from([0x00, 0x21]).toString('base64')])
})

test('bakeIdle refuses a shiny sheet that is not the same pixels', () => {
  const solid = { width: 1, data: new Uint8Array([255, 0, 0, 255]) }
  assert.throws(() => bakeIdle(solid, { width: 1, data: new Uint8Array([0, 0, 0, 0]) }, { fw: 1, fh: 1, durations: [1] }), /not the same pixels/)
})

test('artists names the authors of one animation by credit_names, keeping an id it does not know', () => {
  const names = 'Name\tDiscord\tContact\nCHUNSOFT\tCHUNSOFT\thttps://x\nAudino\t<@!1>\thttps://y\n'
  const credits = '2020\tCHUNSOFT\tCUR\tUnspecified\tWalk,Idle\n2021\t<@!1>\tCUR\tCC_BY-NC_4\tIdle\n2022\t<@!9>\tCUR\tCC_BY-NC_4\tSleep\n2023\t<@!8>\tOLD\tCC_BY-NC_4\tIdle\n'
  assert.deepEqual(artists(credits, names, 'Idle'), ['CHUNSOFT', 'Audino', '<@!8>'])
  assert.deepEqual(artists(credits, names, 'Walk'), ['CHUNSOFT'])
})
