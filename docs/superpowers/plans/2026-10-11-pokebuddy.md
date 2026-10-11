# claude-pokebuddy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shareable Claude Code mod that shows a Gen 1 Pokémon above the prompt which earns EXP from real work, levels up and evolves.

**Architecture:** A Node build pipeline (`scripts/`) fetches Crystal sprites and species data from PokeAPI once and bakes them into a committed TypeScript data module. The mod (`hooks/`) is pure game logic (roll, EXP, signals, evolution, state) plus thin effectful wiring in `register.tsx` that reads Claude Code events, persists to `$.store`, calls Haiku for speech and judging, and draws the `AbovePrompt` band.

**Tech Stack:** Claude Code function-hooks mod API (build 2.1.296, `claude-code` and `claude-code/testing`), TypeScript 5.4+, JSX with `h`; Node 22 with `tsx`, `pngjs` and `node:test` for the build scripts only.

**Spec:** `docs/superpowers/specs/2026-10-11-pokebuddy-design.md`

## Global Constraints

- Plugin name `pokebuddy` (the `claude-` prefix is reserved), repository `claude-pokebuddy`; install line `/plugin install pokebuddy --marketplace yonatankarp/claude-pokebuddy`.
- The hooks module and everything it imports: no Node, no DOM, no `require`, no dynamic `import()`. Everything outside goes through `$`.
- Species #1 to #151 only; any evolution target or pre-evolution with id > 151 is ignored.
- Roll weights: multi-stage base 1, single-stage base 0.33, legendaries (144, 145, 146, 150, 151) 0.02. Shiny 1 in 512. Start level 5.
- EXP table: prompt 10; tool 2 capped 40 per turn; active 5 per new 10-minute window with a prompt; config edit 25 once per file per turn; commit 30; push or PR 50; green after red 40; judge 0 to 100; feed to next level plus 10% per streak day, streak bonus capped at 7.
- Stones: Thunder every 10 green checks, Fire every 10 commits, Water every 10 config edits, Leaf each 7 consecutive feed days, Moon once per local night (hour 0 to 4).
- Trade evolutions on a successful push or PR at level 36 or higher. Stone evolutions only through `/buddy use`.
- Speech model default `haiku` (alias, a `userConfig` option `speechModel`), 4000 ms timeout, never blocks a turn. The spec's `claude-haiku-5-5` is replaced by the alias so the mod tracks the cheapest Haiku.
- `$.store` key `save`, schema `version: 1`; total store under 4 MiB.
- Commits use the repo-local identity `Yonatan Karp-Rudin <yonvata@gmail.com>`; never the work address. Every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`; the `git commit -m` lines below omit it for brevity and must have it added.
- Several Claude Code sessions may run at once and share one `$.store`. Every change to the save reads it fresh from the store, applies the change and writes it back (`mutate` in Task 11); the `$.state` copy is only what the band draws.
- Minimum Claude Code version: 2.1.296 (early-access mod API).
- Writing style for README and user-facing text: no em dashes.

## Review Focus

- A Bash command where the trigger words appear only inside quotes or as arguments (`echo "git push"`, `grep "git commit" log`) must not count as a commit or push.
- A save from a future version or a corrupt save must never be overwritten silently; the player keeps their Pokémon.
- A terminal narrower than 60 columns, or a band with `maxRows` of 1, must still draw something sane (compact line, no bubble) and never throw.
- Haiku failing, timing out or replying with junk must leave the turn untouched and fall back to a canned cry; the judge must ignore a reply with no number.
- Subagent tool calls and subagent `turn.complete` events must not trigger speech or double-count turns.
- Two sessions open at once: a change one session made to the store must survive the other session's next turn or command.
- The checks Claude really runs: `./gradlew test 2>&1 | tail -20` (piped, outcome unknown, skipped), `pytest -q`, `tsc --noEmit`.

Each line has a test in the task that owns the code (Tasks 5, 7, 8, 9, 11, 11 and 5 respectively).

---

## File Structure

```
claude-pokebuddy/
  .claude-plugin/plugin.json          manifest, userConfig, types
  .claude-plugin/marketplace.json     marketplace entry, source ./
  hooks/hooks.json                    { "modules": ["./register.tsx"] }
  hooks/register.tsx                  wiring only
  hooks/config.ts                     COMMAND name, tunables
  hooks/codec.ts                      base64 and FNV-1a, no globals
  hooks/rng.ts                        sfc32 PRNG
  hooks/data/types.ts                 Species, Sprite, Evolution, Stone
  hooks/data/pokedex.generated.ts     baked data (Task 3)
  hooks/data/dex.ts                   lookup helpers over POKEDEX
  hooks/roll.ts                       seed to species, shiny, personality
  hooks/exp.ts                        growth curves and level math
  hooks/signals.ts                    tool and prompt inputs to Signal[]
  hooks/tally.ts                      per-turn EXP with caps and green tracking
  hooks/evolution.ts                  evolution and stone rules
  hooks/state.ts                      Save, parse, fresh, export and import blob
  hooks/game.ts                       applyTurn, feed, useStone, finishEvolution
  hooks/localtime.ts                  local date and hour
  hooks/speech.ts                     prompt builder, cries, model call
  hooks/judge.ts                      prompt builder, score parser, model call
  hooks/render/sprite.ts              palette pixels to half-block runs
  hooks/render/band.tsx               compact and full band
  hooks/commands.ts                   /buddy argument dispatch and texts
  types/index.d.ts                    PluginState contract
  tests/*.test.ts(x)                  claude plugin test suites
  scripts/fetch.ts, scripts/bake.ts   build pipeline (Node)
  scripts/*.spec.ts                   node:test suites for the pipeline
  scripts/raw/                        downloaded PNG and JSON (gitignored)
  package.json, tsconfig.json, tsconfig.scripts.json
  README.md, LICENSE, .github/workflows/ci.yml
```

Node tests are named `*.spec.ts` so `claude plugin test` (which runs `*.test.ts` in the sandbox) never picks them up.

---

### Task 1: Scaffold and API spike

Settles three unknowns before any logic depends on them: whether the command name `buddy` is free, whether the sandbox knows the local time zone, and whether a local import loads.

**Files:**
- Create: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `hooks/hooks.json`, `hooks/register.tsx`, `hooks/config.ts`, `tsconfig.json`, `.gitignore`, `LICENSE`
- Create (throwaway, deleted in Step 6): `hooks/spike.ts`

**Interfaces:**
- Produces: `COMMAND: string` from `hooks/config.ts`; `LOCALTIME_MODE: 'intl' | 'process'` written into `hooks/config.ts` from the spike result.

- [ ] **Step 1: Write the manifest, marketplace and module list**

`.claude-plugin/plugin.json`:
```json
{
  "name": "claude-pokebuddy",
  "version": "0.1.0",
  "description": "A Gen 1 Pokémon buddy above your prompt that levels up and evolves from real work.",
  "types": "./types/index.d.ts",
  "userConfig": {
    "speechModel": {
      "type": "string",
      "title": "Speech model",
      "description": "Model alias or id for the buddy's reactions and the session judge.",
      "default": "haiku"
    }
  }
}
```

`.claude-plugin/marketplace.json`:
```json
{
  "name": "claude-pokebuddy",
  "owner": { "name": "Yonatan Karp-Rudin" },
  "plugins": [{ "name": "claude-pokebuddy", "source": "./" }]
}
```

`hooks/hooks.json`:
```json
{ "modules": ["./register.tsx"] }
```

`tsconfig.json` (from the types header):
```json
{
  "compilerOptions": {
    "target": "es2023", "lib": ["es2023"], "types": [],
    "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noUncheckedIndexedAccess": true,
    "noEmit": true, "skipLibCheck": true,
    "jsx": "react", "jsxFactory": "h", "jsxFragmentFactory": "Fragment"
  },
  "include": [".claude-plugin/types", "hooks", "types", "tests"]
}
```

`.gitignore`:
```
node_modules/
scripts/raw/
.claude-plugin/types/
```

`LICENSE`: MIT, `Copyright (c) 2026 Yonatan Karp-Rudin`, with an extra paragraph: "Pokémon names, sprites and Pokédex text are trademarks and copyrights of Nintendo, Game Freak and The Pokémon Company. They are not covered by this licence. This is an unofficial fan project."

`types/index.d.ts` (placeholder until Task 11):
```ts
declare module 'claude-code' {
  interface PluginState {
    'pokebuddy': { spike: string }
  }
}
export {}
```

- [ ] **Step 2: Write the spike module**

The spike answers seven questions, each a wrong guess that would cost a rewrite: is `buddy` free as a command name; does the sandbox know the local time zone; does a local import load; does `crypto.getRandomValues` exist; how a failing Bash call looks at `tool.call` (`isError`, or an exit code in the result); does work started without `await` inside `turn.complete` finish after the hook returns; does `prompt.submit` fire for a slash command.

`hooks/spike.ts`:
```ts
export const SPIKE = 'local import works'
```

`hooks/register.tsx`:
```tsx
import type { Register } from 'claude-code'
import { SPIKE } from './spike'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'buddy', description: 'spike' })
    return next(e)
  })
  on('prompt.submit', async ($, e, next) => {
    const seen = ((await $.store.get('spike.prompts')) as string[] | undefined) ?? []
    await $.store.set('spike.prompts', [...seen, `${JSON.stringify(e.origin)} ${e.text.slice(0, 20)}`])
    return next(e)
  })
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.tool === 'Bash') await $.store.set('spike.bash', JSON.stringify(ran).slice(0, 600))
    return ran
  })
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    void $.clock.sleep(2000).then(() => $.store.set('spike.late', 'timer work finished'))
    void $.model.complete({ model: 'haiku', prompt: 'Say hi in two words.', maxTokens: 10 })
      .then(m => $.store.set('spike.model', m.isAnswered ? `answered: ${m.text}` : `not answered: ${m.reason}`))
    return r
  })
  on('command.run', { command: 'buddy' }, async $ => {
    const tz = (() => {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch (err) { return `no Intl: ${String(err)}` }
    })()
    let proc = 'n/a'
    try {
      const r = await $.process.run(['date', '+%H %Y-%m-%d %z'])
      proc = r.stdout.trim()
    } catch (err) { proc = `process refused: ${String(err)}` }
    let rand = 'no crypto.getRandomValues'
    try { rand = `getRandomValues ok ${crypto.getRandomValues(new Uint32Array(1))[0]! >= 0}` } catch {}
    const stored = await Promise.all(['spike.prompts', 'spike.bash', 'spike.late', 'spike.model'].map(async k => `${k}=${JSON.stringify(await $.store.get(k))}`))
    return { text: [`${SPIKE}`, `tz=${tz} getHours=${new Date().getHours()} utc=${new Date().getUTCHours()} date=${proc}`, rand, ...stored].join('\n') }
  })
}
```

- [ ] **Step 3: Lay the API types for tsc**

A `claude -p` or `--plugin-dir` run outside hot reload does not lay types, so copy them by hand (the folder is gitignored). The source is the `types/claude-code.d.ts` file the plugin-authoring skill names when it loads (its path changes per Claude Code process; ask the controller for it):
```bash
mkdir -p .claude-plugin/types/claude-code
cp <path from the skill>/types/claude-code.d.ts .claude-plugin/types/claude-code/index.d.ts
```
Re-copy after a Claude Code update.

- [ ] **Step 4: Validate**

Run: `claude plugin validate ~/Projects/_private_projects/claude-pokebuddy`
Expected: no refusals; it lists `session.start`, `command.run` and the `buddy` command.

- [ ] **Step 5: Run the spike headless**

Run, from a scratch directory:
```bash
claude -p --plugin-dir ~/Projects/_private_projects/claude-pokebuddy "Run the bash command: false. Then reply ok."
sleep 5
claude -p --plugin-dir ~/Projects/_private_projects/claude-pokebuddy "/buddy"
```
Expected: the second run prints `local import works`, the time line, the crypto line and the four stored values. Read them as:
- `spike.bash`: the failing call's result. If it carries `isError: true`, the plan's `isError` reading stands. If failure shows only as an exit code field (for example `result.exitCode` or `result.returnCodeInterpretation`), record the field name; Task 11's `tool.call` hook must read success from it.
- `spike.late` and `spike.model`: if either is missing, unawaited work dies with the hook. Then Task 11 must start speech, judge and evolution finishing from `$.clock.after(0, ...)` timers instead of bare promises; record that.
- `spike.prompts`: whether the `/buddy` run shows up, and with which `origin`. Task 11 skips prompts that start with `/` or have `origin.kind === 'plugin'` either way.
- No `getRandomValues`: Task 11 seeds from `crypto.subtle.digest('SHA-256', utf8(String(await $.clock.now()) + Math.random()))` instead.

If the output says the command is refused or not found because `buddy` is a built-in name, rerun Steps 2, 4 and 5 with `pokebuddy` in place of `buddy` and use that name from here on.

- [ ] **Step 6: Record the results in config**

`hooks/config.ts`, filling the values from Step 5 (`LOCALTIME_MODE` is `'intl'` when `getHours` matches the hour `date` printed; `'process'` when it does not, meaning the sandbox runs on UTC while the machine does not). Add the spike's other findings as constants or comments in the place each later task reads them (`BASH_FAILURE_FIELD`, `UNAWAITED_WORK_SURVIVES`):
```ts
export const COMMAND = 'buddy'
export const LOCALTIME_MODE: 'intl' | 'process' = 'intl'
export const UNAWAITED_WORK_SURVIVES = true
export const SPEECH_TIMEOUT_MS = 4000
export const JUDGE_TIMEOUT_MS = 15000
export const FLASH_MS = 6000
export const EVOLVE_MS = 4000
export const COMPACT_MIN_COLUMNS = 60
export const PENDING_LOG_MAX = 200
```

- [ ] **Step 7: Remove the spike and commit**

Delete `hooks/spike.ts`; reduce `hooks/register.tsx` to:
```tsx
import type { Register } from 'claude-code'

export const register: Register = () => {}
```
Run: `claude plugin validate ~/Projects/_private_projects/claude-pokebuddy` (expected clean), then:
```bash
git add -A
git commit -m "chore: scaffold mod and record API spike results"
```
Put the spike's output in the commit body.

---

### Task 2: Shared pure utilities (codec, rng, data types)

**Files:**
- Create: `hooks/codec.ts`, `hooks/rng.ts`, `hooks/data/types.ts`
- Test: `tests/codec.test.ts`, `tests/rng.test.ts`

**Interfaces:**
- Produces:
  - `base64Encode(bytes: Uint8Array): string`, `base64Decode(s: string): Uint8Array`
  - `utf8(s: string): Uint8Array`, `fromUtf8(b: Uint8Array): string`
  - `fnv1a(s: string): string` (8 hex chars)
  - `sfc32(seed: readonly number[]): () => number` (uniform in [0, 1))
  - Types in `hooks/data/types.ts` (below), used by every later task.

- [ ] **Step 1: Write `hooks/data/types.ts`**

```ts
export type PokemonType =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice' | 'fighting' | 'poison'
  | 'ground' | 'flying' | 'psychic' | 'bug' | 'rock' | 'ghost' | 'dragon' | 'steel' | 'fairy' | 'dark'
export type Growth = 'fast' | 'medium-fast' | 'medium-slow' | 'slow'
export type Stone = 'moon-stone' | 'fire-stone' | 'water-stone' | 'thunder-stone' | 'leaf-stone'
export const STONES: readonly Stone[] = ['moon-stone', 'fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone']
export type Evolution =
  | { kind: 'level'; to: number; level: number }
  | { kind: 'stone'; to: number; stone: Stone }
  | { kind: 'trade'; to: number }
/** 4 bits per pixel, row-major, base64. Index 0 is transparent. */
export type Sprite = { w: number; h: number; px: string; palette: readonly string[]; shiny: readonly string[] }
export type Species = {
  id: number
  name: string
  types: readonly PokemonType[]
  /** decimetres, as PokeAPI */
  height: number
  /** hectograms, as PokeAPI */
  weight: number
  dex: string
  growth: Growth
  evolvesFrom: number | null
  evolutions: readonly Evolution[]
  sprite: Sprite
}
```

- [ ] **Step 2: Write the failing tests**

`tests/codec.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import { base64Decode, base64Encode, fnv1a, fromUtf8, utf8 } from '../hooks/codec'

