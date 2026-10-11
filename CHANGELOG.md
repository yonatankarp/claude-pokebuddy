# Changelog

## 1.2.0 (2026-10-11)

- `/buddy` opens a panel instead of printing text: your Pokémon with its sprite, EXP and skills, your box, the Pokédex and every command as a button, in tabs. Esc closes it. `-p` runs still get text, and a mistyped command opens the Commands tab.
- Catch more Pokémon: wild ones turn up at random as you work (a 1 in 5 chance for each fixed check, 1 in 10 for each commit, 3 in 100 for any turn of tool work, an even chance for a session judged 80 or more) and on every 7th day of a feed streak, at most 3 a day, and join your box.
- `/buddy box`, `/buddy switch <number or name>` and `/buddy release <number> confirm`. Only the active Pokémon earns EXP; skills, stones and the feed streak are yours.
- `/buddy dex` and the Pokédex tab show how many of the 151 you have caught.
- Saves from earlier versions load as they are, with an empty box.

## 1.1.0 (2026-10-11)

- New Pokémon start at level 1 instead of 5. Existing buddies keep their level.
- The terminal draws the skills beside the bubble too, when it is wide enough (about 100 columns).
- In the desktop app the EXP and skill bars use one glyph, so every step is the same width there.
- Removed `/buddy export`, `/buddy import`, `/buddy restore` and `/buddy reset`; they now show the help. A save that cannot be read is kept aside in the store and a new Pokémon appears in its place, instead of the buddy stopping until you run a command.
- The README says how to update without losing your buddy: `claude plugin update`, not uninstall and reinstall, which deletes the save.

## 1.0.2 (2026-10-11)

- The Claude desktop app and the editor count as a person watching: the buddy now speaks, earns EXP, logs turns and judges past sessions there. They host the session through the SDK, so it used to be treated like a headless `-p` run.
- Skills earned from real work: DEBUGGING (checks turned green), SHIPPING (commits, pushes, PRs), HACKING (tool calls), FOCUS (prompts, active time), TINKERING (config edits) and WISDOM (session judge), each 0 to 99. `/buddy stats` lists them with the EXP behind each, in place of the old EXP-by-source list, and the desktop app draws them as bars beside the sprite.

## 1.0.1 (2026-10-11)

- The sprite draws as crisp pixel art (SVG) in the Claude desktop app, the editor and mobile, instead of half-block text that broke up there.

## 1.0.0 (2026-10-11)

First public release.

- A Gen 1 Pokémon above your Claude Code prompt, rolled once per Claude Code config folder, with shinies and rare legendaries, and a welcome toast on the first roll.
- EXP from prompts, tool use, commits, pushes and PRs, fixed checks, config edits, a daily Rare Candy and a per-session score, with per-turn caps. Empty commits and pushes with nothing to send earn nothing.
- Sessions are scored only after they have ended, at the next session start.
- Level, stone and trade evolutions, with the stones earned from coding milestones. A level evolution can be stopped for about 10 seconds, and a big level jump chains evolutions.
- A speech bubble that reacts to each turn. `facts` mode sends counts, short check names such as `npm test` and config file names, never paths, flags or prompt text; `/buddy quiet` stops every model call.
- Save export and import, a backup slot, restore, a guarded once-a-day reset, and clear recovery advice for a damaged save. Imports must be internally consistent.
- The shipped plugin is `plugin/` only; the build workspace never reaches an install.
- On a short terminal the full view gives way to the one-line view.
