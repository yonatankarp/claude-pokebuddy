# pokebuddy

A Gen 1 Pokémon that lives above your Claude Code prompt. It reacts to each turn with a short speech bubble, earns EXP from the work you do (prompts, commits, pushes, passing tests), levels up and evolves. You get one Pokémon per machine, rolled at random, starting at level 5.

## Install

You need Claude Code 2.1.296 or newer. Mods are an early access feature and may change between releases.

```
/plugin install pokebuddy --marketplace yonatankarp/claude-pokebuddy
```

Claude Code asks whether to add the marketplace (answer `y`) and where to install it. Pick the user scope so your buddy follows you into every project.

## Getting started

Once installed, your Pokémon appears above the prompt. After your first turn it says something about what just happened, and the line stays in its bubble until the next turn replaces it.

Type `/buddy` to see its stats. `/buddy toggle` switches between the full view with the sprite and a one-line compact view, and `/buddy feed` gives it a Rare Candy once a day for a quick boost.

When there is room, the sprite is drawn with the bubble beside it and the name, level and EXP bar underneath. On a short or narrow terminal it falls back to a smaller icon, then to the one-line view.

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
| `/buddy reset` | Explain what a reset does |
| `/buddy reset confirm` | Roll a new Pokémon, once a day |

## How your Pokémon grows

| You | EXP | Limit |
| --- | --- | --- |
| Send a prompt (not a slash command) | 10 | none |
| Claude uses a tool | 2 | 40 per turn |
| Stay active | 5 per 10 minutes | only while you are sending prompts |
| Edit `CLAUDE.md`, `AGENTS.md` or a file under `.claude/` | 25 | once per file per turn |
| Commit | 30 | none |
| Push or open a PR | 50 | none |
| Fix a failing check (it fails, then passes) | 40 | none |
| Finish a session (judged by the model) | 0 to 100 | once per session |
| `/buddy feed` | enough for the next level, more on a streak | once a day |

A check is a test, build, lint or type check run such as `npm test`, `./gradlew build`, `pytest` or `go vet ./...`. Runs without a person at the prompt (`claude -p`, the Agent SDK) earn nothing.

Each species levels at its Gen 1 growth rate, up to level 100. Level evolutions follow the original games: when your Pokémon reaches the level, the buddy above your prompt announces it and you have about 4 seconds to type `/buddy stop` if you would rather it stayed as it is. The next level-up tries again.

Stones collect in your bag as you reach milestones, and every milestone repeats.

| Stone | Earned by |
| --- | --- |
| Thunder Stone | every 10 fixed checks |
| Fire Stone | every 10 commits |
| Water Stone | every 10 config edits |
| Leaf Stone | each 7-day feeding streak |
| Moon Stone | a turn before 5 am (once a night) |

A stone evolution only happens when you use the stone, so you can keep a Pikachu as long as you like, and Eevee becomes whichever form matches the stone you pick. Kadabra, Machoke, Graveler and Haunter evolve by trade: push or open a PR at level 36 or higher. One Pokémon in 512 is shiny, drawn in its alternate colours with a ★ by its name.

## Settings

Change these in `/config`, or under `pluginConfigs.pokebuddy` in your Claude Code settings.

| Setting | Default | What it does |
| --- | --- | --- |
| `speechModel` | `haiku` | The model for speech and the session judge |
| `speechContext` | `conversation` | `conversation` lets speech react to what you asked and what Claude answered; `facts` sends only counts of what happened |

## Cost and privacy

In an interactive session with speech on, your buddy makes at most one small model call per completed turn, and at most one more when a session starts, only if earlier sessions are waiting to be judged.

With `speechContext` set to `conversation`, the turn's call includes the first 300 characters of your last prompt and the first 300 characters of Claude's answer, along with a short summary of what happened. With `facts`, only the summary is sent: counts of prompts and tool calls, the check commands you ran (for example `npm test`) and whether they passed, and the names of config files you edited. The session judge always gets the summary alone. Prompt and answer text are never saved.

`/buddy quiet` stops every model call: no speech and no session judge.

## Your save

Your save lives on this machine, one per machine. To move it, run `/buddy export` on one machine and `/buddy import` with the copied text on the other.

There is one backup slot, `save.bak`. Import, restore and reset each put the save they replace there, and `/buddy restore` swaps it back. A reset needs `/buddy reset confirm` and works once a day, so a stray command cannot throw your Pokémon away or reroll it for a shiny. If your save ever cannot be read, nothing is overwritten: your buddy goes read-only and a notice tells you to run `/buddy restore` or `/buddy reset confirm`, which is always allowed in that case.

## Uninstall

```
/plugin uninstall pokebuddy
```

Export your save first if you might come back to it.

## Disclaimer and credits

Pokémon names, sprites and Pokédex text are trademarks and copyrights of Nintendo, Game Freak and The Pokémon Company and are not covered by this project's licence. This is an unofficial fan project. Pokédex data and sprites come from [PokeAPI](https://pokeapi.co) and the PokeAPI sprites repository.

Want to help build it? See [CONTRIBUTING.md](CONTRIBUTING.md).