describe('codec', () => {
  test('base64 round-trips every byte value', () => {
    const bytes = new Uint8Array(256).map((_, i) => i)
    expect(Array.from(base64Decode(base64Encode(bytes)))).toEqual(Array.from(bytes))
  })
  test('base64 matches the RFC 4648 vectors', () => {
    expect(base64Encode(utf8('foobar'))).toBe('Zm9vYmFy')
    expect(base64Encode(utf8('fooba'))).toBe('Zm9vYmE=')
    expect(base64Encode(utf8('foob'))).toBe('Zm9vYg==')
    expect(fromUtf8(base64Decode('Zm9vYg=='))).toBe('foob')
  })
  test('utf8 keeps non-ASCII names', () => {
    expect(fromUtf8(utf8('Nidoran♀ é'))).toBe('Nidoran♀ é')
  })
  test('fnv1a is stable and 8 hex chars', () => {
    expect(fnv1a('')).toBe('811c9dc5')
    expect(fnv1a('a')).toBe('e40c292c')
  })
})
```

`tests/rng.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import { sfc32 } from '../hooks/rng'

describe('sfc32', () => {
  test('same seed, same sequence', () => {
    const a = sfc32([1, 2, 3, 4])
    const b = sfc32([1, 2, 3, 4])
    for (let i = 0; i < 10; i++) expect(a()).toBe(b())
  })
  test('values stay in [0, 1) and average near 0.5', () => {
    const r = sfc32([9, 8, 7, 6])
    let sum = 0
    for (let i = 0; i < 10000; i++) {
      const v = r()
      expect(v >= 0 && v < 1).toBe(true)
      sum += v
    }
    expect(Math.abs(sum / 10000 - 0.5) < 0.02).toBe(true)
  })
})
```

- [ ] **Step 3: Run to see them fail**

Run: `claude plugin test ~/Projects/_private_projects/claude-pokebuddy`
Expected: FAIL, modules `../hooks/codec` and `../hooks/rng` not found.

- [ ] **Step 4: Implement**

`hooks/codec.ts`:
```ts
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const LOOKUP = new Map([...ALPHABET].map((c, i) => [c, i]))

export function base64Encode(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!, b = bytes[i + 1], c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!
    out += b === undefined ? '=' : ALPHABET[(n >> 6) & 63]!
    out += c === undefined ? '=' : ALPHABET[n & 63]!
  }
  return out
}

export function base64Decode(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '')
  const out: number[] = []
  let buf = 0, bits = 0
  for (const ch of clean) {
    const v = LOOKUP.get(ch)
    if (v === undefined) throw new Error(`invalid base64 character: ${ch}`)
    buf = (buf << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buf >> bits) & 255)
    }
  }
  return new Uint8Array(out)
}

export const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)
export const fromUtf8 = (b: Uint8Array): string => new TextDecoder().decode(b)

export function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (const byte of utf8(s)) {
    h ^= byte
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
```

`hooks/rng.ts`:
```ts
export function sfc32(seed: readonly number[]): () => number {
  let [a, b, c, d] = [seed[0] ?? 0, seed[1] ?? 0, seed[2] ?? 0, seed[3] ?? 0].map(n => n >>> 0) as [number, number, number, number]
  const next = () => {
    const t = (((a + b) >>> 0) + d) >>> 0
    d = (d + 1) >>> 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) >>> 0
    c = (c << 21) | (c >>> 11)
    c = (c + t) >>> 0
    return t / 4294967296
  }
  for (let i = 0; i < 12; i++) next()
  return next
}
```

- [ ] **Step 5: Run to see them pass, then type-check**

Run: `claude plugin test ~/Projects/_private_projects/claude-pokebuddy` (expected PASS) and `npx -y -p typescript@5.6.3 tsc -p ~/Projects/_private_projects/claude-pokebuddy` (expected no errors).

- [ ] **Step 6: Commit**

```bash
git add hooks/codec.ts hooks/rng.ts hooks/data/types.ts tests/codec.test.ts tests/rng.test.ts
git commit -m "feat: codec, PRNG and species data types"
```

---

### Task 3: Build pipeline (fetch and bake)

**Files:**
- Create: `package.json`, `tsconfig.scripts.json`, `scripts/fetch.ts`, `scripts/bake.ts`, `scripts/pack.ts`, `scripts/gen1.ts`
- Test: `scripts/pack.spec.ts`, `scripts/gen1.spec.ts`
- Generates: `hooks/data/pokedex.generated.ts`, `scripts/golden/*.txt`

**Interfaces:**
- Consumes: `Species`, `Sprite`, `Evolution`, `Growth`, `Stone` from `hooks/data/types.ts`; `base64Encode` from `hooks/codec.ts`.
- Produces: `POKEDEX: readonly Species[]` (index `id - 1`, length 151) exported from `hooks/data/pokedex.generated.ts`.

- [ ] **Step 1: package.json and scripts tsconfig**

`package.json`:
```json
{
  "name": "claude-pokebuddy-build",
  "private": true,
  "type": "module",
  "scripts": {
    "fetch": "tsx scripts/fetch.ts",
    "bake": "tsx scripts/bake.ts",
    "data": "npm run fetch && npm run bake",
    "test:scripts": "node --import tsx --test scripts/*.spec.ts",
    "check:data": "npm run bake && git diff --exit-code hooks/data/pokedex.generated.ts"
  },
  "devDependencies": {
    "@types/node": "22.10.2",
    "@types/pngjs": "6.0.5",
    "pngjs": "7.0.0",
    "tsx": "4.19.2",
    "typescript": "5.6.3"
  }
}
```

`tsconfig.scripts.json`:
```json
{
  "compilerOptions": {
    "target": "es2023", "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true, "types": ["node"],
    "allowImportingTsExtensions": true
  },
  "include": ["scripts", "hooks/data/types.ts", "hooks/codec.ts"]
}
```

Run: `npm install`

- [ ] **Step 2: Write failing tests for packing and Gen 1 filtering**

`scripts/pack.spec.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cropAndIndex, packNibbles } from './pack.ts'

test('packNibbles puts two pixels per byte, high nibble first', () => {
  assert.deepEqual(Array.from(packNibbles([1, 2, 3])), [0x12, 0x30])
})

test('cropAndIndex crops transparent borders and indexes colours, 0 transparent', () => {
  // 4x3 RGBA: one opaque red pixel at (1,1), one blue at (2,1)
  const w = 4, h = 3
  const rgba = new Uint8Array(w * h * 4)
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * w + x) * 4
    rgba.set([r, g, b, 255], i)
  }
  set(1, 1, 255, 0, 0)
  set(2, 1, 0, 0, 255)
  const out = cropAndIndex(rgba, w, h)
  assert.equal(out.w, 2)
  assert.equal(out.h, 1)
  assert.deepEqual(out.indexes, [1, 2])
  assert.deepEqual(out.palette, ['', '#ff0000', '#0000ff'])
})

test('cropAndIndex refuses more than 15 colours', () => {
  const w = 16, h = 1
  const rgba = new Uint8Array(w * h * 4)
  for (let x = 0; x < 16; x++) rgba.set([x * 10, 0, 0, 255], x * 4)
  assert.throws(() => cropAndIndex(rgba, w, h), /more than 15 colours/)
})
```

`scripts/gen1.spec.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evolutionsFrom, idFromUrl } from './gen1.ts'

const chain = {
  species: { url: 'https://pokeapi.co/api/v2/pokemon-species/172/' },
  evolution_details: [],
  evolves_to: [{
    species: { url: 'https://pokeapi.co/api/v2/pokemon-species/25/' },
    evolution_details: [{ trigger: { name: 'level-up' }, min_level: null, min_happiness: 220 }],
    evolves_to: [{
      species: { url: 'https://pokeapi.co/api/v2/pokemon-species/26/' },
      evolution_details: [{ trigger: { name: 'use-item' }, item: { name: 'thunder-stone' } }],
      evolves_to: [],
    }],
  }],
}

test('idFromUrl', () => {
  assert.equal(idFromUrl('https://pokeapi.co/api/v2/pokemon-species/25/'), 25)
})

test('Pikachu evolves by Thunder Stone; Pichu is outside Gen 1', () => {
  assert.deepEqual(evolutionsFrom(chain, 25), [{ kind: 'stone', to: 26, stone: 'thunder-stone' }])
  assert.deepEqual(evolutionsFrom(chain, 26), [])
})

test('level and trade triggers map; targets above 151 are dropped', () => {
  const c = {
    species: { url: '/pokemon-species/64/' }, evolution_details: [],
    evolves_to: [
      { species: { url: '/pokemon-species/65/' }, evolution_details: [{ trigger: { name: 'trade' } }], evolves_to: [] },
    ],
  }
  const d = {
    species: { url: '/pokemon-species/133/' }, evolution_details: [],
    evolves_to: [
      { species: { url: '/pokemon-species/196/' }, evolution_details: [{ trigger: { name: 'level-up' }, min_happiness: 160 }], evolves_to: [] },
      { species: { url: '/pokemon-species/135/' }, evolution_details: [{ trigger: { name: 'use-item' }, item: { name: 'thunder-stone' } }], evolves_to: [] },
    ],
  }
  const l = {
    species: { url: '/pokemon-species/4/' }, evolution_details: [],
    evolves_to: [{ species: { url: '/pokemon-species/5/' }, evolution_details: [{ trigger: { name: 'level-up' }, min_level: 16 }], evolves_to: [] }],
  }
  assert.deepEqual(evolutionsFrom(c, 64), [{ kind: 'trade', to: 65 }])
  assert.deepEqual(evolutionsFrom(d, 133), [{ kind: 'stone', to: 135, stone: 'thunder-stone' }])
  assert.deepEqual(evolutionsFrom(l, 4), [{ kind: 'level', to: 5, level: 16 }])
})
```

Run: `npm run test:scripts`
Expected: FAIL, `./pack.ts` and `./gen1.ts` not found.

- [ ] **Step 3: Implement pack and gen1**

`scripts/pack.ts`:
```ts
export type Indexed = { w: number; h: number; indexes: number[]; palette: string[] }

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')

export function cropAndIndex(rgba: Uint8Array, w: number, h: number): Indexed {
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgba[(y * w + x) * 4 + 3]! >= 128) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
  }
  if (maxX < 0) throw new Error('sprite is fully transparent')
  const palette = ['']
  const indexes: number[] = []
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const i = (y * w + x) * 4
    if (rgba[i + 3]! < 128) { indexes.push(0); continue }
    const c = hex(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!)
    let k = palette.indexOf(c)
    if (k < 0) {
      palette.push(c)
      k = palette.length - 1
      if (k > 15) throw new Error('sprite has more than 15 colours')
    }
    indexes.push(k)
  }
  return { w: maxX - minX + 1, h: maxY - minY + 1, indexes, palette }
}

export function packNibbles(indexes: readonly number[]): Uint8Array {
  const out = new Uint8Array(Math.ceil(indexes.length / 2))
  indexes.forEach((v, i) => {
    out[i >> 1]! |= i % 2 === 0 ? v << 4 : v
  })
  return out
}

/** Shiny palette for the same pixels: map each normal colour to the shiny sprite's colour at the same first position. */
export function shinyPalette(normal: Indexed, shinyRgba: Uint8Array, w: number, h: number, offsetX: number, offsetY: number): string[] {
  const out = normal.palette.map(() => '')
  normal.indexes.forEach((k, i) => {
    if (k === 0 || out[k] !== '') return
    const x = (i % normal.w) + offsetX, y = Math.floor(i / normal.w) + offsetY
    const j = (y * w + x) * 4
    out[k] = hex(shinyRgba[j]!, shinyRgba[j + 1]!, shinyRgba[j + 2]!)
  })
  return out
}

export function cropOffset(rgba: Uint8Array, w: number, h: number): { x: number; y: number } {
  let x0 = w, y0 = h
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgba[(y * w + x) * 4 + 3]! >= 128) { x0 = Math.min(x0, x); y0 = Math.min(y0, y) }
  }
  return { x: x0, y: y0 }
}
```

`scripts/gen1.ts`:
```ts
import type { Evolution, Stone } from '../hooks/data/types.ts'

type Detail = { trigger: { name: string }; min_level?: number | null; item?: { name: string } | null }
export type ChainLink = { species: { url: string }; evolution_details: Detail[]; evolves_to: ChainLink[] }

const STONE_NAMES = new Set(['moon-stone', 'fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone'])

export const idFromUrl = (url: string): number => Number(url.split('/').filter(Boolean).pop())

function find(link: ChainLink, id: number): ChainLink | null {
  if (idFromUrl(link.species.url) === id) return link
  for (const next of link.evolves_to) {
    const hit = find(next, id)
    if (hit) return hit
  }
  return null
}

export function evolutionsFrom(chain: ChainLink, id: number): Evolution[] {
  const link = find(chain, id)
  if (!link) return []
  const out: Evolution[] = []
  for (const next of link.evolves_to) {
    const to = idFromUrl(next.species.url)
    if (to > 151) continue
    for (const d of next.evolution_details) {
      if (d.trigger.name === 'level-up' && typeof d.min_level === 'number') out.push({ kind: 'level', to, level: d.min_level })
      else if (d.trigger.name === 'use-item' && d.item && STONE_NAMES.has(d.item.name)) out.push({ kind: 'stone', to, stone: d.item.name as Stone })
      else if (d.trigger.name === 'trade' && !d.item) out.push({ kind: 'trade', to })
      else continue
      break
    }
  }
  return out
}

export function evolvesFromId(url: string | null): number | null {
  if (!url) return null
  const id = idFromUrl(url)
  return id > 151 ? null : id
}
```

Run: `npm run test:scripts`
Expected: PASS.

- [ ] **Step 4: Write fetch**

`scripts/fetch.ts` downloads into `scripts/raw/` and skips files already present:
```ts
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'

const RAW = new URL('./raw/', import.meta.url)
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-ii/crystal/transparent'
const API = 'https://pokeapi.co/api/v2'

const exists = (p: URL) => access(p).then(() => true, () => false)

