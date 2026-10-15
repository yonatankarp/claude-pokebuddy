import { describe, expect, test } from 'claude-code/testing'
import { dexText, helpText, parseArgs, parseStone, statsText } from '../hooks/commands'
import { skillStats } from '../hooks/skills'
import { species } from '../hooks/data/dex'
import { freshSave } from '../hooks/state'

describe('commands', () => {
  test('parseArgs', () => {
    expect(parseArgs('')).toEqual({ sub: 'stats', rest: '' })
    expect(parseArgs('  use thunder stone ')).toEqual({ sub: 'use', rest: 'thunder stone' })
    expect(parseArgs('dex #25')).toEqual({ sub: 'dex', rest: '#25' })
    expect(parseArgs('dance')).toEqual({ sub: 'help', rest: 'dance' })
  })
  test('the removed save commands are gone from help and show it instead', () => {
    for (const sub of ['export', 'import', 'restore', 'reset']) {
      expect(helpText('buddy')).not.toContain(`/buddy ${sub}`)
      expect(parseArgs(`${sub} confirm`).sub).toBe('help')
    }
  })
  test('parseStone', () => {
    expect(parseStone('thunder')).toBe('thunder-stone')
    expect(parseStone('Thunder Stone')).toBe('thunder-stone')
    expect(parseStone('fire-stone')).toBe('fire-stone')
    expect(parseStone('rock')).toBe(null)
  })
  test('stats shows level, EXP to next, bag and streak', () => {
    const s = { ...freshSave([1, 2, 3, 4]), species: 25, bag: { 'thunder-stone': 1 } }
    const t = statsText(s, '2026-10-11')
    expect(t).toContain('PIKACHU')
    expect(t).toContain('Lv 1')
    expect(t).toContain('THUNDER STONE ×1')
    expect(t).toContain('Thunder Stone 0/10 green checks')
  })
  test('stats skips EXP sources this version does not know', () => {
    const s = { ...freshSave([1, 2, 3, 4]), expBySource: { prompt: 10, bogus: 5 } as Record<string, number> }
    const t = statsText(s, '2026-10-11')
    expect(t).toContain('FOCUS      3  10 EXP from prompts, active time; +1% EXP, draws PSYCHIC/FIGHTING')
    expect(t).not.toContain('undefined')
  })
  test('skills grow from the EXP of their work, as its square root, capped at 99; feeding grows none', () => {
    const s = { ...freshSave([1, 2, 3, 4]), expBySource: { green: 400, commit: 60, push: 40, tool: 99_999, feed: 5000 } }
    expect(skillStats(s).map(k => [k.name, k.value, k.exp])).toEqual([
      ['DEBUGGING', 20, 400], ['SHIPPING', 10, 100], ['HACKING', 99, 99_999],
      ['FOCUS', 0, 0], ['TINKERING', 0, 0], ['WISDOM', 0, 0],
    ])
    const t = statsText(s, '2026-10-11')
    expect(t).toContain('  DEBUGGING 20  400 EXP from green checks; +10% EXP, draws BUG/POISON')
    expect(t).toContain('  SHIPPING  10  100 EXP from commits, pushes and PRs')
    expect(t).toContain('  Feeding: 5000 EXP')
    expect(t).not.toContain('EXP by source')
  })
  test('dex text has number, types, size and entry', () => {
    const t = dexText(species(25), false)
    expect(t).toContain('#025 PIKACHU')
    expect(t).toContain('electric')
    expect(t).toContain('0.4 m')
    expect(t).toContain('6.0 kg')
  })
  test('help names every sub-command', () => {
    for (const sub of ['stats', 'dex', 'feed', 'use', 'stop', 'toggle', 'quiet', 'nickname']) {
      expect(helpText('buddy')).toContain(`/buddy ${sub}`)
    }
  })
  test('stats shows a broken feed streak as 0, and the Leaf Stone progress with it', () => {
    const fed = (lastDate: string) => ({ ...freshSave([1, 2, 3, 4]), feed: { lastDate }, counters: { greens: 0, commits: 0, configEdits: 0, feedRun: 3 } })
    expect(statsText(fed('2026-10-11'), '2026-10-11')).toContain('Feed streak: 3 days.')
    expect(statsText(fed('2026-10-10'), '2026-10-11')).toContain('Leaf Stone 3/7 feed days')
    const broken = statsText(fed('2026-10-09'), '2026-10-11')
    expect(broken).toContain('Feed streak: 0 days.')
    expect(broken).toContain('Leaf Stone 0/7 feed days')
  })
})
