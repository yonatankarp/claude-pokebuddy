# claude-pokebuddy

A Gen 1 Pokémon buddy for Claude Code. It lives in a band above the prompt, reacts to what you do with short speech bubbles, gains EXP from real work such as prompts, commits, pushes and green test runs, and evolves when it reaches the right level or you give it a stone. You get one Pokémon per machine, rolled at random (1 in 512 are shiny), and it starts at level 5.

![pokebuddy](docs/screenshot.png)

The repository is called claude-pokebuddy because the `claude-` prefix is reserved for plugin names; the plugin itself is `pokebuddy`.

## Requirements

Claude Code 2.1.296 or newer. The mod API is early access and may change between releases.

## Install

```
/plugin install pokebuddy --marketplace yonatankarp/claude-pokebuddy
```

Answer `y` to add the marketplace and pick the user scope.

## Commands

The command is `/buddy`. In some contexts Claude Code shows it namespaced as `/pokebuddy:buddy`.

| Command | Does |
| --- | --- |
| `/buddy stats` | Your Pokémon, EXP and progress |
| `/buddy dex [name or number]` | Pokédex entry |
| `/buddy feed` | A Rare Candy, once a day |
| `/buddy use <stone>` | Evolve with a stone |
| `/buddy stop` | Cancel an evolution in progress |
| `/buddy toggle` | Compact or full sprite |
| `/buddy quiet` | Speech on or off |
| `/buddy nickname <name>` | Set a nickname (empty to clear) |
| `/buddy export` | Copy your save to the clipboard |
| `/buddy import <blob>` | Restore a save |

Saves live in the plugin's store, one per machine. `export` and `import` move a save between machines. The blob carries a 32-bit checksum that catches damage, not tampering. One backup slot, `save.bak`, keeps the previous save when one fails to parse.

## How EXP works

Each species follows its Gen 1 growth rate. Level 100 is the cap; past it only lifetime EXP grows.

| Source | EXP | Limit |
| --- | --- | --- |
| Prompt submitted | 10 | none |
| Tool call | 2 | 40 per turn |
| Active time | 5 per 10 minutes | only windows that contain a prompt |
| Config edit (CLAUDE.md, `.claude/**`, skills, hooks, memory files) | 25 | once per file per turn |
| Commit (`git commit` that succeeds, not `--dry-run`) | 30 | none |
| Push or PR (`git push`, `gh pr create` that succeed) | 50 | none |
| Green after red (a check fails, then the same check passes) | 40 | none |
| Session judge | 0 to 100 | one per session |
| `/buddy feed` | EXP to the next level, plus 10% per streak day | once per local day, streak capped at 7 |

Checks are detected by command name: `gradle`, `gradlew`, `mvn`, `npm`, `pnpm`, `yarn`, `bun`, `npx`, `pytest`, `cargo`, `go`, `make`, `tsc`, `eslint`, `ruff`, `jest` and `vitest`. Custom scripts are not detected. Detection is conservative: a command that is piped, or chained with `||` or `;`, earns no outcome-based EXP, and a command inside quotes does not count.

## Evolution

Level evolutions follow the Gen 1 tables. When the level is reached the band announces the evolution and flashes the old and new sprites for about 4 seconds. `/buddy stop` in that window cancels it, and the next level-up tries again.

Stones go to your bag from milestones, and each threshold repeats.

| Stone | Earned by |
| --- | --- |
| Thunder Stone | every 10 green-after-red checks |
| Fire Stone | every 10 commits |
| Water Stone | every 10 config edits |
| Leaf Stone | each 7-day feed streak |
| Moon Stone | a turn between midnight and 4 am local time (once per night) |

Stone evolutions only happen through `/buddy use <stone>`, so you can keep a Pikachu. Eevee evolves into the form of the stone you use. Trade evolutions (Kadabra, Machoke, Graveler, Haunter) fire on your first successful `git push` or `gh pr create` at level 36 or higher.

## Cost and privacy

Speech uses one Haiku call per completed main turn, plus one per session start that judges the previous session. Only a short fact summary is sent (counts, check command names, config file names), never code or prompt text. The model is the `haiku` alias by default and can be changed with the `speechModel` option. `/buddy quiet` turns speech off.

## Building the data

The Pokédex data is committed. To regenerate it from PokeAPI:

```
npm ci && npm run data
```

`npm run check:data` re-bakes and diffs the result, so it needs the raw files that `npm run data` downloads.

## Contributing

CI runs the script tests, the scripts type check, `claude plugin validate .` and `claude plugin test .` on Claude Code 2.1.296. It does not run `check:data` because the raw downloads are not in the repository. If `claude plugin test` turns out to need a login in CI, that step is dropped.

## Disclaimer

Pokémon names, sprites and Pokédex text are trademarks and copyrights of Nintendo, Game Freak and The Pokémon Company. They are not covered by this licence. This is an unofficial fan project.
