import { describe, expect, test } from 'claude-code/testing'
import { dexText, helpText, parseArgs, parseStone, statsText } from '../hooks/commands'
import { species } from '../hooks/data/dex'
import { freshSave } from '../hooks/state'

describe('commands', () => {
  test('parseArgs', () => {
    expect(parseArgs('')).toEqual({ sub: 'stats', rest: '' })
    expect(parseArgs('  use thunder stone ')).toEqual({ sub: 'use', rest: 'thunder stone' })
    expect(parseArgs('dex #25')).toEqual({ sub: 'dex', rest: '#25' })
    expect(parseArgs('dance')).toEqual({ sub: 'help', rest: 'dance' })
  })
  test('parseStone', () => {
    expect(parseStone('thunder')).toBe('thunder-stone')
    expect(parseStone('Thunder Stone')).toBe('thunder-stone')
    expect(parseStone('fire-stone')).toBe('fire-stone')
    expect(parseStone('rock')).toBe(null)
  })
  test('stats shows level, EXP to next, bag and streak', () => {
    const s = { ...freshSave([1, 2, 3, 4]), species: 25, bag: { 'thunder-stone': 1 } }
    const t = statsText(s)
    expect(t).toContain('PIKACHU')
    expect(t).toContain('Lv 5')
    expect(t).toContain('THUNDER STONE ×1')
    expect(t).toContain('Thunder Stone 0/10 green checks')
  })
  test('dex text has number, types, size and entry', () => {
    const t = dexText(species(25), false)
    expect(t).toContain('#025 PIKACHU')
    expect(t).toContain('electric')
    expect(t).toContain('0.4 m')
    expect(t).toContain('6.0 kg')
  })
  test('help names every sub-command', () => {
    for (const sub of ['stats', 'dex', 'feed', 'use', 'stop', 'toggle', 'quiet', 'nickname', 'export', 'import']) {
      expect(helpText('buddy')).toContain(`/buddy ${sub}`)
    }
  })
})