async function get(url: string, to: URL, as: 'json' | 'bytes') {
  if (await exists(to)) return
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url)
    if (res.ok) {
      const body = as === 'json' ? Buffer.from(JSON.stringify(await res.json())) : Buffer.from(await res.arrayBuffer())
      await writeFile(to, body)
      return
    }
    if (attempt === 3) throw new Error(`${res.status} for ${url}`)
    await new Promise(r => setTimeout(r, 1000 * attempt))
  }
}

await mkdir(new URL('sprites/shiny/', RAW), { recursive: true })
await mkdir(new URL('species/', RAW), { recursive: true })
await mkdir(new URL('pokemon/', RAW), { recursive: true })
await mkdir(new URL('chains/', RAW), { recursive: true })

for (let id = 1; id <= 151; id++) {
  await get(`${SPRITES}/${id}.png`, new URL(`sprites/${id}.png`, RAW), 'bytes')
  await get(`${SPRITES}/shiny/${id}.png`, new URL(`sprites/shiny/${id}.png`, RAW), 'bytes')
  await get(`${API}/pokemon-species/${id}/`, new URL(`species/${id}.json`, RAW), 'json')
  await get(`${API}/pokemon/${id}/`, new URL(`pokemon/${id}.json`, RAW), 'json')
  const species = JSON.parse(await readFile(new URL(`species/${id}.json`, RAW), 'utf8'))
  const chainId = Number(String(species.evolution_chain.url).split('/').filter(Boolean).pop())
  await get(species.evolution_chain.url, new URL(`chains/${chainId}.json`, RAW), 'json')
  process.stdout.write(`\r${id}/151`)
}
process.stdout.write('\n')
```

Run: `npm run fetch`
Expected: `151/151`; `ls scripts/raw/sprites | wc -l` shows 152 (151 PNGs plus `shiny/`). If the Crystal `transparent` path 404s, stop and report: the sprite source must be re-decided with the user.

- [ ] **Step 5: Write bake and the golden files**

`scripts/bake.ts`:
```ts
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { PNG } from 'pngjs'
import { base64Encode } from '../hooks/codec.ts'
import type { Growth, Species } from '../hooks/data/types.ts'
import { evolutionsFrom, evolvesFromId, type ChainLink } from './gen1.ts'
import { cropAndIndex, cropOffset, packNibbles, shinyPalette } from './pack.ts'

const RAW = new URL('./raw/', import.meta.url)
const json = async (p: string) => JSON.parse(await readFile(new URL(p, RAW), 'utf8'))
const png = async (p: string) => PNG.sync.read(await readFile(new URL(p, RAW)))

const GROWTH: Record<string, Growth> = {
  fast: 'fast', medium: 'medium-fast', 'medium-slow': 'medium-slow', slow: 'slow',
}

const clean = (s: string) => s.replace(/[\f\n­]+/g, ' ').replace(/\s+/g, ' ').trim()

const out: Species[] = []
for (let id = 1; id <= 151; id++) {
  const species = await json(`species/${id}.json`)
  const pokemon = await json(`pokemon/${id}.json`)
  const chainId = Number(String(species.evolution_chain.url).split('/').filter(Boolean).pop())
  const chain: { chain: ChainLink } = await json(`chains/${chainId}.json`)
  const normal = await png(`sprites/${id}.png`)
  const shiny = await png(`sprites/shiny/${id}.png`)
  const indexed = cropAndIndex(new Uint8Array(normal.data), normal.width, normal.height)
  const off = cropOffset(new Uint8Array(normal.data), normal.width, normal.height)
  const flavour = species.flavor_text_entries.find((f: any) => f.language.name === 'en' && f.version.name === 'crystal')
    ?? species.flavor_text_entries.find((f: any) => f.language.name === 'en')
  const growth = GROWTH[species.growth_rate.name]
  if (!growth) throw new Error(`#${id}: unexpected growth rate ${species.growth_rate.name}`)
  out.push({
    id,
    name: species.names.find((n: any) => n.language.name === 'en').name.toUpperCase(),
    // Gen 1 typing: the earliest past_types entry wins (Clefairy is Normal, Magnemite is pure Electric).
    types: (pokemon.past_types?.[0]?.types ?? pokemon.types).map((t: any) => t.type.name),
    height: pokemon.height,
    weight: pokemon.weight,
    dex: clean(flavour.flavor_text),
    growth,
    evolvesFrom: evolvesFromId(species.evolves_from_species?.url ?? null),
    evolutions: evolutionsFrom(chain.chain, id),
    sprite: {
      w: indexed.w, h: indexed.h,
      px: base64Encode(packNibbles(indexed.indexes)),
      palette: indexed.palette,
      shiny: shinyPalette(indexed, new Uint8Array(shiny.data), shiny.width, shiny.height, off.x, off.y),
    },
  })
}

const body = `// Generated by scripts/bake.ts from PokeAPI data. Do not edit.\n` +
  `import type { Species } from './types'\n\n` +
  `export const POKEDEX: readonly Species[] = ${JSON.stringify(out)}\n`
await writeFile(new URL('../hooks/data/pokedex.generated.ts', import.meta.url), body)

await mkdir(new URL('./golden/', import.meta.url), { recursive: true })
for (const id of [25, 151, 130]) {
  const s = out[id - 1]!
  await writeFile(new URL(`./golden/${id}.json`, import.meta.url), JSON.stringify(s.sprite, null, 2) + '\n')
}
console.log(`baked ${out.length} species, ${(Buffer.byteLength(body) / 1024).toFixed(0)} KB`)
```

Run: `npm run bake`
Expected: `baked 151 species, NNN KB` with NNN under 300. If over 300, report the size before going on; do not change the format silently.

- [ ] **Step 6: Sanity-check the generated data with a sandbox test**

`tests/pokedex.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import { POKEDEX } from '../hooks/data/pokedex.generated'

describe('generated pokedex', () => {
  test('151 species in id order', () => {
    expect(POKEDEX.length).toBe(151)
    POKEDEX.forEach((s, i) => expect(s.id).toBe(i + 1))
  })
  test('known Gen 1 facts', () => {
    const by = (id: number) => POKEDEX[id - 1]!
    expect(by(25).name).toBe('PIKACHU')
    expect(by(25).evolvesFrom).toBe(null)
    expect(by(25).evolutions).toEqual([{ kind: 'stone', to: 26, stone: 'thunder-stone' }])
    expect(by(4).evolutions).toEqual([{ kind: 'level', to: 5, level: 16 }])
    expect(by(64).evolutions).toEqual([{ kind: 'trade', to: 65 }])
    expect(by(133).evolutions.map(e => e.to).sort()).toEqual([134, 135, 136])
    expect(by(42).evolutions).toEqual([])
    expect(by(129).growth).toBe('slow')
    expect(by(35).types).toEqual(['normal'])
    expect(by(81).types).toEqual(['electric'])
  })
  test('every sprite has a shiny palette of the same length', () => {
    for (const s of POKEDEX) expect(s.sprite.shiny.length).toBe(s.sprite.palette.length)
  })
})
```

Note the expectation `by(42).evolutions` is `[]`: Golbat to Crobat is Gen 2 and must be dropped.

Run: `claude plugin test ~/Projects/_private_projects/claude-pokebuddy`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.scripts.json scripts/*.ts scripts/golden hooks/data/pokedex.generated.ts tests/pokedex.test.ts
git commit -m "feat: bake Crystal sprites and Gen 1 species data"
```

---

### Task 4: Dex helpers, roll and EXP curves

**Files:**
- Create: `hooks/data/dex.ts`, `hooks/roll.ts`, `hooks/exp.ts`
- Test: `tests/roll.test.ts`, `tests/exp.test.ts`

**Interfaces:**
- Consumes: `POKEDEX`, `Species`, `Growth` (Task 3, 2); `sfc32` (Task 2).
- Produces:
  - `species(id: number): Species`, `findSpecies(query: string): Species | undefined` (name, case-insensitive, or `#25`/`25`)
  - `LEGENDARIES: ReadonlySet<number>`
  - `type Personality = 'cheerful' | 'grumpy' | 'sleepy' | 'brave' | 'timid' | 'sassy' | 'curious' | 'proud'`
  - `type Roll = { species: number; isShiny: boolean; personality: Personality }`
  - `rollFrom(seed: readonly number[]): Roll`, `rollWeight(s: Species): number`
  - `expForLevel(growth: Growth, level: number): number`, `levelForExp(growth: Growth, exp: number): number`, `MAX_LEVEL = 100`

- [ ] **Step 1: Write the failing tests**

`tests/exp.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import { expForLevel, levelForExp } from '../hooks/exp'

describe('growth curves', () => {
  const cases: [Parameters<typeof expForLevel>[0], number, number][] = [
    ['fast', 5, 100], ['fast', 50, 100000], ['fast', 100, 800000],
    ['medium-fast', 5, 125], ['medium-fast', 50, 125000], ['medium-fast', 100, 1000000],
    ['medium-slow', 5, 135], ['medium-slow', 50, 117360], ['medium-slow', 100, 1059860],
    ['slow', 5, 156], ['slow', 50, 156250], ['slow', 100, 1250000],
  ]
  for (const [g, lv, exp] of cases) test(`${g} level ${lv} needs ${exp}`, () => expect(expForLevel(g, lv)).toBe(exp))
  test('level 1 needs 0 and medium-slow never goes negative', () => {
    expect(expForLevel('medium-slow', 1)).toBe(0)
    expect(expForLevel('medium-slow', 2) >= 0).toBe(true)
  })
  test('levelForExp inverts expForLevel and caps at 100', () => {
    expect(levelForExp('medium-fast', 124)).toBe(4)
    expect(levelForExp('medium-fast', 125)).toBe(5)
    expect(levelForExp('slow', 99999999)).toBe(100)
  })
})
```

`tests/roll.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import { POKEDEX } from '../hooks/data/pokedex.generated'
import { findSpecies } from '../hooks/data/dex'
import { LEGENDARIES, rollFrom, rollWeight } from '../hooks/roll'
import { sfc32 } from '../hooks/rng'

describe('roll', () => {
  test('same seed, same roll', () => {
    expect(rollFrom([1, 2, 3, 4])).toEqual(rollFrom([1, 2, 3, 4]))
  })
  test('only base forms are rollable', () => {
    for (const s of POKEDEX) {
      if (s.evolvesFrom !== null) expect(rollWeight(s)).toBe(0)
    }
    expect(rollWeight(POKEDEX[24]!)).toBe(1) // Pikachu
    expect(rollWeight(POKEDEX[130]!)).toBe(0.33) // Lapras
    expect(rollWeight(POKEDEX[149]!)).toBe(0.02) // Mewtwo
  })
  test('rates over 100k seeds are within tolerance', () => {
    const gen = sfc32([42, 42, 42, 42])
    const seed = () => [0, 0, 0, 0].map(() => Math.floor(gen() * 2 ** 32))
    let legendary = 0, shiny = 0, single = 0
    const N = 100000
    for (let i = 0; i < N; i++) {
      const r = rollFrom(seed())
      const s = POKEDEX[r.species - 1]!
      expect(s.evolvesFrom).toBe(null)
      if (LEGENDARIES.has(r.species)) legendary++
      else if (s.evolutions.length === 0) single++
      if (r.isShiny) shiny++
    }
    const total = POKEDEX.reduce((a, s) => a + rollWeight(s), 0)
    const singleWeight = POKEDEX.filter(s => rollWeight(s) === 0.33).length * 0.33
    expect(Math.abs(legendary / N - 0.1 / total) < 0.002).toBe(true)
    expect(Math.abs(single / N - singleWeight / total) < 0.01).toBe(true)
    expect(Math.abs(shiny / N - 1 / 512) < 0.0008).toBe(true)
  })
  test('findSpecies by name and number', () => {
    expect(findSpecies('pikachu')?.id).toBe(25)
    expect(findSpecies('#6')?.name).toBe('CHARIZARD')
    expect(findSpecies('151')?.name).toBe('MEW')
    expect(findSpecies('agumon')).toBe(undefined)
    expect(findSpecies('152')).toBe(undefined)
  })
})
```

Run: `claude plugin test ~/Projects/_private_projects/claude-pokebuddy`
Expected: FAIL, modules not found.

- [ ] **Step 2: Implement**

`hooks/data/dex.ts`:
```ts
import { POKEDEX } from './pokedex.generated'
import type { Species } from './types'

export function species(id: number): Species {
  const s = POKEDEX[id - 1]
  if (!s) throw new Error(`no species #${id}`)
  return s
}

