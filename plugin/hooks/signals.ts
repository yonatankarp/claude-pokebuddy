export type Signal =
  | { kind: 'tool' }
  | { kind: 'config'; path: string }
  | { kind: 'commit' }
  | { kind: 'push' }
  | { kind: 'pr' }
  | { kind: 'check'; key: string; ok: boolean }

export type Segment = { tokens: string[]; pipedOut: boolean }

/** How the call ended: `unknown` when it never ran to an answer (a deny) or still runs (backgrounded). */
export type Outcome = 'ok' | 'failed' | 'unknown'

const RUNNERS = new Set(['gradle', 'gradlew', './gradlew', 'mvn', './mvnw', 'npm', 'pnpm', 'yarn', 'bun', 'npx', 'pytest', 'cargo', 'go', 'make', 'tsc', 'eslint', 'ruff', 'jest', 'vitest'])
const CHECK_WORDS = /\b(test|tests|check|lint|build|vet|typecheck|vitest|jest|pytest|tsc|eslint|ruff|clippy)\b/
const WRAPPERS = new Set(['command', 'sudo', 'time', 'nohup', 'exec', 'then', 'do'])
const INSTALLERS = new Set(['install', 'i', 'add', 'remove', 'uninstall', 'update', 'upgrade', 'publish'])
const REDIRECT = /^(\d*|&)(>>?|<)/
const VALUE_FLAGS = new Set(['-m', '-F', '--message', '--file', '-C', '-c'])

type Sep = '&&' | '||' | ';' | '&' | '|' | '\n' | null
type RawSegment = { tokens: string[]; sep: Sep }

function splitRaw(command: string): RawSegment[] {
  const segments: RawSegment[] = []
  let tokens: string[] = []
  let word = ''
  let hasWord = false
  let quote: '"' | "'" | null = null
  let heredocs: { tag: string; strip: boolean }[] = []
  const endWord = () => { if (hasWord) tokens.push(word); word = ''; hasWord = false }
  const endSegment = (sep: Sep) => { endWord(); if (tokens.length) segments.push({ tokens, sep }); tokens = [] }
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!
    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"' && i + 1 < command.length) word += command[++i]
      else word += c
      continue
    }
    if (c === '"' || c === "'") { quote = c; hasWord = true; continue }
    if (c === '\\' && command[i + 1] === '\n') { i++; continue }
    if (c === '\\' && i + 1 < command.length) { word += command[++i]; hasWord = true; continue }
    if (c === '\n') {
      endSegment('\n')
      for (const { tag, strip } of heredocs) {
        let pos = i + 1
        while (pos < command.length) {
          let end = command.indexOf('\n', pos)
          if (end === -1) end = command.length
          const line = command.slice(pos, end)
          pos = end + 1
          if ((strip ? line.replace(/^\t+/, '') : line) === tag) break
        }
        i = Math.min(pos, command.length) - 1
      }
      heredocs = []
      continue
    }
    if (c === ' ' || c === '\t') { endWord(); continue }
    if (c === '<' && command[i + 1] === '<' && command[i + 2] !== '<') {
      endWord()
      let j = i + 2
      const strip = command[j] === '-'
      if (strip) j++
      while (command[j] === ' ' || command[j] === '\t') j++
      let tag = ''
      let q: string | null = null
      while (j < command.length) {
        const d = command[j]!
        if (q) { if (d === q) q = null; else tag += d }
        else if (d === '"' || d === "'") q = d
        else if (/[\s;&|<>()]/.test(d)) break
        else tag += d
        j++
      }
      if (tag) heredocs.push({ tag, strip })
      i = j - 1
      continue
    }
    // `2>&1`, `>&2` and `&>` are redirections, not separators.
    if (c === '&' && (command[i - 1] === '>' || command[i + 1] === '>')) { word += c; hasWord = true; continue }
    if (c === '|' && command[i + 1] !== '|') { endSegment('|'); continue }
    if (c === ';' || c === '|' || c === '&') {
      let sep: Sep = c
      if ((c === '|' || c === '&') && command[i + 1] === c) { i++; sep = c === '|' ? '||' : '&&' }
      endSegment(sep)
      continue
    }
    word += c
    hasWord = true
  }
  endSegment(null)
  return segments
}

export function splitCommand(command: string): Segment[] {
  return splitRaw(command).map(({ tokens, sep }) => ({ tokens, pipedOut: sep === '|' }))
}

const normalise = (seg: string[]) => {
  const out: string[] = []
  for (let i = 0; i < seg.length; i++) {
    const m = REDIRECT.exec(seg[i]!)
    if (m) { if (m[0] === seg[i]) i++; continue }
    out.push(seg[i]!)
  }
  let i = 0
  let opened = false
  for (;;) {
    const t = out[i]
    if (t === undefined) break
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t) || WRAPPERS.has(t)) i++
    else if (t === '(') { opened = true; i++ }
    else if (t.startsWith('(')) { opened = true; out[i] = t.slice(1) }
    else break
  }
  const last = out.length - 1
  if (opened && last >= i && out[last]!.endsWith(')')) out[last] = out[last]!.slice(0, -1)
  return out.slice(i).filter(t => t !== '')
}

