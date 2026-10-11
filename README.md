# pokebuddy

![pokebuddy above the Claude Code prompt](docs/images/full.svg)

A Gen 1 Pokémon lives above your Claude Code prompt, reacts to each turn in a little speech bubble and grows from the work you do. You get one per machine, rolled at random, starting at level 5.

## Install

```
/plugin install pokebuddy --marketplace yonatankarp/pokebuddy
```

Answer `y` to add the marketplace and pick the user scope so your buddy follows you into every project. You need Claude Code 2.1.296 or newer.

## Quick start

1. `/buddy` shows your Pokémon and its progress.
2. `/buddy feed` gives it a Rare Candy, once a day.
3. `/buddy toggle` switches between the full view and a one-line compact view.

![the compact one-line view](docs/images/compact.svg)

## Commands

In some places Claude Code shows the command as `/pokebuddy:buddy`.

| Command | What it does |
| --- | --- |
| `/buddy` or `/buddy stats` | Your Pokémon, EXP and progress |
| `/buddy dex [name or number]` | A Pokédex entry, yours by default |
| `/buddy feed` | A Rare Candy, once a day |
| `/buddy use <stone>` | Evolve with a stone from your bag |
| `/buddy stop` | Cancel an evolution in progress |
| `/buddy toggle` | Full view or compact line |
| `/buddy quiet` | Speech and the session judge on or off |
| `/buddy nickname <name>` | Set a nickname, or clear it with no name |
| `/buddy export` | Copy your save to the clipboard |
| `/buddy import <blob>` | Load a save you exported |
| `/buddy restore` | Swap the backup save back in |
| `/buddy reset [confirm]` | Explain a reset, or roll a new Pokémon once a day with `confirm` |

## How it grows

Your Pokémon earns EXP from prompts, tool use, commits, pushes and PRs, fixing failing checks, a daily Rare Candy and a score for each finished session. It levels at its Gen 1 growth rate and evolves by level, by stone or by trade, just like the original games. One in 512 is shiny, with its alternate colours and a ★ by its name.

<p><img src="docs/images/shiny.svg" width="49%" alt="a shiny Pikachu"> <img src="docs/images/evolving.svg" width="49%" alt="Charmander evolving at level 16"></p>

<details><summary>EXP table</summary>

| You | EXP | Limit |
| --- | --- | --- |
| Send a prompt (not a slash command) | 10 | none |
| Claude uses a tool | 2 | 40 per turn |
| Stay active | 5 per 10 minutes | only while you are sending prompts |
| Edit `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md` or a file under `.claude/` | 25 | once per file per turn |
| Commit | 30 | none |
| Push or open a PR | 50 | none |
| Fix a failing check (it fails, then passes) | 40 | none |
| Finish a session (judged by the model) | 0 to 100 | once per session |
| `/buddy feed` | enough for the next level, more on a streak | once a day |

A check is a test, build, lint or type check run such as `npm test`, `./gradlew build`, `pytest` or `go vet ./...`. Runs without a person at the prompt (`claude -p`, the Agent SDK) earn nothing.

</details>

<details><summary>Stones and special evolutions</summary>

When a level evolution starts you have about 4 seconds to type `/buddy stop`; the next level-up tries again. Stones collect in your bag as you reach milestones, and every milestone repeats.

| Stone | Earned by |
| --- | --- |
| Thunder Stone | every 10 fixed checks |
| Fire Stone | every 10 commits |
| Water Stone | every 10 config edits |
| Leaf Stone | each 7-day feeding streak |
| Moon Stone | a turn before 5 am (once a night) |

A stone evolution only happens when you use the stone, so Eevee becomes whichever form you pick. Kadabra, Machoke, Graveler and Haunter evolve by trade: push or open a PR at level 36 or higher.

</details>

## Settings and privacy

Change these in `/config`, or under `pluginConfigs.pokebuddy` in your Claude Code settings.

| Setting | Default | What it does |
| --- | --- | --- |
| `speechModel` | `haiku` | The model for speech and the session judge |
| `speechContext` | `conversation` | `conversation` lets speech react to what you asked and what Claude answered; `facts` sends only counts |

Your buddy makes at most one small model call per turn, plus one to judge finished sessions, and your prompts and Claude's answers are never saved. `/buddy quiet` stops every model call.

<details><summary>What is sent</summary>

In an interactive session with speech on, your buddy makes at most one model call per completed turn, and at most one more when a session starts, only if earlier sessions are waiting to be judged. With `conversation`, the turn's call includes the first 300 characters of your last prompt and of Claude's answer, along with a short summary of what happened. With `facts`, only the summary is sent: counts of prompts and tool calls, the check commands you ran and whether they passed, and the names of config files you edited. The session judge always gets the summary alone. Prompt and answer text are never saved.

</details>

## Your save

Your save lives on this machine, one per machine; `/buddy export` and `/buddy import` move it. Import, restore and reset each keep the save they replace in one backup slot that `/buddy restore` swaps back. A reset needs `/buddy reset confirm` and works once a day.

To uninstall, run `/plugin uninstall pokebuddy`, after an export if you might come back.

## Disclaimer and credits

Pokémon names, sprites and Pokédex text are trademarks and copyrights of Nintendo, Game Freak and The Pokémon Company and are not covered by this project's licence. This is an unofficial fan project. Pokédex data and sprites come from [PokeAPI](https://pokeapi.co) and the PokeAPI sprites repository.

Want to help build it? See [CONTRIBUTING.md](CONTRIBUTING.md).
