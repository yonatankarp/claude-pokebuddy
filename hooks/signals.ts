export type Signal =
  | { kind: 'tool' }
  | { kind: 'config'; path: string }
  | { kind: 'commit' }
  | { kind: 'push' }
  | { kind: 'pr' }
  | { kind: 'check'; key: string; ok: boolean }

export type Segment = { tokens: string[]; pipedOut: boolean }

const RUNNERS = new Set(['gradle', 'gradlew', './gradlew', 'mvn', './mvnw', 'npm', 'pnpm', 'yarn', 'bun', 'npx', 'pytest', 'cargo', 'go', 'make', 'tsc', 'eslint', 'ruff', 'jest', 'vitest'])
const CHECK_WORDS = /\b(test|tests|check|lint|build|vet|typecheck|vitest|jest|pytest|tsc|eslint|ruff|clippy)\b/

export function splitCommand(command: string): Segment[] {
  const segments: Segment[] = []
  let tokens: string[] = []
  let word = ''
  let hasWord = false
  let quote: '"' | "'" | null = null
  const endWord = () => { if (hasWord) tokens.push(word); word = ''; hasWord = false }
  const endSegment = (pipedOut: boolean) => { endWord(); if (tokens.length) segments.push({ tokens, pipedOut }); tokens = [] }
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!
    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"' && i + 1 < command.length) word += command[++i]
      else word += c
      continue
    }
    if (c === '"' || c === "'") { quote = c; hasWord = true; continue }
    if (c === '\\' && i + 1 < command.length) { word += command[++i]; hasWord = true; continue }
    if (c === ' ' || c === '\t' || c === '\n') { endWord(); continue }
    // `2>&1`, `>&2` and `&>` are redirections, not separators.
    if (c === '&' && (command[i - 1] === '>' || command[i + 1] === '>')) { word += c; hasWord = true; continue }
    if (c === '|' && command[i + 1] !== '|') { endSegment(true); continue }
    if (c === ';' || c === '|' || c === '&') {
      if ((c === '|' || c === '&') && command[i + 1] === c) i++
      endSegment(false)
      continue
    }
    word += c
    hasWord = true
  }
  endSegment(false)
  return segments
}

const stripEnv = (seg: string[]) => {
  let i = 0
  while (i < seg.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(seg[i]!)) i++
  return seg.slice(i)
}

export function isConfigPath(path: string): boolean {
  const name = path.split('/').pop() ?? ''
  if (name === 'CLAUDE.md' || name === 'CLAUDE.local.md' || name === 'AGENTS.md') return true
  return path.includes('/.claude/') || path.startsWith('.claude/')
}

function bashSignals(command: string, ok: boolean): Signal[] {
  const out: Signal[] = []
  for (const { tokens, pipedOut } of splitCommand(command)) {
    const seg = stripEnv(tokens)
    const [cmd, sub, third] = seg
    if (!cmd || cmd === 'cd' || pipedOut) continue
    if (ok && cmd === 'git' && sub === 'commit' && !seg.includes('--dry-run')) out.push({ kind: 'commit' })
    else if (ok && cmd === 'git' && sub === 'push' && !seg.includes('--dry-run')) out.push({ kind: 'push' })
    else if (ok && cmd === 'gh' && sub === 'pr' && third === 'create') out.push({ kind: 'pr' })
    else if (RUNNERS.has(cmd) && CHECK_WORDS.test(seg.join(' '))) out.push({ kind: 'check', key: seg.join(' '), ok })
  }
  return out
}

export function signalsFromTool(tool: string, input: Record<string, unknown>, isError: boolean): Signal[] {
  const out: Signal[] = [{ kind: 'tool' }]
  if (tool === 'Bash' && typeof input.command === 'string') out.push(...bashSignals(input.command, !isError))
  if (!isError && (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') && typeof input.file_path === 'string' && isConfigPath(input.file_path)) {
    out.push({ kind: 'config', path: input.file_path })
  }
  return out
}