export function findSpecies(query: string): Species | undefined {
  const q = query.trim().replace(/^#/, '')
  if (/^\d+$/.test(q)) return POKEDEX[Number(q) - 1]
  const name = q.toUpperCase()
  return POKEDEX.find(s => s.name === name)
}
```

`hooks/exp.ts`:
```ts
import type { Growth } from './data/types'

export const MAX_LEVEL = 100

export function expForLevel(growth: Growth, level: number): number {
  if (level <= 1) return 0
  const n = level
  switch (growth) {
    case 'fast': return Math.floor((4 * n ** 3) / 5)
    case 'medium-fast': return n ** 3
    case 'medium-slow': return Math.max(0, Math.floor((6 * n ** 3) / 5 - 15 * n ** 2 + 100 * n - 140))
    case 'slow': return Math.floor((5 * n ** 3) / 4)
  }
}

export function levelForExp(growth: Growth, exp: number): number {
  let level = 1
  while (level < MAX_LEVEL && expForLevel(growth, level + 1) <= exp) level++
  return level
}
```

`hooks/roll.ts`:
```ts
import { POKEDEX } from './data/pokedex.generated'
import type { Species } from './data/types'
import { sfc32 } from './rng'

export const LEGENDARIES: ReadonlySet<number> = new Set([144, 145, 146, 150, 151])
export const PERSONALITIES = ['cheerful', 'grumpy', 'sleepy', 'brave', 'timid', 'sassy', 'curious', 'proud'] as const
export type Personality = (typeof PERSONALITIES)[number]
export type Roll = { species: number; isShiny: boolean; personality: Personality }

export function rollWeight(s: Species): number {
  if (s.evolvesFrom !== null) return 0
  if (LEGENDARIES.has(s.id)) return 0.02
  return s.evolutions.length === 0 ? 0.33 : 1
}

export function rollFrom(seed: readonly number[]): Roll {
  const rand = sfc32(seed)
  const total = POKEDEX.reduce((a, s) => a + rollWeight(s), 0)
  let pick = rand() * total
  let chosen = POKEDEX[0]!
  for (const s of POKEDEX) {
    const w = rollWeight(s)
    if (w === 0) continue
    chosen = s
    if (pick < w) break
    pick -= w
  }
  const isShiny = rand() < 1 / 512
  const personality = PERSONALITIES[Math.floor(rand() * PERSONALITIES.length)]!
  return { species: chosen.id, isShiny, personality }
}
```

- [ ] **Step 3: Run tests**

Run: `claude plugin test ~/Projects/_private_projects/claude-pokebuddy`
Expected: PASS. (If the 100k test exceeds the 5000 ms default, pass `{ timeoutMs: 30000 }` as the options argument to that `test`.)

- [ ] **Step 4: Commit**

```bash
git add hooks/data/dex.ts hooks/roll.ts hooks/exp.ts tests/roll.test.ts tests/exp.test.ts
git commit -m "feat: deterministic roll and Gen 1 growth curves"
```

---

### Task 5: Signals from tool calls

**Files:**
- Create: `hooks/signals.ts`
- Test: `tests/signals.test.ts`

**Interfaces:**
- Produces:
  - `type Signal = { kind: 'tool' } | { kind: 'config'; path: string } | { kind: 'commit' } | { kind: 'push' } | { kind: 'pr' } | { kind: 'check'; key: string; ok: boolean }`
  - `signalsFromTool(tool: string, input: Record<string, unknown>, isError: boolean): Signal[]` (always includes one `{ kind: 'tool' }` first)
  - `type Segment = { tokens: string[]; pipedOut: boolean }`, `splitCommand(command: string): Segment[]`
  - `isConfigPath(path: string): boolean`

- [ ] **Step 1: Write the failing tests**

`tests/signals.test.ts`:
```ts
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
```

Run: `claude plugin test ~/Projects/_private_projects/claude-pokebuddy`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement**

`hooks/signals.ts`:
```ts
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
```

Note: `CHECK_WORDS` is tested against the whole segment, so `pytest -q` and a bare `tsc` count through the runner's own name, while `npm install` does not.

- [ ] **Step 3: Run tests**

Run: `claude plugin test ~/Projects/_private_projects/claude-pokebuddy`
Expected: PASS. If a case fails, fix the implementation, not the test; the cases are the spec.

- [ ] **Step 4: Commit**

```bash
git add hooks/signals.ts tests/signals.test.ts
git commit -m "feat: detect commits, pushes, checks and config edits"
```

---

### Task 6: Per-turn tally and evolution rules

**Files:**
- Create: `hooks/tally.ts`, `hooks/evolution.ts`
- Test: `tests/tally.test.ts`, `tests/evolution.test.ts`

**Interfaces:**
- Consumes: `Signal` (Task 5); `species`, `Stone`, `Evolution` (Tasks 2 to 4).
- Produces:
  - `type Source = 'prompt' | 'tool' | 'active' | 'config' | 'commit' | 'push' | 'green' | 'judge' | 'feed'`
  - `EXP: Readonly<Record<Exclude<Source, 'judge' | 'feed'>, number>>`, `TOOL_CAP = 40`
  - `type Tally = { prompts: number; signals: Signal[]; activeWindows: number }`
  - `emptyTally(): Tally`
  - `type Checks = Readonly<Record<string, boolean>>` (key to last-failed)
  - `scoreTally(t: Tally, checks: Checks): { bySource: Partial<Record<Source, number>>; total: number; checks: Checks; greens: number; commits: number; pushes: number; configEdits: number }`
  - `type Counters = { greens: number; commits: number; configEdits: number; feedRun: number }`
  - `stonesEarned(before: Counters, after: Counters): Stone[]`
  - `levelEvolution(id: number, level: number, cancelledAtLevel: number | null): number | null`
  - `stoneEvolution(id: number, stone: Stone): number | null`
  - `tradeEvolution(id: number, level: number): number | null`, `TRADE_LEVEL = 36`

- [ ] **Step 1: Write the failing tests**

`tests/tally.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import type { Signal } from '../hooks/signals'
import { emptyTally, scoreTally } from '../hooks/tally'

const tool: Signal = { kind: 'tool' }

describe('scoreTally', () => {
  test('prompt, tools and active windows', () => {
    const t = { ...emptyTally(), prompts: 1, activeWindows: 2, signals: [tool, tool, tool] }
    const r = scoreTally(t, {})
    expect(r.bySource).toEqual({ prompt: 10, tool: 6, active: 10 })
    expect(r.total).toBe(26)
  })
  test('tool EXP is capped at 40 per turn', () => {
    const t = { ...emptyTally(), signals: Array.from({ length: 300 }, () => tool) }
    expect(scoreTally(t, {}).bySource.tool).toBe(40)
  })
  test('config edits count once per file per turn', () => {
    const t = { ...emptyTally(), signals: [
      { kind: 'config', path: '/a/CLAUDE.md' }, { kind: 'config', path: '/a/CLAUDE.md' }, { kind: 'config', path: '/b/CLAUDE.md' },
    ] as Signal[] }
    const r = scoreTally(t, {})
    expect(r.bySource.config).toBe(50)
    expect(r.configEdits).toBe(2)
  })
  test('green after red needs a failure of the same key first, across turns', () => {
    const fail = { ...emptyTally(), signals: [{ kind: 'check', key: 'npm test', ok: false }] as Signal[] }
    const r1 = scoreTally(fail, {})
    expect(r1.greens).toBe(0)
    expect(r1.checks).toEqual({ 'npm test': true })
    const pass = { ...emptyTally(), signals: [{ kind: 'check', key: 'npm test', ok: true }, { kind: 'check', key: 'npm test', ok: true }] as Signal[] }
    const r2 = scoreTally(pass, r1.checks)
    expect(r2.greens).toBe(1)
    expect(r2.bySource.green).toBe(40)
    expect(r2.checks).toEqual({})
  })
  test('a pass with no prior failure earns nothing', () => {
    const pass = { ...emptyTally(), signals: [{ kind: 'check', key: 'npm test', ok: true }] as Signal[] }
    expect(scoreTally(pass, {}).greens).toBe(0)
  })
  test('commits, pushes and PRs', () => {
    const t = { ...emptyTally(), signals: [{ kind: 'commit' }, { kind: 'push' }, { kind: 'pr' }] as Signal[] }
    const r = scoreTally(t, {})
    expect(r.bySource).toEqual({ commit: 30, push: 100 })
    expect(r.commits).toBe(1)
    expect(r.pushes).toBe(2)
  })
})
```

`tests/evolution.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import { levelEvolution, stoneEvolution, stonesEarned, tradeEvolution } from '../hooks/evolution'

const zero = { greens: 0, commits: 0, configEdits: 0, feedRun: 0 }

describe('evolution', () => {
  test('Charmander evolves at 16, not 15', () => {
    expect(levelEvolution(4, 15, null)).toBe(null)
    expect(levelEvolution(4, 16, null)).toBe(5)
    expect(levelEvolution(4, 30, null)).toBe(5)
  })
  test('a cancel holds only for the level it happened at', () => {
    expect(levelEvolution(4, 16, 16)).toBe(null)
    expect(levelEvolution(4, 17, 16)).toBe(5)
  })
  test('stones', () => {
    expect(stoneEvolution(25, 'thunder-stone')).toBe(26)
    expect(stoneEvolution(25, 'fire-stone')).toBe(null)
    expect(stoneEvolution(133, 'water-stone')).toBe(134)
    expect(stoneEvolution(133, 'fire-stone')).toBe(136)
    expect(stoneEvolution(4, 'fire-stone')).toBe(null)
  })
  test('trade needs level 36', () => {
    expect(tradeEvolution(64, 35)).toBe(null)
    expect(tradeEvolution(64, 36)).toBe(65)
    expect(tradeEvolution(4, 50)).toBe(null)
  })
  test('stones from milestone thresholds, repeating', () => {
    expect(stonesEarned(zero, { ...zero, greens: 9 })).toEqual([])
    expect(stonesEarned({ ...zero, greens: 9 }, { ...zero, greens: 10 })).toEqual(['thunder-stone'])
    expect(stonesEarned(zero, { ...zero, commits: 21 })).toEqual(['fire-stone', 'fire-stone'])
    expect(stonesEarned({ ...zero, feedRun: 6 }, { ...zero, feedRun: 7 })).toEqual(['leaf-stone'])
    expect(stonesEarned({ ...zero, configEdits: 19 }, { ...zero, configEdits: 20 })).toEqual(['water-stone'])
  })
})
```

Run: `claude plugin test ~/Projects/_private_projects/claude-pokebuddy`
Expected: FAIL, modules not found.

- [ ] **Step 2: Implement**

`hooks/tally.ts`:
```ts
import type { Signal } from './signals'

export type Source = 'prompt' | 'tool' | 'active' | 'config' | 'commit' | 'push' | 'green' | 'judge' | 'feed'
export const EXP = { prompt: 10, tool: 2, active: 5, config: 25, commit: 30, push: 50, green: 40 } as const
export const TOOL_CAP = 40

export type Tally = { prompts: number; signals: Signal[]; activeWindows: number }
export const emptyTally = (): Tally => ({ prompts: 0, signals: [], activeWindows: 0 })
export type Checks = Readonly<Record<string, boolean>>

export function scoreTally(t: Tally, checks: Checks) {
  const by: Partial<Record<Source, number>> = {}
  const add = (s: Source, n: number) => { if (n > 0) by[s] = (by[s] ?? 0) + n }
  const nextChecks: Record<string, boolean> = { ...checks }
  const configFiles = new Set<string>()
  let tools = 0, greens = 0, commits = 0, pushes = 0
  for (const s of t.signals) {
    if (s.kind === 'tool') tools++
    else if (s.kind === 'config') configFiles.add(s.path)
    else if (s.kind === 'commit') commits++
    else if (s.kind === 'push' || s.kind === 'pr') pushes++
    else if (s.kind === 'check') {
      if (!s.ok) nextChecks[s.key] = true
      else if (nextChecks[s.key]) { greens++; delete nextChecks[s.key] }
    }
  }
  add('prompt', t.prompts * EXP.prompt)
  add('tool', Math.min(TOOL_CAP, tools * EXP.tool))
  add('active', t.activeWindows * EXP.active)
  add('config', configFiles.size * EXP.config)
  add('commit', commits * EXP.commit)
  add('push', pushes * EXP.push)
  add('green', greens * EXP.green)
  const total = Object.values(by).reduce((a, n) => a + (n ?? 0), 0)
  return { bySource: by, total, checks: nextChecks as Checks, greens, commits, pushes, configEdits: configFiles.size }
}
```

`hooks/evolution.ts`:
```ts
import { species } from './data/dex'
import type { Stone } from './data/types'

export const TRADE_LEVEL = 36
export type Counters = { greens: number; commits: number; configEdits: number; feedRun: number }

const EVERY: [keyof Counters, number, Stone][] = [
  ['greens', 10, 'thunder-stone'],
  ['commits', 10, 'fire-stone'],
  ['configEdits', 10, 'water-stone'],
  ['feedRun', 7, 'leaf-stone'],
]

export function stonesEarned(before: Counters, after: Counters): Stone[] {
  const out: Stone[] = []
  for (const [key, n, stone] of EVERY) {
    const earned = Math.floor(after[key] / n) - Math.floor(before[key] / n)
    for (let i = 0; i < earned; i++) out.push(stone)
  }
  return out
}

export function levelEvolution(id: number, level: number, cancelledAtLevel: number | null): number | null {
  if (cancelledAtLevel === level) return null
  const evo = species(id).evolutions.find(e => e.kind === 'level' && level >= e.level)
  return evo?.to ?? null
}

export function stoneEvolution(id: number, stone: Stone): number | null {
  const evo = species(id).evolutions.find(e => e.kind === 'stone' && e.stone === stone)
  return evo?.to ?? null
}

export function tradeEvolution(id: number, level: number): number | null {
  if (level < TRADE_LEVEL) return null
  return species(id).evolutions.find(e => e.kind === 'trade')?.to ?? null
}
```

Note: `feedRun` resets to 1 when a day is missed, so `stonesEarned` on a reset compares a smaller `after` and yields a negative `earned`, which the loop treats as zero. That is correct.

- [ ] **Step 3: Run tests**

Run: `claude plugin test ~/Projects/_private_projects/claude-pokebuddy`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add hooks/tally.ts hooks/evolution.ts tests/tally.test.ts tests/evolution.test.ts
git commit -m "feat: per-turn EXP tally and evolution rules"
```

---

### Task 7: Save state, game transitions and local time

**Files:**
- Create: `hooks/state.ts`, `hooks/game.ts`, `hooks/localtime.ts`
- Test: `tests/state.test.ts`, `tests/game.test.ts`

**Interfaces:**
- Consumes: Tasks 2 to 6.
- Produces:
  - `SAVE_VERSION = 1`, `type Save` (below), `freshSave(seed: number[]): Save`
  - `parseSave(raw: unknown): { kind: 'ok'; save: Save } | { kind: 'empty' } | { kind: 'future'; version: number } | { kind: 'corrupt' }`
  - `exportBlob(save: Save): string`, `importBlob(blob: string): { kind: 'ok'; save: Save } | { kind: 'bad'; reason: string }`
  - `type GameEvent = { kind: 'level'; level: number } | { kind: 'evolving'; from: number; to: number } | { kind: 'evolved'; from: number; to: number } | { kind: 'stone'; stone: Stone } | { kind: 'max' }`
  - `applyExp(save: Save, gained: Partial<Record<Source, number>>): { save: Save; events: GameEvent[] }`
  - `applyTurn(save: Save, scored: ReturnType<typeof scoreTally>, local: LocalTime): { save: Save; events: GameEvent[] }`
  - `finishEvolution(save: Save): { save: Save; events: GameEvent[] }`, `cancelEvolution(save: Save): { save: Save; cancelled: boolean }`
  - `feed(save: Save, local: LocalTime): { save: Save; events: GameEvent[]; fed: boolean; gained: number }`
  - `useStone(save: Save, stone: Stone): { save: Save; events: GameEvent[]; error?: string }`
  - `type LocalTime = { date: string; hour: number }` (date `YYYY-MM-DD`), `readOffset($: EngineInterface): Promise<number | null>`, `localTime(nowMs: number, offsetMin: number | null): LocalTime`, `previousDate(date: string): string`

`Save`:
```ts
export type Save = {
  version: 1
  seed: number[]
  species: number
  isShiny: boolean
  personality: Personality
  nickname: string | null
  level: number
  exp: number
  lifetimeExp: number
  expBySource: Partial<Record<Source, number>>
  bag: Partial<Record<Stone, number>>
  counters: Counters
  checks: Record<string, boolean>
  lastMoonDate: string | null
  feed: { lastDate: string | null }
  pendingLog: string[]
  speechOn: boolean
  view: 'compact' | 'full'
  evolution: { to: number } | null
  cancelledAtLevel: number | null
}
```

- [ ] **Step 1: Write the failing tests**

`tests/state.test.ts`:
```ts
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
```

`tests/game.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import { species } from '../hooks/data/dex'
import { expForLevel } from '../hooks/exp'
import { applyExp, applyTurn, cancelEvolution, feed, finishEvolution, useStone } from '../hooks/game'
import { localTime, previousDate } from '../hooks/localtime'
import { freshSave, type Save } from '../hooks/state'
import { emptyTally, scoreTally } from '../hooks/tally'

const as = (id: number, level: number, extra: Partial<Save> = {}): Save => {
  const s = freshSave([1, 2, 3, 4])
  return { ...s, species: id, level, exp: expForLevel(species(id).growth, level), ...extra }
}
const day = { date: '2026-10-11', hour: 14 }

describe('game', () => {
  test('EXP crossing a level emits a level event, and an evolution level starts evolving', () => {
    const s = as(4, 15) // Charmander, medium-slow
    const r = applyExp(s, { commit: expForLevel(species(4).growth, 16) - s.exp })
    expect(r.save.level).toBe(16)
    expect(r.events).toEqual([{ kind: 'level', level: 16 }, { kind: 'evolving', from: 4, to: 5 }])
    expect(r.save.evolution).toEqual({ to: 5 })
    const done = finishEvolution(r.save)
    expect(done.save.species).toBe(5)
    expect(done.events).toEqual([{ kind: 'evolved', from: 4, to: 5 }])
  })
  test('cancel holds for this level and retries at the next', () => {
    const r = applyExp(as(4, 15), { commit: 10000 })
    const c = cancelEvolution(r.save)
    expect(c.cancelled).toBe(true)
    expect(c.save.evolution).toBe(null)
    expect(c.save.cancelledAtLevel).toBe(c.save.level)
    const again = applyExp(c.save, { commit: expForLevel(species(4).growth, c.save.level + 1) - c.save.exp })
    expect(again.events.some(e => e.kind === 'evolving')).toBe(true)
  })
  test('level 100 caps; lifetime keeps growing', () => {
    const s = as(4, 100)
    const r = applyExp(s, { tool: 50 })
    expect(r.save.level).toBe(100)
    expect(r.save.exp).toBe(s.exp)
    expect(r.save.lifetimeExp).toBe(s.lifetimeExp + 50)
  })
  test('expBySource accumulates', () => {
    const r = applyExp(as(4, 10), { tool: 6, prompt: 10 })
    expect(r.save.expBySource.tool).toBe(6)
    expect(r.save.expBySource.prompt).toBe(10)
  })
  test('ten commits across turns earns a Fire Stone', () => {
    let s = as(25, 10, { counters: { greens: 0, commits: 9, configEdits: 0, feedRun: 0 } })
    const r = applyTurn(s, scoreTally({ ...emptyTally(), signals: [{ kind: 'commit' }] }, {}), day)
    expect(r.events).toContainEqual({ kind: 'stone', stone: 'fire-stone' })
    expect(r.save.bag['fire-stone']).toBe(1)
  })
  test('Moon Stone once per night between 0 and 4', () => {
    const night = { date: '2026-10-12', hour: 2 }
    const r1 = applyTurn(as(35, 10), scoreTally(emptyTally(), {}), night)
    expect(r1.save.bag['moon-stone']).toBe(1)
    const r2 = applyTurn(r1.save, scoreTally(emptyTally(), {}), night)
    expect(r2.save.bag['moon-stone']).toBe(1)
  })
  test('trade evolution on a push at 36+', () => {
    const r = applyTurn(as(64, 36), scoreTally({ ...emptyTally(), signals: [{ kind: 'push' }] }, {}), day)
    expect(r.save.species).toBe(65)
    expect(r.events).toContainEqual({ kind: 'evolved', from: 64, to: 65 })
  })
  test('feed once a day; streak and Leaf Stone', () => {
    let s = as(1, 10)
    const f1 = feed(s, day)
    expect(f1.fed).toBe(true)
    expect(f1.save.level).toBe(11)
    expect(feed(f1.save, day).fed).toBe(false)
    let cur = f1.save
    let date = day.date
    for (let i = 0; i < 6; i++) {
      date = nextDate(date)
      cur = feed(cur, { date, hour: 9 }).save
    }
    expect(cur.counters.feedRun).toBe(7)
    expect(cur.bag['leaf-stone']).toBe(1)
    const skipped = feed(cur, { date: nextDate(nextDate(date)), hour: 9 })
    expect(skipped.save.counters.feedRun).toBe(1)
  })
  test('useStone evolves when allowed and explains when not', () => {
    const s = as(133, 20, { bag: { 'fire-stone': 1 } })
    const ok = useStone(s, 'fire-stone')
    expect(ok.save.species).toBe(136)
    expect(ok.save.bag['fire-stone']).toBe(0)
    expect(useStone(s, 'water-stone').error).toBe('You have no WATER STONE.')
    expect(useStone(as(4, 20, { bag: { 'fire-stone': 1 } }), 'fire-stone').error).toBe('CHARMANDER cannot use a FIRE STONE.')
  })
  test('previousDate crosses months and years', () => {
    expect(previousDate('2026-03-01')).toBe('2026-02-28')
    expect(previousDate('2026-01-01')).toBe('2025-12-31')
  })
  test('localTime with an offset', () => {
    const t = Date.UTC(2026, 9, 11, 23, 30)
    expect(localTime(t, 120)).toEqual({ date: '2026-10-12', hour: 1 })
    expect(localTime(t, -300)).toEqual({ date: '2026-10-11', hour: 18 })
  })
})

function nextDate(d: string): string {
  const [y, m, dd] = d.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10)
}
```

Run: `claude plugin test ~/Projects/_private_projects/claude-pokebuddy`
Expected: FAIL, modules not found.

- [ ] **Step 2: Implement `hooks/localtime.ts`**

The offset is read once per session (in `session.start`, Task 11), never per turn.

```ts
import type { EngineInterface } from 'claude-code'
import { LOCALTIME_MODE } from './config'

export type LocalTime = { date: string; hour: number }

const pad = (n: number) => String(n).padStart(2, '0')

/** Minutes east of UTC, or null to use the sandbox's own local time. */
export async function readOffset($: EngineInterface): Promise<number | null> {
  if (LOCALTIME_MODE !== 'process') return null
  try {
    const z = (await $.process.run(['date', '+%z'])).stdout.trim()
    const m = z.match(/^([+-])(\d{2})(\d{2})$/)
    if (!m) return null
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
  } catch {
    return null
  }
}

export function localTime(nowMs: number, offsetMin: number | null): LocalTime {
  if (offsetMin === null) {
    const d = new Date(nowMs)
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, hour: d.getHours() }
  }
  const d = new Date(nowMs + offsetMin * 60000)
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() }
}

export function previousDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}
```

- [ ] **Step 3: Implement `hooks/state.ts`**

```ts
import { base64Decode, base64Encode, fnv1a, fromUtf8, utf8 } from './codec'
import type { Stone } from './data/types'
import type { Counters } from './evolution'
import { expForLevel } from './exp'
import { species } from './data/dex'
import { PERSONALITIES, rollFrom, type Personality } from './roll'
import type { Source } from './tally'

export const SAVE_VERSION = 1
export const START_LEVEL = 5

export type Save = {
  version: 1
  seed: number[]
  species: number
  isShiny: boolean
  personality: Personality
  nickname: string | null
  level: number
  exp: number
  lifetimeExp: number
  expBySource: Partial<Record<Source, number>>
  bag: Partial<Record<Stone, number>>
  counters: Counters
  checks: Record<string, boolean>
  lastMoonDate: string | null
  feed: { lastDate: string | null }
  pendingLog: string[]
  speechOn: boolean
  view: 'compact' | 'full'
  evolution: { to: number } | null
  cancelledAtLevel: number | null
}

export function freshSave(seed: number[]): Save {
  const roll = rollFrom(seed)
  const exp = expForLevel(species(roll.species).growth, START_LEVEL)
  return {
    version: 1, seed, species: roll.species, isShiny: roll.isShiny, personality: roll.personality,
    nickname: null, level: START_LEVEL, exp, lifetimeExp: 0, expBySource: {}, bag: {},
    counters: { greens: 0, commits: 0, configEdits: 0, feedRun: 0 }, checks: {},
    lastMoonDate: null, feed: { lastDate: null }, pendingLog: [], speechOn: true, view: 'compact',
    evolution: null, cancelledAtLevel: null,
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi

export function parseSave(raw: unknown):
  | { kind: 'ok'; save: Save } | { kind: 'empty' } | { kind: 'future'; version: number } | { kind: 'corrupt' } {
  if (raw === undefined || raw === null) return { kind: 'empty' }
  if (!isObj(raw)) return { kind: 'corrupt' }
  if (typeof raw.version === 'number' && raw.version > SAVE_VERSION) return { kind: 'future', version: raw.version }
  const ok =
    raw.version === 1 &&
    Array.isArray(raw.seed) && raw.seed.length === 4 &&
    isInt(raw.species, 1, 151) && isInt(raw.level, 1, 100) &&
    typeof raw.exp === 'number' && typeof raw.lifetimeExp === 'number' &&
    typeof raw.isShiny === 'boolean' && (PERSONALITIES as readonly unknown[]).includes(raw.personality) &&
    isObj(raw.counters) && isObj(raw.bag) && isObj(raw.feed) && Array.isArray(raw.pendingLog)
  return ok ? { kind: 'ok', save: raw as unknown as Save } : { kind: 'corrupt' }
}

export function exportBlob(save: Save): string {
  const body = JSON.stringify(save)
  return base64Encode(utf8(`${fnv1a(body)}.${body}`))
}

export function importBlob(blob: string): { kind: 'ok'; save: Save } | { kind: 'bad'; reason: string } {
  let text: string
  try { text = fromUtf8(base64Decode(blob.trim())) } catch { return { kind: 'bad', reason: 'That is not a pokebuddy export.' } }
  const dot = text.indexOf('.')
  const sum = text.slice(0, dot), body = text.slice(dot + 1)
  if (dot !== 8 || fnv1a(body) !== sum) return { kind: 'bad', reason: 'The export is damaged (checksum mismatch).' }
  let parsed: unknown
  try { parsed = JSON.parse(body) } catch { return { kind: 'bad', reason: 'The export is damaged (not JSON).' } }
  const r = parseSave(parsed)
  if (r.kind === 'ok') return r
  if (r.kind === 'future') return { kind: 'bad', reason: `The export is from a newer version (save v${r.version}). Update the mod first.` }
  return { kind: 'bad', reason: 'The export does not hold a valid save.' }
}
```

- [ ] **Step 4: Implement `hooks/game.ts`**

```ts
import { species } from './data/dex'
import type { Stone } from './data/types'
import { levelEvolution, stoneEvolution, stonesEarned, tradeEvolution, type Counters } from './evolution'
import { expForLevel, levelForExp, MAX_LEVEL } from './exp'
import { previousDate, type LocalTime } from './localtime'
import type { Save } from './state'
import type { scoreTally, Source } from './tally'

export type GameEvent =
  | { kind: 'level'; level: number }
  | { kind: 'evolving'; from: number; to: number }
  | { kind: 'evolved'; from: number; to: number }
  | { kind: 'stone'; stone: Stone }
  | { kind: 'max' }

type Result = { save: Save; events: GameEvent[] }
const stoneName = (s: Stone) => s.replace('-', ' ').toUpperCase()

export function applyExp(save: Save, gained: Partial<Record<Source, number>>): Result {
  const total = Object.values(gained).reduce((a, n) => a + (n ?? 0), 0)
  const expBySource = { ...save.expBySource }
  for (const [k, n] of Object.entries(gained)) expBySource[k as Source] = (expBySource[k as Source] ?? 0) + (n ?? 0)
  const growth = species(save.species).growth
  const cap = expForLevel(growth, MAX_LEVEL)
  const exp = Math.min(cap, save.exp + total)
  const level = levelForExp(growth, exp)
  const events: GameEvent[] = []
  for (let l = save.level + 1; l <= level; l++) events.push({ kind: 'level', level: l })
  if (level === MAX_LEVEL && save.level < MAX_LEVEL) events.push({ kind: 'max' })
  let next: Save = { ...save, exp, level, lifetimeExp: save.lifetimeExp + total, expBySource }
  if (level > save.level && !next.evolution) {
    const to = levelEvolution(next.species, level, next.cancelledAtLevel)
    if (to !== null) {
      next = { ...next, evolution: { to } }
      events.push({ kind: 'evolving', from: next.species, to })
    }
  }
  return { save: next, events }
}

function evolveTo(save: Save, to: number): Result {
  const from = save.species
  return { save: { ...save, species: to, evolution: null, cancelledAtLevel: null }, events: [{ kind: 'evolved', from, to }] }
}

export function finishEvolution(save: Save): Result {
  return save.evolution ? evolveTo(save, save.evolution.to) : { save, events: [] }
}

export function cancelEvolution(save: Save): { save: Save; cancelled: boolean } {
  if (!save.evolution) return { save, cancelled: false }
  return { save: { ...save, evolution: null, cancelledAtLevel: save.level }, cancelled: true }
}

function addStones(save: Save, before: Counters): Result {
  const earned = stonesEarned(before, save.counters)
  const bag = { ...save.bag }
  for (const s of earned) bag[s] = (bag[s] ?? 0) + 1
  return { save: { ...save, bag }, events: earned.map(stone => ({ kind: 'stone' as const, stone })) }
}

export function applyTurn(save: Save, scored: ReturnType<typeof scoreTally>, local: LocalTime): Result {
  const before = save.counters
  let s: Save = {
    ...save,
    checks: { ...scored.checks },
    counters: {
      ...before,
      greens: before.greens + scored.greens,
      commits: before.commits + scored.commits,
      configEdits: before.configEdits + scored.configEdits,
    },
  }
  const events: GameEvent[] = []
  const stones = addStones(s, before)
  s = stones.save
  events.push(...stones.events)
  if (local.hour < 5 && s.lastMoonDate !== local.date) {
    s = { ...s, lastMoonDate: local.date, bag: { ...s.bag, 'moon-stone': (s.bag['moon-stone'] ?? 0) + 1 } }
    events.push({ kind: 'stone', stone: 'moon-stone' })
  }
  const exp = applyExp(s, scored.bySource)
  s = exp.save
  events.push(...exp.events)
  if (scored.pushes > 0 && !s.evolution) {
    const to = tradeEvolution(s.species, s.level)
    if (to !== null) {
      const t = evolveTo(s, to)
      s = t.save
      events.push(...t.events)
    }
  }
  return { save: s, events }
}

export function feed(save: Save, local: LocalTime): Result & { fed: boolean; gained: number } {
  if (save.feed.lastDate === local.date) return { save, events: [], fed: false, gained: 0 }
  const run = save.feed.lastDate === previousDate(local.date) ? save.counters.feedRun + 1 : 1
  const growth = species(save.species).growth
  const toNext = save.level >= MAX_LEVEL ? 0 : expForLevel(growth, save.level + 1) - save.exp
  const bonus = Math.floor(toNext * 0.1 * Math.min(run, 7))
  const before = save.counters
  let s: Save = { ...save, feed: { lastDate: local.date }, counters: { ...before, feedRun: run } }
  const stones = addStones(s, before)
  const exp = applyExp(stones.save, { feed: toNext + bonus })
  return { save: exp.save, events: [...stones.events, ...exp.events], fed: true, gained: toNext + bonus }
}

export function useStone(save: Save, stone: Stone): Result & { error?: string } {
  if (!save.bag[stone]) return { save, events: [], error: `You have no ${stoneName(stone)}.` }
  const to = stoneEvolution(save.species, stone)
  if (to === null) return { save, events: [], error: `${species(save.species).name} cannot use a ${stoneName(stone)}.` }
  const spent = { ...save, bag: { ...save.bag, [stone]: (save.bag[stone] ?? 0) - 1 } }
  return evolveTo(spent, to)
}
```

Note the feed rule: the bonus is 10% of the EXP to the next level per streak day, which the spec words as "plus 10% per streak day". With a streak of 1 the player still gets a 10% bonus; that is intended.

- [ ] **Step 5: Run tests**

Run: `claude plugin test ~/Projects/_private_projects/claude-pokebuddy`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add hooks/state.ts hooks/game.ts hooks/localtime.ts tests/state.test.ts tests/game.test.ts
git commit -m "feat: save format, game transitions, feeding and stones"
```

---

### Task 8: Sprite decoding and the band

**Files:**
- Create: `hooks/render/sprite.ts`, `hooks/render/band.tsx`
- Test: `tests/sprite.test.ts`

**Interfaces:**
- Consumes: `Sprite`, `PokemonType` (Task 2); `base64Decode` (Task 2); `Save` (Task 7); `species` (Task 4); `expForLevel` (Task 4).
- Produces:
  - `type Run = { text: string; fg?: string; bg?: string }`
  - `spriteRows(sprite: Sprite, isShiny: boolean, scale: 1 | 2): Run[][]`
  - `spriteSize(sprite: Sprite, scale: 1 | 2): { rows: number; cols: number }`
  - `pickScale(sprite: Sprite, maxRows: number, columns: number, isFlash: boolean): 1 | 2 | null`
  - `TYPE_COLOR: Record<PokemonType, string>`
  - `expBar(save: Save, width: number): string`
  - `type BandView = { save: Save; bubble: string | null; showFull: boolean; evolving: boolean; isFlash: boolean }`
  - `Band(props: { $: EngineInterface; e: <ui.render AbovePrompt input>; view: BandView }): JSX` drawn from `register.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/sprite.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import { base64Encode } from '../hooks/codec'
import { species } from '../hooks/data/dex'
import type { Sprite } from '../hooks/data/types'
import { expBar, pickScale, spriteRows, spriteSize } from '../hooks/render/sprite'
import { freshSave } from '../hooks/state'

// 2x2: top row [red, transparent], bottom row [blue, red]
const tiny: Sprite = {
  w: 2, h: 2, px: base64Encode(new Uint8Array([0x10, 0x21])),
  palette: ['', '#ff0000', '#0000ff'], shiny: ['', '#00ff00', '#0000ff'],
}

describe('sprite', () => {
  test('half-block cells: top fg, bottom bg; transparent top uses lower half block', () => {
    expect(spriteRows(tiny, false, 1)).toEqual([[
      { text: '▀', fg: '#ff0000', bg: '#0000ff' },
      { text: '▄', fg: '#ff0000' },
    ]])
  })
  test('shiny swaps the palette only', () => {
    expect(spriteRows(tiny, true, 1)[0]![0]).toEqual({ text: '▀', fg: '#00ff00', bg: '#0000ff' })
  })
  test('adjacent identical cells merge into one run', () => {
    const flat: Sprite = { w: 4, h: 2, px: base64Encode(new Uint8Array([0x11, 0x11, 0x11, 0x11])), palette: ['', '#ffffff'], shiny: ['', '#ffffff'] }
    expect(spriteRows(flat, false, 1)).toEqual([[{ text: '▀▀▀▀', fg: '#ffffff', bg: '#ffffff' }]])
  })
  test('fully transparent cells are spaces with no colour', () => {
    const empty: Sprite = { w: 1, h: 2, px: base64Encode(new Uint8Array([0x00])), palette: [''], shiny: [''] }
    expect(spriteRows(empty, false, 1)).toEqual([[{ text: ' ' }]])
  })
  test('size and scale choice', () => {
    const big = species(6).sprite
    const full = spriteSize(big, 1)
    expect(full.rows).toBe(Math.ceil(big.h / 2))
    expect(pickScale(big, 100, 200, false)).toBe(1)
    expect(pickScale(big, full.rows - 1, 200, false)).toBe(2)
    expect(pickScale(big, 100, 200, true)).toBe(2)
    expect(pickScale(big, 2, 200, false)).toBe(null)
    expect(pickScale(big, 100, 10, false)).toBe(null)
  })
  test('exp bar fills by progress through the level', () => {
    const s = freshSave([1, 2, 3, 4])
    expect(expBar(s, 10)).toBe('▱▱▱▱▱▱▱▱▱▱')
    expect(expBar({ ...s, level: 100 }, 4)).toBe('▰▰▰▰')
  })
})
```

Run: `claude plugin test ~/Projects/_private_projects/claude-pokebuddy`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement `hooks/render/sprite.ts`**

```ts
import { base64Decode } from '../codec'
import { species } from '../data/dex'
import type { PokemonType, Sprite } from '../data/types'
import { expForLevel, MAX_LEVEL } from '../exp'
import type { Save } from '../state'

export type Run = { text: string; fg?: string; bg?: string }

const decodeCache = new Map<string, number[]>()
function indexes(sprite: Sprite): number[] {
  const hit = decodeCache.get(sprite.px)
  if (hit) return hit
  const bytes = base64Decode(sprite.px)
  const out: number[] = []
  for (const b of bytes) out.push(b >> 4, b & 15)
  out.length = sprite.w * sprite.h
  decodeCache.set(sprite.px, out)
  return out
}

export function spriteSize(sprite: Sprite, scale: 1 | 2) {
  const w = Math.ceil(sprite.w / scale), h = Math.ceil(sprite.h / scale)
  return { rows: Math.ceil(h / 2), cols: w }
}

export function spriteRows(sprite: Sprite, isShiny: boolean, scale: 1 | 2): Run[][] {
  const px = indexes(sprite)
  const pal = isShiny ? sprite.shiny : sprite.palette
  const w = Math.ceil(sprite.w / scale), h = Math.ceil(sprite.h / scale)
  const at = (x: number, y: number): string => {
    if (y >= h) return ''
    const k = px[y * scale * sprite.w + x * scale] ?? 0
    return k === 0 ? '' : (pal[k] ?? '')
  }
  const rows: Run[][] = []
  for (let y = 0; y < h; y += 2) {
    const runs: Run[] = []
    for (let x = 0; x < w; x++) {
      const top = at(x, y), bottom = at(x, y + 1)
      const cell: Run = top && bottom ? { text: '▀', fg: top, bg: bottom }
        : top ? { text: '▀', fg: top }
        : bottom ? { text: '▄', fg: bottom }
        : { text: ' ' }
      const last = runs[runs.length - 1]
      if (last && last.fg === cell.fg && last.bg === cell.bg && last.text[0] === cell.text) last.text += cell.text
      else runs.push(cell)
    }
    rows.push(runs)
  }
  return rows
}

/** Rows reserved for the compact line under the sprite. */
const CHROME_ROWS = 2

export function pickScale(sprite: Sprite, maxRows: number, columns: number, isFlash: boolean): 1 | 2 | null {
  const scales: (1 | 2)[] = isFlash ? [2] : [1, 2]
  for (const scale of scales) {
    const { rows, cols } = spriteSize(sprite, scale)
    if (rows + CHROME_ROWS <= maxRows && cols <= columns) return scale
  }
  return null
}

export const TYPE_COLOR: Record<PokemonType, string> = {
  normal: '#a8a878', fire: '#f08030', water: '#6890f0', electric: '#f8d030', grass: '#78c850', ice: '#98d8d8',
  fighting: '#c03028', poison: '#a040a0', ground: '#e0c068', flying: '#a890f0', psychic: '#f85888', bug: '#a8b820',
  rock: '#b8a038', ghost: '#705898', dragon: '#7038f8', steel: '#b8b8d0', fairy: '#ee99ac', dark: '#705848',
}

export function expBar(save: Save, width: number): string {
  if (save.level >= MAX_LEVEL) return '▰'.repeat(width)
  const g = species(save.species).growth
  const lo = expForLevel(g, save.level), hi = expForLevel(g, save.level + 1)
  const filled = Math.max(0, Math.min(width, Math.floor(((save.exp - lo) / (hi - lo)) * width)))
  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}
```

- [ ] **Step 3: Run tests**

Run: `claude plugin test ~/Projects/_private_projects/claude-pokebuddy`
Expected: PASS.

- [ ] **Step 4: Implement `hooks/render/band.tsx`**

Look up the exact `ui.render` input type for `AbovePrompt` in the types file (`grep -n "AbovePrompt: {" .claude-plugin/types/claude-code/index.d.ts`) and the `Text` props (`color`, `backgroundColor`, `bold`, `dimColor`, `wrap`), and use those names. The band:

```tsx
import type { EngineInterface } from 'claude-code'
import { COMPACT_MIN_COLUMNS } from '../config'
import { species } from '../data/dex'
import type { Save } from '../state'
import { expBar, pickScale, spriteRows, TYPE_COLOR } from './sprite'

export type BandView = { save: Save; bubble: string | null; showFull: boolean; evolving: boolean; isFlash: boolean }

type Elements = ReturnType<EngineInterface['ui']['resolve']>

export function band(els: Elements, view: BandView, maxRows: number, columns: number) {
  const { Box, Text } = els
  const { save } = view
  const sp = species(view.evolving && save.evolution ? save.evolution.to : save.species)
  const name = save.nickname ?? sp.name
  const typeColor = TYPE_COLOR[sp.types[0]!]
  const line = (
    <Box key="line" flexDirection="row">
      <Text color={typeColor}>◓ </Text>
      <Text bold>{view.evolving ? `What? ${species(save.species).name} is evolving!` : name}</Text>
      {save.isShiny && <Text color="#f8d030"> ★</Text>}
      <Text> Lv{save.level} </Text>
      <Text color={typeColor}>{expBar(save, 8)}</Text>
      {view.bubble && columns >= COMPACT_MIN_COLUMNS && <Text dimColor wrap="truncate-end"> │ “{view.bubble}”</Text>}
    </Box>
  )
  if (!view.showFull) return line
  const scale = pickScale(sp.sprite, maxRows, columns, view.isFlash)
  if (scale === null) return line
  const rows = spriteRows(sp.sprite, save.isShiny, scale)
  return (
    <Box flexDirection="column">
      {rows.map((runs, y) => (
        <Box key={`r${y}`} flexDirection="row">
          {runs.map((r, x) => <Text key={`c${y}-${x}`} color={r.fg} backgroundColor={r.bg}>{r.text}</Text>)}
        </Box>
      ))}
      {line}
    </Box>
  )
}
```

If `Text` does not accept `wrap="truncate-end"` on this build, use the prop the types name for truncation, or slice the bubble to `columns - 40` characters instead.

- [ ] **Step 5: Type-check and commit**

Run: `npx -y -p typescript@5.6.3 tsc -p ~/Projects/_private_projects/claude-pokebuddy`
Expected: no errors.

```bash
git add hooks/render tests/sprite.test.ts
git commit -m "feat: half-block sprite decoding and the band"
```

---

### Task 9: Speech and judge

**Files:**
- Create: `hooks/speech.ts`, `hooks/judge.ts`
- Test: `tests/speech.test.ts`, `tests/judge.test.ts`

**Interfaces:**
- Consumes: `Save` (Task 7), `species` (Task 4), `Signal` (Task 5), config constants (Task 1).
- Produces:
  - `turnFacts(signals: readonly Signal[], prompts: number): string` (one line, no code or prompt text)
  - `cry(name: string, rand: () => number): string`
  - `speechPrompt(save: Save, facts: string): { system: string; prompt: string }`
  - `cleanReply(text: string, max: number): string | null` (null for empty or junk)
  - `speak($: EngineInterface, model: string, save: Save, facts: string): Promise<string>` (never rejects; returns a cry on failure)
  - `judgePrompt(log: readonly string[]): string`, `parseScore(text: string): number | null`
  - `judge($: EngineInterface, model: string, log: readonly string[]): Promise<number | null>` (never rejects)

- [ ] **Step 1: Write the failing tests**

`tests/speech.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import { cleanReply, cry, speak, speechPrompt, turnFacts } from '../hooks/speech'
import { freshSave } from '../hooks/state'

describe('speech', () => {
  test('facts summarise without content', () => {
    expect(turnFacts([{ kind: 'tool' }, { kind: 'tool' }, { kind: 'commit' }, { kind: 'check', key: 'npm test', ok: false }, { kind: 'config', path: '/r/CLAUDE.md' }], 1))
      .toBe('1 prompt; 2 tool calls; 1 commit; checks: npm test failed; edited config: CLAUDE.md')
    expect(turnFacts([], 0)).toBe('a quiet turn')
  })
  test('cry is built from the name', () => {
    expect(cry('PIKACHU', () => 0)).toMatch(/^Pika/)
  })
  test('prompt carries species, level and personality', () => {
    const s = freshSave([1, 2, 3, 4])
    const p = speechPrompt(s, 'a quiet turn')
    expect(p.prompt).toContain(`level ${s.level}`)
    expect(p.prompt).toContain(s.personality)
    expect(p.prompt).toContain('a quiet turn')
  })
  test('cleanReply strips quotes, trims and rejects junk', () => {
    expect(cleanReply('  "Char! Nice fix."  ', 80)).toBe('Char! Nice fix.')
    expect(cleanReply('', 80)).toBe(null)
    expect(cleanReply('   ', 80)).toBe(null)
    expect(cleanReply('x'.repeat(200), 80)!.length).toBe(80)
    expect(cleanReply('line one\nline two', 80)).toBe('line one')
  })
  test('speak falls back to a cry when the model fails', async ($, on) => {
    on('model.complete', () => ({ isAnswered: false, reason: 'api-error', status: 500, error: 'api_error', usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }))
    const s = { ...freshSave([1, 2, 3, 4]), species: 25 }
    expect(await speak($, 'haiku', s, 'a quiet turn')).toMatch(/Pika/)
  })
})
```

`tests/judge.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import { judge, judgePrompt, parseScore } from '../hooks/judge'

describe('judge', () => {
  test('parseScore takes the first integer 0 to 100', () => {
    expect(parseScore('SCORE: 72')).toBe(72)
    expect(parseScore('I would say 101')).toBe(100)
    expect(parseScore('no idea')).toBe(null)
    expect(parseScore('-5')).toBe(0)
  })
  test('prompt lists the log', () => {
    expect(judgePrompt(['1 prompt; 1 commit', 'a quiet turn'])).toContain('- 1 prompt; 1 commit')
  })
  test('judge returns null on an empty log without calling the model', async ($, on) => {
    let called = false
    on('model.complete', () => { called = true; throw new Error('should not be called') })
    expect(await judge($, 'haiku', [])).toBe(null)
    expect(called).toBe(false)
  })
  test('judge returns null on a junk reply', async ($, on) => {
    on('model.complete', () => ({ isAnswered: true, text: 'great session!', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }))
    expect(await judge($, 'haiku', ['1 commit'])).toBe(null)
  })
})
```

The exact `ModelCompleteResult` shape must match the types file (`grep -n "export type ModelCompleteResult" ...`); adjust the mocked answers in these two tests to that shape if a field differs, keeping their meaning.

Run: `claude plugin test ~/Projects/_private_projects/claude-pokebuddy`
Expected: FAIL, modules not found.

- [ ] **Step 2: Implement `hooks/speech.ts`**

```ts
import type { EngineInterface } from 'claude-code'
import { SPEECH_TIMEOUT_MS } from './config'
import { species } from './data/dex'
import type { Signal } from './signals'
import type { Save } from './state'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function turnFacts(signals: readonly Signal[], prompts: number): string {
  const parts: string[] = []
  const count = (k: Signal['kind']) => signals.filter(s => s.kind === k).length
  if (prompts) parts.push(plural(prompts, 'prompt'))
  if (count('tool')) parts.push(plural(count('tool'), 'tool call'))
  if (count('commit')) parts.push(plural(count('commit'), 'commit'))
  if (count('push')) parts.push(plural(count('push'), 'push'))
  if (count('pr')) parts.push(plural(count('pr'), 'PR opened').replace('PR openeds', 'PRs opened'))
  const checks = signals.filter((s): s is Extract<Signal, { kind: 'check' }> => s.kind === 'check')
  if (checks.length) parts.push('checks: ' + checks.map(c => `${c.key} ${c.ok ? 'passed' : 'failed'}`).join(', '))
  const configs = [...new Set(signals.flatMap(s => (s.kind === 'config' ? [s.path.split('/').pop()!] : [])))]
  if (configs.length) parts.push('edited config: ' + configs.join(', '))
  return parts.length ? parts.join('; ') : 'a quiet turn'
}

export function cry(name: string, rand: () => number): string {
  const base = name.charAt(0) + name.slice(1, 4).toLowerCase()
  const shapes = [`${base}!`, `${base} ${base.toLowerCase()}!`, `${base}...?`, `${base}~`]
  return shapes[Math.floor(rand() * shapes.length)]!
}

export function speechPrompt(save: Save, facts: string): { system: string; prompt: string } {
  const sp = species(save.species)
  return {
    system: 'You are a Pokémon companion living in a developer\'s terminal. Reply with one short line (max 12 words) in character, reacting to what just happened. Use your cry sometimes. No quotes, no emoji, no markdown.',
    prompt: `You are ${save.nickname ?? sp.name}, a ${save.isShiny ? 'shiny ' : ''}${sp.name} at level ${save.level}, ${save.personality} by nature. This turn: ${facts}.`,
  }
}

export function cleanReply(text: string, max: number): string | null {
  const first = text.split('\n').map(l => l.trim()).find(l => l.length > 0)
  if (!first) return null
  const unquoted = first.replace(/^["'“”]+|["'“”]+$/g, '').trim()
  return unquoted ? unquoted.slice(0, max) : null
}

export async function speak($: EngineInterface, model: string, save: Save, facts: string): Promise<string> {
  const fallback = cry(species(save.species).name, Math.random)
  try {
    const { system, prompt } = speechPrompt(save, facts)
    const r = await $.model.complete({ model, system, prompt, maxTokens: 60, timeoutMs: SPEECH_TIMEOUT_MS })
    return (r.isAnswered && cleanReply(r.text, 80)) || fallback
  } catch {
    return fallback
  }
}
```

If `$.model.complete` names its timeout differently (`timeoutMs` per the reference), use the types' name.

- [ ] **Step 3: Implement `hooks/judge.ts`**

```ts
import type { EngineInterface } from 'claude-code'
import { JUDGE_TIMEOUT_MS } from './config'

export function judgePrompt(log: readonly string[]): string {
  return [
    'Score this coding session from 0 to 100 for useful progress.',
    'High: shipped work (commits, pushes, PRs), fixed failures (a check failed then passed), improved setup (config edits).',
    'Low: many tool calls with no outcome, repeated failures, nothing finished.',
    'Reply with the number only.',
    '',
    'Turns:',
    ...log.map(l => `- ${l}`),
  ].join('\n')
}

export function parseScore(text: string): number | null {
  const m = text.match(/-?\d+/)
  if (!m) return null
  return Math.max(0, Math.min(100, Number(m[0])))
}

export async function judge($: EngineInterface, model: string, log: readonly string[]): Promise<number | null> {
  if (log.length === 0) return null
  try {
    const r = await $.model.complete({ model, prompt: judgePrompt(log), maxTokens: 10, timeoutMs: JUDGE_TIMEOUT_MS })
    return r.isAnswered ? parseScore(r.text) : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests and commit**

Run: `claude plugin test ~/Projects/_private_projects/claude-pokebuddy`
Expected: PASS.

```bash
git add hooks/speech.ts hooks/judge.ts tests/speech.test.ts tests/judge.test.ts
git commit -m "feat: Haiku speech and the deferred session judge"
```

---

### Task 10: Commands

**Files:**
- Create: `hooks/commands.ts`
- Test: `tests/commands.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 7.
- Produces:
  - `type Parsed = { sub: 'stats' | 'dex' | 'feed' | 'use' | 'stop' | 'toggle' | 'quiet' | 'nickname' | 'export' | 'import' | 'help'; rest: string }`
  - `parseArgs(args: string): Parsed` (empty means `stats`; unknown means `help`)
  - `statsText(save: Save): string`, `dexText(s: Species, owned: boolean): string`, `helpText(command: string): string`
  - `parseStone(text: string): Stone | null` (accepts `thunder`, `thunder-stone`, `Thunder Stone`)

- [ ] **Step 1: Write the failing tests**

`tests/commands.test.ts`:
```ts
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
```

Run: `claude plugin test ~/Projects/_private_projects/claude-pokebuddy`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement `hooks/commands.ts`**

```ts
import { species } from './data/dex'
import { STONES, type Species, type Stone } from './data/types'
import { expForLevel, MAX_LEVEL } from './exp'
import type { Save } from './state'
import type { Source } from './tally'

const SUBS = ['stats', 'dex', 'feed', 'use', 'stop', 'toggle', 'quiet', 'nickname', 'export', 'import'] as const
export type Parsed = { sub: (typeof SUBS)[number] | 'help'; rest: string }

export function parseArgs(args: string): Parsed {
  const trimmed = args.trim()
  if (!trimmed) return { sub: 'stats', rest: '' }
  const [head = '', ...tail] = trimmed.split(/\s+/)
  const rest = tail.join(' ')
  const sub = (SUBS as readonly string[]).includes(head.toLowerCase()) ? (head.toLowerCase() as Parsed['sub']) : 'help'
  return { sub, rest: sub === 'help' ? trimmed : rest }
}

export function parseStone(text: string): Stone | null {
  const key = text.trim().toLowerCase().replace(/\s+/g, '-').replace(/-stone$/, '') + '-stone'
  return (STONES as readonly string[]).includes(key) ? (key as Stone) : null
}

const stoneName = (s: Stone) => s.replace('-', ' ').toUpperCase()
const SOURCE_NAMES: Record<Source, string> = {
  prompt: 'prompts', tool: 'tool calls', active: 'active time', config: 'config edits', commit: 'commits',
  push: 'pushes and PRs', green: 'green checks', judge: 'session judge', feed: 'feeding',
}

export function statsText(save: Save): string {
  const sp = species(save.species)
  const toNext = save.level >= MAX_LEVEL ? 'max level' : `${expForLevel(sp.growth, save.level + 1) - save.exp} EXP to Lv ${save.level + 1}`
  const bag = STONES.filter(s => save.bag[s]).map(s => `${stoneName(s)} ×${save.bag[s]}`).join(', ') || 'empty'
  const sources = Object.entries(save.expBySource).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([k, n]) => `  ${SOURCE_NAMES[k as Source]}: ${n}`).join('\n') || '  nothing yet'
  const c = save.counters
  const hints = sp.evolutions.map(e =>
    e.kind === 'level' ? `Evolves into ${species(e.to).name} at Lv ${e.level}.`
    : e.kind === 'stone' ? `Evolves into ${species(e.to).name} with a ${stoneName(e.stone)}.`
    : `Evolves into ${species(e.to).name} when traded: push or open a PR at Lv 36 or higher.`)
  return [
    `${save.nickname ? `${save.nickname} (${sp.name})` : sp.name}${save.isShiny ? ' ★' : ''}  Lv ${save.level}  ${save.personality}`,
    `${toNext}. Lifetime EXP ${save.lifetimeExp}.`,
    'EXP by source:', sources,
    `Bag: ${bag}`,
    `Stone progress: Thunder Stone ${c.greens % 10}/10 green checks, Fire Stone ${c.commits % 10}/10 commits, Water Stone ${c.configEdits % 10}/10 config edits, Leaf Stone ${c.feedRun % 7}/7 feed days.`,
    `Feed streak: ${c.feedRun} day${c.feedRun === 1 ? '' : 's'}.`,
    ...(hints.length ? hints : ['Does not evolve.']),
  ].join('\n')
}

export function dexText(s: Species, owned: boolean): string {
  return [
    `#${String(s.id).padStart(3, '0')} ${s.name}${owned ? '  (yours)' : ''}`,
    `Type: ${s.types.join(' / ')}   Height: ${(s.height / 10).toFixed(1)} m   Weight: ${(s.weight / 10).toFixed(1)} kg`,
    s.dex,
  ].join('\n')
}

export function helpText(command: string): string {
  return [
    `/${command} stats: your Pokémon, EXP and progress`,
    `/${command} dex [name or number]: Pokédex entry`,
    `/${command} feed: a Rare Candy, once a day`,
    `/${command} use <stone>: evolve with a stone`,
    `/${command} stop: cancel an evolution in progress`,
    `/${command} toggle: compact or full sprite`,
    `/${command} quiet: speech on or off`,
    `/${command} nickname <name>: set a nickname (empty to clear)`,
    `/${command} export: copy your save to the clipboard`,
    `/${command} import <blob>: restore a save`,
  ].join('\n')
}
```

Update the help test expectation to `helpText('buddy')` matching `COMMAND` from Task 1 if the spike renamed it.

- [ ] **Step 3: Run tests and commit**

Run: `claude plugin test ~/Projects/_private_projects/claude-pokebuddy`
Expected: PASS.

```bash
git add hooks/commands.ts tests/commands.test.ts
git commit -m "feat: /buddy sub-commands and their texts"
```

---

### Task 11: Wiring (register.tsx) and hook tests

**Files:**
- Modify: `hooks/register.tsx` (replace the Task 1 stub), `types/index.d.ts`
- Test: `tests/register.test.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces: the loaded mod.

State held where:
- `$.store` key `save`: the `Save`.
- `$.store` key `save.bak`: the raw value of a corrupt save, written before a fresh roll, or the previous save before an import.
- `$.state` (`types/index.d.ts`), plugin `pokebuddy`: `save: Save | null` (mirror for drawing), `bubble: string | null`, `flashUntil: number`, `readOnly: boolean`.
- Module variables (reset on reload, fine): the current turn's `Tally`, `lastWindow`, the time-zone `offset`.

- [ ] **Step 1: Write the contract**

`types/index.d.ts`:
```ts
import type { Save } from '../hooks/state'

declare module 'claude-code' {
  interface PluginState {
    'pokebuddy': {
      save: Save | null
      bubble: string | null
      flashUntil: number
      readOnly: boolean
    }
  }
}
```

If `claude plugin validate` refuses an import inside the contract, inline the `Save` type here and make `hooks/state.ts` import it from `'../types'` instead, so the contract stays the one definition.

- [ ] **Step 2: Write the failing hook tests**

`tests/register.test.tsx`:
```tsx
import { describe, expect, mock, test } from 'claude-code/testing'
import { countsAsPrompt, shouldHandleTurn } from '../hooks/register'
import { exportBlob, freshSave } from '../hooks/state'

const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const answer = (text: string) => ({ isAnswered: true, text, usage })

describe('register', () => {
  test('first session rolls and stores a save', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: Date.UTC(2026, 9, 11, 12) })
    on('model.complete', () => answer('Pika!'))
    await $.command.run({ command: 'buddy', args: 'stats' })
    const save = await $.store.get('save') as { level: number } | undefined
    expect(save?.level).toBe(5)
  })

  test('a future-version save is left untouched and commands say read-only', async ($, on) => {
    mock.store(on, { save: { version: 99, anything: true } })
    mock.clock(on)
    const r = await $.command.run({ command: 'buddy', args: 'feed' })
    expect(r.text).toMatch(/newer version/)
    expect(await $.store.get('save')).toEqual({ version: 99, anything: true })
  })

  test('a corrupt save is backed up before a fresh roll', async ($, on) => {
    mock.store(on, { save: 'garbage' })
    mock.clock(on)
    await $.command.run({ command: 'buddy', args: 'stats' })
    expect(await $.store.get('save.bak')).toBe('garbage')
    expect((await $.store.get('save') as { version: number }).version).toBe(1)
  })

  test('feed once a day through the command', async ($, on) => {
    mock.store(on, { save: freshSave([1, 2, 3, 4]) })
    mock.clock(on, { now: Date.UTC(2026, 9, 11, 12) })
    const first = await $.command.run({ command: 'buddy', args: 'feed' })
    expect(first.text).toMatch(/Rare Candy/)
    const second = await $.command.run({ command: 'buddy', args: 'feed' })
    expect(second.text).toMatch(/already/)
  })

  test('export then import restores the same save', async ($, on) => {
    const s = freshSave([7, 7, 7, 7])
    mock.store(on, { save: s })
    mock.clock(on)
    const r = await $.command.run({ command: 'buddy', args: `import ${exportBlob(s)}` })
    expect(r.text).toMatch(/Restored/)
    expect(await $.store.get('save')).toEqual(s)
  })

  test('a change another session wrote to the store survives this session\'s next command', async ($, on) => {
    const s = freshSave([1, 2, 3, 4])
    mock.store(on, { save: s })
    mock.clock(on, { now: Date.UTC(2026, 9, 11, 12) })
    await $.command.run({ command: 'buddy', args: 'stats' })
    await $.store.set('save', { ...s, nickname: 'Other', lifetimeExp: 999 })
    await $.command.run({ command: 'buddy', args: 'toggle' })
    const after = await $.store.get('save') as { nickname: string; lifetimeExp: number; view: string }
    expect(after.nickname).toBe('Other')
    expect(after.lifetimeExp).toBe(999)
    expect(after.view).toBe('full')
  })

  test('a save stuck mid-evolution is finished on load', async ($, on) => {
    mock.store(on, { save: { ...freshSave([1, 2, 3, 4]), species: 4, level: 16, evolution: { to: 5 } } })
    mock.clock(on)
    await $.command.run({ command: 'buddy', args: 'stats' })
    const after = await $.store.get('save') as { species: number; evolution: unknown }
    expect(after.species).toBe(5)
    expect(after.evolution).toBe(null)
  })

  test('slash commands and plugin prompts earn no prompt EXP', () => {
    expect(countsAsPrompt({ text: '/buddy feed', origin: { kind: 'composer' } })).toBe(false)
    expect(countsAsPrompt({ text: 'fix it', origin: { kind: 'plugin', name: 'x' } })).toBe(false)
    expect(countsAsPrompt({ text: 'fix it', origin: { kind: 'composer' } })).toBe(true)
  })

  test('only main-loop turns are handled', () => {
    expect(shouldHandleTurn({ isAborted: false })).toBe(true)
    expect(shouldHandleTurn({ agentId: 'a1', isAborted: false })).toBe(false)
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`band draws compact on ${surface} and survives maxRows 1 and narrow width`, async ($, on) => {
      mock.store(on, { save: freshSave([1, 2, 3, 4]) })
      mock.clock(on)
      await $.command.run({ command: 'buddy', args: 'stats' })
      for (const [maxRows, columns] of [[1, 40], [3, 120], [60, 200]] as const) {
        const ui = await $.ui.mount({
          plugin: 'pokebuddy', surface, component: 'AbovePrompt',
          props: { hasSurvey: false, isWorking: false, maxRows },
          viewport: { columns, rows: 50 },
        })
        expect(await ui.find({ type: 'Text', text: /Lv5/ })).toBeDefined()
        await ui.unmount()
      }
    })
  }
})
```

`$.ui.mount`'s and `$.command.run`'s exact argument names (`props`, `viewport`, `args`) come from the testing section of the types; match them without changing what each test asserts. If the kit refuses `$.command.run` for a command no `session.start` registered, raise `session.start` first through the kit's classic noun (`$.classic.SessionStart({ source: 'startup' })`) at the top of each test.

Run: `claude plugin test ~/Projects/_private_projects/claude-pokebuddy`
Expected: FAIL (the stub registers nothing).

- [ ] **Step 3: Implement `hooks/register.tsx`**

Every change goes through `mutate`, which reads the store fresh, so a second open session never overwrites this one's progress. If the spike found that unawaited work dies with the hook (`UNAWAITED_WORK_SURVIVES` false), wrap each `void ...` below in `$.clock.after(0, () => ...)`. If it found failure in a result field rather than `isError`, read that field in `failed()`.

```tsx
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { dexText, helpText, parseArgs, parseStone, statsText } from './commands'
import { COMMAND, EVOLVE_MS, FLASH_MS, PENDING_LOG_MAX } from './config'
import { findSpecies, species } from './data/dex'
import { applyExp, applyTurn, cancelEvolution, feed, finishEvolution, useStone, type GameEvent } from './game'
import { judge } from './judge'
import { localTime, readOffset } from './localtime'
import { band } from './render/band'
import { signalsFromTool } from './signals'
import { speak, turnFacts } from './speech'
import { exportBlob, freshSave, importBlob, parseSave, type Save } from './state'
import { emptyTally, scoreTally, type Tally } from './tally'

const P = 'pokebuddy'
const saveAtom = atom({ plugin: P, key: 'save' } as const, null)
const bubbleAtom = atom({ plugin: P, key: 'bubble' } as const, null)
const flashAtom = atom({ plugin: P, key: 'flashUntil' } as const, 0)
const readOnlyAtom = atom({ plugin: P, key: 'readOnly' } as const, false)

const WINDOW_MS = 10 * 60 * 1000
const READ_ONLY = 'Your pokebuddy save is from a newer version of the mod. Update the mod; nothing was changed.'

export function shouldHandleTurn(e: { agentId?: string; isAborted: boolean }): boolean {
  return e.agentId === undefined
}

export function countsAsPrompt(e: { text: string; origin: { kind: string } }): boolean {
  return e.origin.kind !== 'plugin' && !e.text.trimStart().startsWith('/')
}

function failed(ran: unknown): boolean {
  const r = ran as { deny?: string; isError?: boolean }
  return r.deny !== undefined || r.isError === true
}

export const register: Register = (on, options) => {
  const model = String(options?.speechModel ?? 'haiku')
  let tally: Tally = emptyTally()
  let lastWindow = -1
  let offset: number | null = null

  /** Reads the save fresh from the store. null when it is from a newer version. */
  async function loadFresh($: EngineInterface): Promise<Save | null> {
    const raw = await $.store.get('save')
    const parsed = parseSave(raw)
    if (parsed.kind === 'future') {
      await update($, readOnlyAtom, () => true)
      return null
    }
    if (parsed.kind === 'ok') return parsed.save
    if (parsed.kind === 'corrupt') await $.store.set('save.bak', raw as never)
    const seed = Array.from(crypto.getRandomValues(new Uint32Array(4)))
    const save = freshSave(seed)
    await $.store.set('save', save)
    if (parsed.kind === 'corrupt') $.ui.toast('Your pokebuddy save was damaged. It was backed up as save.bak and a new Pokémon was rolled.')
    return save
  }

  /** Read fresh, change, write back, refresh the drawing copy. */
  async function mutate<T>($: EngineInterface, change: (s: Save) => { save: Save; events?: readonly GameEvent[] } & T): Promise<(T & { save: Save }) | null> {
    const cur = await loadFresh($)
    if (!cur) return null
    const r = change(cur)
    await $.store.set('save', r.save)
    await update($, saveAtom, () => r.save)
    if (r.events?.length) await announce($, r.events, r.save)
    return r
  }

  async function announce($: EngineInterface, events: readonly GameEvent[], save: Save) {
    for (const ev of events) {
      if (ev.kind === 'level') $.ui.toast(`${save.nickname ?? species(save.species).name} grew to Lv ${ev.level}!`)
      if (ev.kind === 'stone') $.ui.toast(`You found a ${ev.stone.replace('-', ' ').toUpperCase()}!`)
      if (ev.kind === 'evolved') $.ui.toast(`Congratulations! ${species(ev.from).name} evolved into ${species(ev.to).name}!`)
      if (ev.kind === 'max') $.ui.toast('Level 100!')
    }
    if (events.some(e => e.kind === 'level' || e.kind === 'evolved' || e.kind === 'evolving')) {
      const now = await $.clock.now()
      await update($, flashAtom, () => now + FLASH_MS)
      $.clock.after(FLASH_MS + 50, () => $.ui.invalidate('ui.render'))
    }
    if (events.some(e => e.kind === 'evolving')) {
      $.clock.after(EVOLVE_MS, () => mutate($, s => finishEvolution(s)))
    }
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: COMMAND, description: 'Your Gen 1 Pokémon buddy: stats, dex, feed, evolve' })
    offset = await readOffset($)
    // A reload or exit inside the evolution window drops its timer; finish it now.
    const loaded = await mutate($, s => (s.evolution ? finishEvolution(s) : { save: s }))
    // Take the pending log first, then score it, so a second session cannot judge the same turns.
    let taken: string[] = []
    if (loaded && loaded.save.pendingLog.length > 0) {
      await mutate($, s => {
        taken = s.pendingLog
        return { save: { ...s, pendingLog: [] } }
      })
    }
    if (taken.length > 0) {
      void judge($, model, taken).then(async score => {
        if (score === null) return
        await mutate($, s => applyExp(s, { judge: score }))
        $.ui.toast(`Last session judged ${score}/100: +${score} EXP`)
      })
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (countsAsPrompt(e)) {
      tally.prompts++
      const window = Math.floor((await $.clock.now()) / WINDOW_MS)
      if (window !== lastWindow) { tally.activeWindows++; lastWindow = window }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    try {
      tally.signals.push(...signalsFromTool(String(e.tool), e as unknown as Record<string, unknown>, failed(ran)))
    } catch {}
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!shouldHandleTurn(e)) return result
    const turn = tally
    tally = emptyTally()
    const local = localTime(await $.clock.now(), offset)
    const facts = turnFacts(turn.signals, turn.prompts)
    const r = await mutate($, s => {
      const applied = applyTurn(s, scoreTally(turn, s.checks), local)
      return { ...applied, save: { ...applied.save, pendingLog: [...applied.save.pendingLog, facts].slice(-PENDING_LOG_MAX) } }
    })
    if (r?.save.speechOn) void speak($, model, r.save, facts).then(line => update($, bubbleAtom, () => line))
    return result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: COMMAND }, async ($, e) => {
    const { sub, rest } = parseArgs(e.args)
    if (sub === 'help') return { text: helpText(COMMAND) }
    if (sub === 'dex' && rest) {
      const s = findSpecies(rest)
      return { text: s ? dexText(s, false) : `No Gen 1 Pokémon called "${rest}".` }
    }
    const local = localTime(await $.clock.now(), offset)
    switch (sub) {
      case 'stats': {
        const s = await loadFresh($)
        if (s) await update($, saveAtom, () => s)
        return { text: s ? statsText(s) : READ_ONLY }
      }
      case 'dex': {
        const s = await loadFresh($)
        return { text: s ? dexText(species(s.species), true) : READ_ONLY }
      }
      case 'feed': {
        const r = await mutate($, s => feed(s, local))
        if (!r) return { text: READ_ONLY }
        const name = species(r.save.species).name
        if (!r.fed) return { text: `${name} has already eaten today. Come back tomorrow.` }
        const days = r.save.counters.feedRun
        return { text: `You fed ${name} a Rare Candy. +${r.gained} EXP. Streak: ${days} day${days === 1 ? '' : 's'}.` }
      }
      case 'use': {
        const stone = parseStone(rest)
        if (!stone) return { text: 'Which stone? moon, fire, water, thunder or leaf.' }
        let from = 0
        const r = await mutate($, s => { from = s.species; return useStone(s, stone) })
        if (!r) return { text: READ_ONLY }
        if (r.error) return { text: r.error }
        return { text: `${species(from).name} evolved into ${species(r.save.species).name}!` }
      }
      case 'stop': {
        const r = await mutate($, s => cancelEvolution(s))
        if (!r) return { text: READ_ONLY }
        return { text: r.cancelled ? `Huh? ${species(r.save.species).name} stopped evolving!` : 'Nothing is evolving right now.' }
      }
      case 'toggle': {
        const r = await mutate($, s => ({ save: { ...s, view: s.view === 'full' ? 'compact' as const : 'full' as const } }))
        return { text: r ? `Showing the ${r.save.view} view.` : READ_ONLY }
      }
      case 'quiet': {
        const r = await mutate($, s => ({ save: { ...s, speechOn: !s.speechOn } }))
        if (!r) return { text: READ_ONLY }
        if (!r.save.speechOn) await update($, bubbleAtom, () => null)
        return { text: r.save.speechOn ? 'Speech is on.' : 'Speech is off. No model calls will be made for reactions.' }
      }
      case 'nickname': {
        const nickname = rest.trim().slice(0, 12) || null
        const r = await mutate($, s => ({ save: { ...s, nickname } }))
        if (!r) return { text: READ_ONLY }
        return { text: nickname ? `Nickname set to ${nickname}.` : 'Nickname cleared.' }
      }
      case 'export': {
        const s = await loadFresh($)
        if (!s) return { text: READ_ONLY }
        const blob = exportBlob(s)
        const copied = await $.ui.copy({ text: blob })
        return { text: copied.isCopied ? 'Save copied to the clipboard.' : `Copy this save:\n${blob}` }
      }
      case 'import': {
        const parsed = importBlob(rest)
        if (parsed.kind === 'bad') return { text: parsed.reason }
        const prev = await $.store.get('save')
        if (prev !== undefined) await $.store.set('save.bak', prev as never)
        await $.store.set('save', parsed.save)
        await update($, saveAtom, () => parsed.save)
        await update($, readOnlyAtom, () => false)
        return { text: `Restored ${species(parsed.save.species).name} at Lv ${parsed.save.level}. Your previous save is in save.bak.` }
      }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const save = await read($, saveAtom)
    if (!save) return next(e)
    const now = await $.clock.now()
    const isFlash = (await read($, flashAtom)) > now
    const view = {
      save,
      bubble: await read($, bubbleAtom),
      showFull: save.view === 'full' || isFlash,
      evolving: save.evolution !== null,
      isFlash: isFlash && save.view !== 'full',
    }
    return band($.ui.resolve(e), view, e.props.maxRows, e.viewport?.columns ?? 80)
  })
}
```

There is no `session.end` hook: every change is already in the store when it happens.

Adjust to the exact types where the compiler says so: the `tool.call` result union (`isError` is only on the answered arm), `e.viewport`, `$.ui.copy`'s argument, and the `options` type. Do not loosen with `any`; narrow with the types' own discriminants.

- [ ] **Step 4: Run all checks**

Run, in order:
```bash
claude plugin validate ~/Projects/_private_projects/claude-pokebuddy
npx -y -p typescript@5.6.3 tsc -p ~/Projects/_private_projects/claude-pokebuddy
claude plugin test ~/Projects/_private_projects/claude-pokebuddy
npm run test:scripts
```
Expected: validate lists `session.start`, `prompt.submit`, `tool.call`, `turn.complete`, `command.run` (answers its own command `buddy`), `ui.render`; the three gating hooks show `with .catch`; tsc clean; all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add hooks/register.tsx types/index.d.ts tests/register.test.tsx
git commit -m "feat: wire events, commands and the band"
```

---

### Task 12: Live check in a real session

**Files:** none new unless a bug is found (then a failing test first, in the owning task's test file).

- [ ] **Step 1: Start a session with the mod**

Ask the user to run, in a separate terminal: `claude --plugin-dir ~/Projects/_private_projects/claude-pokebuddy`.

- [ ] **Step 2: Walk the checklist with the user**

1. The compact band shows above the prompt after the first turn.
2. `/buddy` prints stats; `/buddy dex mew` prints Mew's entry.
3. `/buddy toggle` shows the full sprite; colours look right; toggling back works.
4. `/buddy feed` levels up, the sprite flashes at 2×, and a second feed is refused.
5. After a turn, the bubble shows a Haiku line within a few seconds.
6. `/buddy quiet` stops the bubble.
7. A narrow terminal (resize under 60 columns) drops the bubble.
8. `/buddy export`, then `/buddy import <blob>`, restores the same Pokémon.
9. Quit and restart: same Pokémon, same level; a toast reports the judge score.

- [ ] **Step 3: Fix and commit anything found**

Each fix: a failing test in the owning task's test file, the fix, the full suite, a commit `fix: <what>`.

---

### Task 13: README, CI and publishing

**Files:**
- Create: `README.md`, `.github/workflows/ci.yml`

- [ ] **Step 1: README**

Sections, in this order, no em dashes: what it is (one paragraph and a screenshot placeholder path `docs/screenshot.png` the user adds); Requirements (Claude Code 2.1.296 or newer; the mod API is early access and may change between releases); Install (the code block `/plugin install pokebuddy --marketplace yonatankarp/claude-pokebuddy`, then "answer `y` to add the marketplace and pick the user scope"); Commands (the help list); How EXP works (the table from the spec); Evolution (levels, the stone table, trades at Lv 36+, Eevee by stone); Cost and privacy (one Haiku call per turn and one per session start, only a fact summary is sent, never code or prompts; `/buddy quiet` and the `speechModel` option); Building the data (`npm ci && npm run data`); Disclaimer (the LICENSE paragraph).

- [ ] **Step 2: CI**

`.github/workflows/ci.yml`:
```yaml
name: ci
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run test:scripts
      - run: npx tsc -p tsconfig.scripts.json
      - run: npm install -g @anthropic-ai/claude-code@2.1.296
      - run: claude plugin validate .
      - run: claude plugin test .
```

Note: `check:data` needs the raw downloads, so CI does not run it; it runs the bake's unit tests instead. Whether `claude plugin test` runs without a login in CI must be checked on the first CI run; if it needs auth, drop that step from CI and say so in the README's contributing note.

- [ ] **Step 3: Full verification**

```bash
claude plugin validate ~/Projects/_private_projects/claude-pokebuddy
npx -y -p typescript@5.6.3 tsc -p ~/Projects/_private_projects/claude-pokebuddy
claude plugin test ~/Projects/_private_projects/claude-pokebuddy
npm run test:scripts
git log --format='%an <%ae>' | sort -u
```
Expected: all clean; the author list is only `Yonatan Karp-Rudin <yonvata@gmail.com>`.

- [ ] **Step 4: Commit**

```bash
git add README.md .github/workflows/ci.yml
git commit -m "docs: README, install line and CI"
```

- [ ] **Step 5: Create the GitHub repo and push (ask first)**

Confirm visibility with the user (public is required for others to install). Then:
```bash
gh repo create yonatankarp/claude-pokebuddy --public --source ~/Projects/_private_projects/claude-pokebuddy --push --description "A Gen 1 Pokémon buddy for Claude Code that levels up and evolves from real work"
gh run watch --exit-status
```
Expected: the repo exists, CI is green. Then, in a fresh terminal, the user runs the install line from the README and confirms the band appears.
