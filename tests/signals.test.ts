import { describe, expect, test } from 'claude-code/testing'
import { isConfigPath, signalsFromTool, splitCommand } from '../hooks/signals'

const bash = (command: string, isError = false) => signalsFromTool('Bash', { command }, isError).map(s => s.kind === 'check' ? `check:${s.key}:${s.ok}` : s.kind)

describe('splitCommand', () => {
  test('splits on && || ; | outside quotes and keeps quoted words whole', () => {
    expect(splitCommand(`git add . && git commit -m "fix: a && b"; echo 'x | y' | cat`)).toEqual([
      { tokens: ['git', 'add', '.'], pipedOut: false },
      { tokens: ['git', 'commit', '-m', 'fix: a && b'], pipedOut: false },
      { tokens: ['echo', 'x | y'], pipedOut: true },
      { tokens: ['cat'], pipedOut: false },
    ])
  })
  test('redirections with & are not separators', () => {
    expect(splitCommand('./gradlew test 2>&1 | tail -20')).toEqual([
      { tokens: ['./gradlew', 'test', '2>&1'], pipedOut: true },
      { tokens: ['tail', '-20'], pipedOut: false },
    ])
    expect(splitCommand('npm test &> out.log')).toEqual([{ tokens: ['npm', 'test', '&>', 'out.log'], pipedOut: false }])
  })
})

describe('signalsFromTool', () => {
  test('every call is a tool signal', () => {
    expect(bash('ls')).toEqual(['tool'])
    expect(signalsFromTool('Read', { file_path: '/x' }, false).map(s => s.kind)).toEqual(['tool'])
  })
  test('commit, push and PR on success only', () => {
    expect(bash('git add -A && git commit -m "x"')).toEqual(['tool', 'commit'])
    expect(bash('git push origin main')).toEqual(['tool', 'push'])
    expect(bash('gh pr create --fill')).toEqual(['tool', 'pr'])
    expect(bash('git commit -m x', true)).toEqual(['tool'])
  })
  test('trigger words inside quotes or arguments do not count', () => {
    expect(bash('echo "git push"')).toEqual(['tool'])
    expect(bash('grep "git commit" log.txt')).toEqual(['tool'])
    expect(bash('git commit --dry-run -m x')).toEqual(['tool'])
    expect(bash('git log --grep push')).toEqual(['tool'])
  })
  test('env prefixes and cd segments are skipped', () => {
    expect(bash('cd repo && GIT_AUTHOR_NAME=x git commit -m y')).toEqual(['tool', 'commit'])
  })
  test('checks carry a normalised key and the outcome', () => {
    expect(bash('./gradlew test', true)).toEqual(['tool', 'check:./gradlew test:false'])
    expect(bash('npm  test')).toEqual(['tool', 'check:npm test:true'])
    expect(bash('npx vitest run')).toEqual(['tool', 'check:npx vitest run:true'])
    expect(bash('cargo build --release')).toEqual(['tool', 'check:cargo build --release:true'])
    expect(bash('pytest -q', true)).toEqual(['tool', 'check:pytest -q:false'])
    expect(bash('tsc --noEmit')).toEqual(['tool', 'check:tsc --noEmit:true'])
    expect(bash('npm install')).toEqual(['tool'])
    expect(bash('./run-checks.sh')).toEqual(['tool'])
  })
  test('a piped check or git command has an unknown outcome and is skipped', () => {
    expect(bash('./gradlew test 2>&1 | tail -20')).toEqual(['tool'])
    expect(bash('./gradlew test 2>&1 | tail -20', true)).toEqual(['tool'])
    expect(bash('git push 2>&1 | tail -5')).toEqual(['tool'])
  })
  test('config edits through Edit, Write and MultiEdit', () => {
    const k = (tool: string, file_path: string) => signalsFromTool(tool, { file_path }, false).map(s => s.kind)
    expect(k('Edit', '/repo/CLAUDE.md')).toEqual(['tool', 'config'])
    expect(k('Write', '/Users/me/.claude/settings.json')).toEqual(['tool', 'config'])
    expect(k('MultiEdit', '/repo/.claude/skills/x/SKILL.md')).toEqual(['tool', 'config'])
    expect(k('Edit', '/repo/src/main.ts')).toEqual(['tool'])
    expect(signalsFromTool('Edit', { file_path: '/repo/CLAUDE.md' }, true).map(s => s.kind)).toEqual(['tool'])
  })
  test('isConfigPath', () => {
    expect(isConfigPath('AGENTS.md')).toBe(true)
    expect(isConfigPath('/r/CLAUDE.local.md')).toBe(true)
    expect(isConfigPath('/r/hooks/register.tsx')).toBe(false)
  })
})
