import { describe, expect, test } from 'claude-code/testing'
import { isConfigPath, signalsFromTool, splitCommand, type Signal } from '../hooks/signals'

const label = (s: Signal) => (s.kind === 'check' ? `check:${s.key}:${s.ok}` : s.kind)
const bash = (command: string, isError = false) => signalsFromTool('Bash', { command }, isError ? 'failed' : 'ok').map(label)

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
    expect(signalsFromTool('Read', { file_path: '/x' }, 'ok').map(s => s.kind)).toEqual(['tool'])
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
    const k = (tool: string, file_path: string) => signalsFromTool(tool, { file_path }, 'ok').map(s => s.kind)
    expect(k('Edit', '/repo/CLAUDE.md')).toEqual(['tool', 'config'])
    expect(k('Write', '/Users/me/.claude/settings.json')).toEqual(['tool', 'config'])
    expect(k('MultiEdit', '/repo/.claude/skills/x/SKILL.md')).toEqual(['tool', 'config'])
    expect(k('Edit', '/repo/src/main.ts')).toEqual(['tool'])
    expect(signalsFromTool('Edit', { file_path: '/repo/CLAUDE.md' }, 'failed').map(s => s.kind)).toEqual(['tool'])
  })
  test('isConfigPath', () => {
    expect(isConfigPath('AGENTS.md')).toBe(true)
    expect(isConfigPath('/r/CLAUDE.local.md')).toBe(true)
    expect(isConfigPath('/r/hooks/register.tsx')).toBe(false)
  })
})

describe('signalsFromTool hardening', () => {
  test('newline separates commands and continuation is dropped', () => {
    expect(bash('git add -A\ngit commit -m x')).toEqual(['tool'])
    expect(bash('./gradlew test \\\n  --info')).toEqual(['tool', 'check:./gradlew test --info:true'])
    expect(splitCommand('a\nb')).toEqual([{ tokens: ['a'], pipedOut: false }, { tokens: ['b'], pipedOut: false }])
  })
  test('unquoted heredoc bodies are skipped, quoted ones are not', () => {
    expect(bash("cat > f <<'EOF'\nfoo; git push\nEOF")).toEqual(['tool'])
    expect(bash('cat <<-EOF\n\tgit push\n\tEOF')).toEqual(['tool'])
    expect(bash(`git commit -m "$(cat <<'EOF'\nfix: it's done\n\nCo-Authored-By: x\nEOF\n)"`)).toEqual(['tool', 'commit'])
  })
  test('wrappers and git global options', () => {
    expect(bash('git -C repo commit -m x')).toEqual(['tool', 'commit'])
    expect(bash('git -c a=b push')).toEqual(['tool', 'push'])
    expect(bash('git --no-pager commit -m x')).toEqual(['tool', 'commit'])
    expect(bash('command git push')).toEqual(['tool', 'push'])
    expect(bash('(git push)')).toEqual(['tool', 'push'])
  })
  test('outcome attribution needs && only', () => {
    expect(bash('./gradlew test || true')).toEqual(['tool'])
    expect(bash('git commit -m x; git status')).toEqual(['tool'])
    expect(bash('./gradlew test & git push')).toEqual(['tool'])
    expect(bash('cd r && ./gradlew test', true)).toEqual(['tool'])
    expect(bash('cd r && ./gradlew test')).toEqual(['tool', 'check:./gradlew test:true'])
    expect(bash('npm test && git push', true)).toEqual(['tool'])
    expect(bash('git add . && git commit -m x && git push')).toEqual(['tool', 'commit', 'push'])
    expect(bash('git commit -m x;')).toEqual(['tool', 'commit'])
  })
  test('check key drops redirections', () => {
    expect(bash('./gradlew test > /tmp/x.log 2>&1')).toEqual(['tool', 'check:./gradlew test:true'])
    expect(bash('./gradlew test 2>/dev/null >>o.log')).toEqual(['tool', 'check:./gradlew test:true'])
    expect(bash('npm test &> out.log < in')).toEqual(['tool', 'check:npm test:true'])
  })
  test('check words only look at runner and leading args', () => {
    expect(bash('npm install --save-dev vitest')).toEqual(['tool'])
    expect(bash('cargo install clippy')).toEqual(['tool'])
    expect(bash('npx vitest run')).toEqual(['tool', 'check:npx vitest run:true'])
    expect(bash('pytest -q')).toEqual(['tool', 'check:pytest -q:true'])
    expect(bash('go test ./...')).toEqual(['tool', 'check:go test ./...:true'])
    expect(bash('make -j4 build')).toEqual(['tool', 'check:make -j4 build:true'])
  })
  test('dry-run flags', () => {
    expect(bash('git push -n')).toEqual(['tool'])
    expect(bash('git push --dry-run origin')).toEqual(['tool'])
    expect(bash('git commit -m x --dry-run')).toEqual(['tool'])
    expect(bash('git commit -m --dry-run')).toEqual(['tool', 'commit'])
  })
})

describe('signalsFromTool outcome', () => {
  test('a background Bash call has no outcome yet', () => {
    const bg = (command: string) => signalsFromTool('Bash', { command, run_in_background: true }, 'ok').map(label)
    expect(bg('git commit -m x')).toEqual(['tool'])
    expect(bg('git push')).toEqual(['tool'])
    expect(bg('gh pr create --fill')).toEqual(['tool'])
    expect(bg('npm test')).toEqual(['tool'])
  })
  test('a trailing & backgrounds the command', () => {
    expect(bash('npm test &')).toEqual(['tool'])
    expect(bash('git push &')).toEqual(['tool'])
    expect(bash('npm test &> out.log')).toEqual(['tool', 'check:npm test:true'])
  })
  test('a failure is red only for a check that is the sole segment', () => {
    expect(bash('npm test', true)).toEqual(['tool', 'check:npm test:false'])
    expect(bash('cd web && npm test', true)).toEqual(['tool'])
    expect(bash('npm run build && npm test', true)).toEqual(['tool'])
  })
  test('a denied call has an unknown outcome: only the tool signal', () => {
    expect(signalsFromTool('Bash', { command: 'npm test' }, 'unknown').map(label)).toEqual(['tool'])
    expect(signalsFromTool('Bash', { command: 'git commit -m x' }, 'unknown').map(label)).toEqual(['tool'])
    expect(signalsFromTool('Edit', { file_path: '/repo/CLAUDE.md' }, 'unknown').map(label)).toEqual(['tool'])
  })
})
