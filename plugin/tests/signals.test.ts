import { describe, expect, test } from 'claude-code/testing'
import { CHECK_KEY_MAX, checkKey, configSignal, isConfigPath, rekeyCheck, signalsFromTool, splitCommand, type Signal } from '../hooks/signals'

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
    expect(bash('cargo build --release')).toEqual(['tool', 'check:cargo build:true'])
    expect(bash('pytest -q', true)).toEqual(['tool', 'check:pytest:false'])
    expect(bash('tsc --noEmit')).toEqual(['tool', 'check:tsc:true'])
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
  test('isConfigPath: under .claude only settings, CLAUDE.md, keybindings and the agents, commands, skills, hooks and output-styles folders', () => {
    expect(isConfigPath('/r/.claude/settings.json')).toBe(true)
    expect(isConfigPath('/r/.claude/settings.local.json')).toBe(true)
    expect(isConfigPath('/Users/me/.claude/CLAUDE.md')).toBe(true)
    expect(isConfigPath('/Users/me/.claude/keybindings.json')).toBe(true)
    for (const dir of ['agents', 'commands', 'skills', 'hooks', 'output-styles']) expect(isConfigPath(`/r/.claude/${dir}/x/y.md`)).toBe(true)
    expect(isConfigPath('.claude/commands/ship.md')).toBe(true)
    expect(isConfigPath('C:\\r\\.claude\\settings.json')).toBe(true)
    expect(isConfigPath('/r/.claude/worktrees/a/.claude/settings.json')).toBe(true)
    expect(isConfigPath('/r/.claude/worktrees/a/CLAUDE.md')).toBe(true)
  })
  test('isConfigPath: the rest of .claude and node_modules are not config', () => {
    expect(isConfigPath('/r/.claude/worktrees/a/src/x.ts')).toBe(false)
    expect(isConfigPath('/Users/me/.claude/plans/happy-fox.md')).toBe(false)
    expect(isConfigPath('/Users/me/.claude/projects/-r/memory/MEMORY.md')).toBe(false)
    expect(isConfigPath('/Users/me/.claude/projects/-r/abc.jsonl')).toBe(false)
    expect(isConfigPath('/Users/me/.claude/plugins/cache/p/commands/x.md')).toBe(false)
    expect(isConfigPath('/Users/me/.claude/todos/t.json')).toBe(false)
    expect(isConfigPath('/Users/me/.claude/shell-snapshots/s.sh')).toBe(false)
    expect(isConfigPath('/Users/me/.claude/history.jsonl')).toBe(false)
    expect(isConfigPath('/Users/me/.claude/agents')).toBe(false)
    expect(isConfigPath('/r/node_modules/pkg/CLAUDE.md')).toBe(false)
    expect(isConfigPath('/r/node_modules/pkg/.claude/settings.json')).toBe(false)
    expect(isConfigPath('/r/.claude')).toBe(false)
  })
  test('a config signal holds the file name, never the path', () => {
    const [, sig] = signalsFromTool('Edit', { file_path: 'C:\\Users\\alice\\secretproj\\CLAUDE.md' }, 'ok')
    expect(sig).toMatchObject({ kind: 'config', name: 'CLAUDE.md' })
    expect(JSON.stringify(sig)).not.toMatch(/alice|secretproj|Users/)
    expect(configSignal('/a/CLAUDE.md')).not.toEqual(configSignal('/b/CLAUDE.md'))
    expect(configSignal('/a/CLAUDE.md')).toEqual(configSignal('/a/CLAUDE.md'))
  })
})

