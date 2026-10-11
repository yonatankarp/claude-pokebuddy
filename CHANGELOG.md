# Changelog

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
