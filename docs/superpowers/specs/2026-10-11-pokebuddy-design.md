# claude-pokebuddy design

Date: 2026-10-11. Status: approved in conversation, awaiting written-spec review.

## Goal

A Claude Code mod that brings back the buddy as a Gen 1 Pokémon that levels up and evolves from real work. It is a public, installable plugin:

```
/plugin install claude-pokebuddy --marketplace yonatankarp/claude-pokebuddy
```

It uses real Pokémon names, Gen 2 Crystal sprites and Crystal dex text. The maintainer accepts the takedown risk. The README carries a fan-project disclaimer (not affiliated with Nintendo, Game Freak or The Pokémon Company).

## Constraints from the mod API (build 2.1.296)

The mod API has no buddy or companion hook, so the mod draws its own buddy in the `AbovePrompt` band. It exposes no account ID, so the roll is seeded by a random value kept in `$.store` (one Pokémon per machine, movable with export and import). `session.end` gives all hooks one short shared wall-clock budget, so no model call runs there. The hooks module runs with no Node, no DOM and no network; everything outside it goes through `$`. `$.store` holds at most 4 MiB of JSON.

## Architecture

Build time and runtime are separate.

**Build time** (`scripts/`, Node, maintainers only). `fetch.ts` downloads, for species #1 to #151, the Crystal front sprite (normal and shiny, transparent variants) from the PokeAPI sprites repository, and from the PokeAPI API the name, types, height, weight, Crystal flavour text, growth rate and evolution chain. `bake.ts` crops each sprite's transparent border, stores it as a per-sprite palette (Crystal sprites use at most 4 colours plus transparency) and rows of palette indexes, and builds a 2× nearest-neighbour downscale. The output is one committed module, `hooks/data/pokedex.generated.ts`, with a target size under 300 KB. Gen 2 species and Gen 2 evolution links (Crobat, Steelix, Scizor, Espeon, Umbreon, Pichu and other baby forms) are excluded.

**Runtime** (`hooks/`), one job per file:

| File | Job |
| --- | --- |
| `register.tsx` | Wiring only: events to modules |
| `state.ts` | Save shape, load and save to `$.store`, schema version, migration, backup |
| `roll.ts` | Seed to species, shiny and personality (pure) |
| `exp.ts` | Growth curves, source weights, per-turn caps (pure) |
| `evolution.ts` | Level, stone, trade and Eevee rules, cancel (pure) |
| `signals.ts` | Raw `tool.call` and `prompt.submit` inputs to domain events (pure) |
| `speech.ts` | Haiku reaction per turn, timeout, canned fallback |
| `judge.ts` | Deferred session judge |
| `render.tsx` | Band (compact, 2×, 1:1), stats and dex text |
| `commands.ts` | `/buddy <sub>` dispatch |

Pure modules hold most logic and are unit tested without the engine.

## The roll

On first run the mod draws a random 64-bit seed and saves it. A seeded PRNG then picks the species, the shiny flag and a personality trait (one of eight, used only in the speech prompt). Every Pokémon starts at level 5.