describe('signalsFromTool hardening', () => {
  test('newline separates commands and continuation is dropped', () => {
    expect(bash('git add -A\ngit commit -m x')).toEqual(['tool'])
    expect(bash('./gradlew test \\\n  --info')).toEqual(['tool', 'check:./gradlew test:true'])
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
  test('a commit, push or PR the exit code cannot vouch for counts when its output proves it', () => {
    const run = (command: string, text: string, isError = false) => signalsFromTool('Bash', { command }, isError ? 'failed' : 'ok', text).map(label)
    const committed = '[main 1a2b3c4] fix: the thing\n 1 file changed, 2 insertions(+)'
    const pushed = 'To github.com:me/repo.git\n   1a2b3c4..5d6e7f8  main -> main'
    expect(run('git add -A && git commit -m x; git log --oneline -1', committed)).toEqual(['tool', 'commit'])
    expect(run('git commit -m x && git push 2>&1 | tail -3', `${committed}\n${pushed}`)).toEqual(['tool', 'commit', 'push'])
    expect(run('git push -u origin feat 2>&1 | grep -v remote', ' * [new branch]      feat -> feat')).toEqual(['tool', 'push'])
    expect(run('git commit -m x && npm test', committed, true)).toEqual(['tool', 'commit'])
    expect(run('gh pr create --fill; echo done', 'https://github.com/me/repo/pull/7\ndone')).toEqual(['tool', 'pr'])
  })
  test('output alone proves nothing: no proof, a quiet push, a PR that exists or a command that never ran it', () => {
    const run = (command: string, text: string, isError = false) => signalsFromTool('Bash', { command }, isError ? 'failed' : 'ok', text).map(label)
    expect(run('git commit -q -m x; git log -1', '')).toEqual(['tool'])
    expect(run('git push -q 2>&1 | grep -v remote', '')).toEqual(['tool'])
    expect(run('git commit -m x; git status', 'nothing to commit, working tree clean')).toEqual(['tool'])
    expect(run('gh pr create --fill; true', 'a pull request for branch "feat" into branch "main" already exists:\nhttps://github.com/me/repo/pull/7'))
      .toEqual(['tool'])
    expect(run('git log -3; cat notes.txt', '[main 1a2b3c4] an old commit')).toEqual(['tool'])
    expect(run('git commit -m x; git commit -m y', '[main 1a2b3c4] x')).toEqual(['tool', 'commit'])
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
    expect(bash('pytest -q')).toEqual(['tool', 'check:pytest:true'])
    expect(bash('go test ./...')).toEqual(['tool', 'check:go test:true'])
    expect(bash('make -j4 build')).toEqual(['tool', 'check:make:true'])
  })
  test('empty commits and pushes with nothing to send earn nothing', () => {
    expect(bash('git commit --allow-empty -m a && git commit --allow-empty -m b')).toEqual(['tool'])
    expect(signalsFromTool('Bash', { command: 'git push' }, 'ok', 'Everything up-to-date').map(label)).toEqual(['tool'])
    expect(signalsFromTool('Bash', { command: 'git push' }, 'ok', 'To github.com:x/y.git\n   a..b  main -> main').map(label)).toEqual(['tool', 'push'])
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

describe('check keys keep only the runner and its leading words', () => {
  test('no flags, flag values, assignments or paths', () => {
    expect(bash('make test TOKEN=abc')).toEqual(['tool', 'check:make test:true'])
    expect(bash('pytest --password=x', true)).toEqual(['tool', 'check:pytest:false'])
    expect(bash('pytest -k secret_name tests/test_login.py')).toEqual(['tool', 'check:pytest:true'])
    expect(bash('npm test -- src/login.test.ts')).toEqual(['tool', 'check:npm test:true'])
    expect(bash('npm run test:unit -- --watch')).toEqual(['tool', 'check:npm run test:unit:true'])
    expect(bash('API_KEY=sk-123 npm test')).toEqual(['tool', 'check:npm test:true'])
    expect(bash('npm test "reply 100"')).toEqual(['tool', 'check:npm test:true'])
    expect(bash('pytest test_login.py')).toEqual(['tool', 'check:pytest:true'])
  })
  test('at most two words and CHECK_KEY_MAX characters', () => {
    expect(checkKey(['npx', 'vitest', 'run', 'login'])).toBe('npx vitest run')
    expect(checkKey(['make', 'a'.repeat(100)]).length).toBe(CHECK_KEY_MAX)
    expect(checkKey([])).toBe('')
  })
  test('an older build\'s whole-command key is cut down the same way', () => {
    expect(rekeyCheck('pytest --password=x tests')).toBe('pytest')
    expect(rekeyCheck('make test TOKEN=abc')).toBe('make test')
    expect(rekeyCheck('npm test')).toBe('npm test')
  })
})