const CONFIG_NAMES = new Set(['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md'])
// Under a `.claude/` directory but not config: worktree checkouts, session transcripts and memory, plans.
const NOT_CONFIG_UNDER_CLAUDE = new Set(['worktrees', 'projects', 'plans'])

/**
 * CLAUDE.md, CLAUDE.local.md and AGENTS.md at any depth, and any file under a `.claude/` directory except
 * its worktrees, projects and plans; nothing under node_modules. The innermost `.claude` decides, so a
 * worktree's own `.claude/settings.json` counts while its source files do not.
 */
export function isConfigPath(path: string): boolean {
  const parts = path.replace(/\\/g, '/').split('/')
  if (parts.includes('node_modules')) return false
  if (CONFIG_NAMES.has(parts[parts.length - 1] ?? '')) return true
  const at = parts.lastIndexOf('.claude')
  return at !== -1 && at < parts.length - 1 && !NOT_CONFIG_UNDER_CLAUDE.has(parts[at + 1]!)
}

function gitArgs(seg: string[]): { sub: string | undefined; args: string[] } {
  let i = 1
  for (;;) {
    const t = seg[i]
    if (t === '-C' || t === '-c') i += 2
    else if (t === '--no-pager') i++
    else break
  }
  return { sub: seg[i], args: seg.slice(i + 1) }
}

function hasFlag(args: string[], flags: string[]): boolean {
  for (let i = 0; i < args.length; i++) {
    if (VALUE_FLAGS.has(args[i]!)) i++
    else if (flags.includes(args[i]!)) return true
  }
  return false
}

function isCheck(seg: string[]): boolean {
  const [cmd, ...rest] = seg
  if (!cmd || !RUNNERS.has(cmd)) return false
  const words = rest.filter(a => !a.startsWith('-')).slice(0, 2)
  if (words[0] && INSTALLERS.has(words[0])) return false
  return CHECK_WORDS.test([cmd, ...words].join(' '))
}

/** The longest check key: a check is told apart by its runner and leading words, never by its arguments. */
export const CHECK_KEY_MAX = 60
const KEY_WORD = /^[A-Za-z0-9][\w:@+-]*$/

/**
 * What a check is saved, logged and sent as: the runner and at most two words after it, stopping at the
 * first flag, `--`, assignment, path or anything else that is not a plain word. So `pytest -q tests/x`
 * is `pytest` and `make test TOKEN=abc` is `make test`: no flag values, secrets or paths leave the call.
 */
export function checkKey(tokens: readonly string[]): string {
  const [runner, ...rest] = tokens
  if (!runner) return ''
  const words: string[] = []
  for (const t of rest) {
    if (words.length === 2 || !KEY_WORD.test(t)) break
    words.push(t)
  }
  return [runner, ...words].join(' ').slice(0, CHECK_KEY_MAX)
}

/** An older build's key (the whole normalised command) as this build keys it. */
export const rekeyCheck = (key: string) => checkKey(key.split(/\s+/).filter(Boolean))

function bashSignals(command: string, ok: boolean, resultText: string): Signal[] {
  const raw = splitRaw(command)
  if (raw.slice(0, -1).some(s => s.sep === '||' || s.sep === ';' || s.sep === '\n' || s.sep === '&')) return []
  if (raw[raw.length - 1]?.sep === '&') return []
  const segs = raw.map(s => ({ seg: normalise(s.tokens), pipedOut: s.sep === '|' })).filter(s => s.seg.length > 0)
  const real = segs.filter(s => s.seg[0] !== 'cd')
  const out: Signal[] = []
  for (const { seg, pipedOut } of real) {
    if (pipedOut) continue
    const cmd = seg[0]!
    if (cmd === 'git') {
      const { sub, args } = gitArgs(seg)
      if (!ok) continue
      if (sub === 'commit' && !hasFlag(args, ['--dry-run', '--allow-empty'])) out.push({ kind: 'commit' })
      else if (sub === 'push' && !hasFlag(args, ['--dry-run', '-n']) && !resultText.includes('Everything up-to-date')) out.push({ kind: 'push' })
    } else if (cmd === 'gh') {
      if (ok && seg[1] === 'pr' && seg[2] === 'create') out.push({ kind: 'pr' })
    } else if (isCheck(seg) && (ok || segs.length === 1)) {
      out.push({ kind: 'check', key: checkKey(seg), ok })
    }
  }
  return out
}

/** `resultText` is the result as the model read it: a push that had nothing to send says so there. */
export function signalsFromTool(tool: string, input: Record<string, unknown>, outcome: Outcome, resultText = ''): Signal[] {
  const out: Signal[] = [{ kind: 'tool' }]
  if (outcome === 'unknown') return out
  if (tool === 'Bash' && typeof input.command === 'string' && input.run_in_background !== true) {
    out.push(...bashSignals(input.command, outcome === 'ok', resultText))
  }
  if (outcome === 'ok' && (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') && typeof input.file_path === 'string' && isConfigPath(input.file_path)) {
    out.push({ kind: 'config', path: input.file_path })
  }
  return out
}