The pool is the Gen 1 base forms (no Gen 1 pre-evolution, Pikachu included). Weights: multi-stage base forms 1 each; single-stage species that never evolve in Gen 1 (Lapras, Snorlax, Tauros, Ditto, Farfetch'd, Kangaskhan, Mr. Mime, Jynx, Scyther, Onix and the rest) 0.33 each; Articuno, Zapdos, Moltres, Mewtwo and Mew 0.02 each. Shiny chance is 1 in 512, so players actually meet one. All weights live in one table.

## State

One `$.store` key, `save`:

```
{ version, seed, species, isShiny, personality, nickname?, level, exp, lifetimeExp,
  expBySource, bag: { stone: count }, counters: { greenChecks, commits, configEdits, ... },
  feed: { lastDate, streak }, pendingLog: string[], speechOn, view: 'compact' | 'full',
  evolution?: { to, cancelledAtLevel? } }
```

An unknown future `version` leaves the save untouched and the mod runs read-only with a toast. A save that fails to parse is copied to `save.bak` before a fresh roll. Session-only values (the current bubble, the sprite flash deadline, the evolution flash) are atoms in `$.state` declared in `types/index.d.ts`.

## EXP

Each species uses its Gen 1 growth rate: fast (4n³/5), medium fast (n³), medium slow (6n³/5 − 15n² + 100n − 140) and slow (5n³/4). Level 100 is the cap; past it only `lifetimeExp` grows.

| Source | EXP | Limit |
| --- | --- | --- |
| Prompt submitted | 10 | none |
| Tool call | 2 | 40 per turn |
| Active time | 5 per 10 minutes | only windows that contain a prompt |
| Config edit (CLAUDE.md, `.claude/**`, skills, hooks, memory files) | 25 | once per file per turn |
| Commit (`git commit` that succeeds, not `--dry-run`) | 30 | none |
| Push or PR (`git push`, `gh pr create` that succeed) | 50 | none |
| Green after red (a test, lint or build command fails, then the same command passes) | 40 | none |
| Session judge | 0 to 100 | one per session |
| `/buddy feed` | EXP to reach the next level, plus 10% per streak day | once per local day, streak capped at 7 |

`signals.ts` detects commands by parsing the Bash command string. Runner names are a list: `gradle`, `gradlew`, `mvn`, `npm`, `pnpm`, `yarn`, `bun`, `pytest`, `cargo`, `go test`, `make`, `tsc`, `eslint`, `ruff`, `jest`, `vitest`. A command inside quotes (`echo "git push"`) does not count. Custom scripts are not detected; any Bash success counting would be trivially farmed.

EXP is summed per turn in memory and written once in `turn.complete`. `session.end` only flushes.

## Evolution

Level evolutions use the Gen 1 tables. When the level is reached the band announces "What? CHARMANDER is evolving!" and flashes the old and new sprites for about 4 seconds; `/buddy stop` in that window cancels, and the next level-up tries again.

Stones come from milestones and go to the bag; each threshold repeats.

| Stone | Earned by |
| --- | --- |
| Thunder Stone | every 10 green-after-red checks |
| Fire Stone | every 10 commits |
| Water Stone | every 10 config edits |
| Leaf Stone | each 7-day feed streak |
| Moon Stone | a turn whose local hour is 0 to 4 (once per night) |

Stone evolutions only happen through `/buddy use <stone>`, so players can keep Pikachu. Eevee's branch is the stone used. Trade evolutions (Kadabra, Machoke, Graveler, Haunter) fire on the first successful `git push` or `gh pr create` at level 36 or higher.

Local time comes from the sandbox's `Intl` time zone when available, else from `$.process.run(['date', '+%H'])`, else UTC. This is an implementation risk to check first.

## Speech

On `turn.complete`, one `$.model.complete` call with a 4-second timeout, on the `haiku` alias by default (a `userConfig` option `speechModel`), so it tracks the cheapest Haiku. The prompt holds the species, level, personality and the turn's facts: tools used, file names touched, check results, commits and pushes. It never holds code or prompt text. Expected size is about 150 tokens in and 30 out. On failure or timeout the bubble shows a canned cry. `/buddy quiet` turns speech off. The call is fire-and-forget and never delays the turn.

## Session judge

Each turn appends its one-line fact summary to `pendingLog` (at most 200 lines). At the next `session.start` a Haiku call scores the log from 0 to 100 against a fixed rubric (shipped, fixed, improved setup, versus thrashing), the EXP is awarded with a toast, and the log is cleared. The judge sees facts, not content, so it cannot rate code quality.

## Rendering

The compact band is one line: a type-coloured glyph, the name (or nickname), a star when shiny, the level, an EXP bar and the bubble. The bubble wraps to a second line on narrow terminals and is dropped below 60 columns. Nothing draws while `hasSurvey` is true.

The full sprite shows on `/buddy toggle` and for about 6 seconds after a level-up or evolution. The size follows the band's `maxRows`: 1:1 when the cropped sprite fits, 2× when that fits, compact otherwise. The unprompted flash is always 2× at most. Pixels are `▀` cells with truecolor foreground and background; transparency shows the terminal background.

## Commands

One registered command, `/buddy`, dispatching on its arguments.

| Command | Does |
| --- | --- |
| `/buddy`, `/buddy stats` | Species, shiny, level, EXP to next level, lifetime EXP by source, bag, stone progress, evolution hint, feed streak |
| `/buddy dex [name or number]` | Crystal dex entry, type, height and weight for any of the 151; defaults to your own |
| `/buddy feed` | Daily Rare Candy |
| `/buddy use <stone>` | Stone evolution, or why it cannot happen |
| `/buddy stop` | Cancels an evolution in progress |
| `/buddy toggle` | Compact or full sprite |
| `/buddy quiet` | Speech on or off |
| `/buddy nickname <name>` | Sets a nickname |
| `/buddy export`, `/buddy import <blob>` | Base64 save to the clipboard; restore with version and checksum checks |

## Testing

Unit tests for the pure modules: roll rates over 100,000 seeds within tolerance, every growth curve at levels 1, 50 and 100, every evolution rule including trade, Eevee and cancel, and signal detection on real command strings including false positives. Hook tests drive fake `tool.call`, `prompt.submit` and `turn.complete` sequences and assert the save, with `$.model.complete` mocked. UI tests mount `AbovePrompt` on `terminal` and `desktop` with several `maxRows` values and assert compact, 2× or 1:1. A golden test covers the bake of Pikachu, Mew and shiny Gyarados. `claude plugin validate`, `tsc` and `claude plugin test` must be clean.

## Packaging

The repository root is the mod and its marketplace (`.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, source `./`). The README covers install, the Haiku cost note and how to turn speech off, and the disclaimer. GitHub Actions runs validate, tests and a check that the generated data is current. Commits use the private identity. When the build is done the repository is created under the personal GitHub account `yonatankarp` and pushed; visibility is confirmed with the user at that point.

## Out of scope

Catching and a multi-Pokémon party, battles, sound, Gen 2 species, syncing a save between machines other than export and import.
