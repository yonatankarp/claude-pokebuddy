import { describe, expect, test } from 'claude-code/testing'
import { exportBlob, freshSave, importBlob, parseSave } from '../hooks/state'

describe('save', () => {
  test('fresh save starts at level 5 with matching EXP', () => {
    const s = freshSave([1, 2, 3, 4])
    expect(s.level).toBe(5)
    expect(s.exp > 0).toBe(true)
    expect(s.version).toBe(1)
  })
  test('parse: empty, ok, future, corrupt', () => {
    expect(parseSave(undefined).kind).toBe('empty')
    const s = freshSave([1, 2, 3, 4])
    expect(parseSave(JSON.parse(JSON.stringify(s)))).toEqual({ kind: 'ok', save: s })
    expect(parseSave({ ...s, version: 2 })).toEqual({ kind: 'future', version: 2 })
    expect(parseSave({ version: 1, species: 'pikachu' }).kind).toBe('corrupt')
    expect(parseSave('nonsense').kind).toBe('corrupt')
    expect(parseSave({ ...s, species: 999 }).kind).toBe('corrupt')
  })
  test('export and import round-trip; tampering is refused', () => {
    const s = { ...freshSave([5, 6, 7, 8]), nickname: 'Sparky ⚡' }
    const blob = exportBlob(s)
    expect(importBlob(blob)).toEqual({ kind: 'ok', save: s })
    const tampered = blob.slice(0, -4) + (blob.endsWith('AAAA') ? 'BBBB' : 'AAAA')
    expect(importBlob(tampered).kind).toBe('bad')
    expect(importBlob('hello').kind).toBe('bad')
  })
})
