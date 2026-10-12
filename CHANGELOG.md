# Changelog

## 1.4.0 (2026-10-12)

- In the desktop app and VS Code your Pokémon idles: its Pokémon Mystery Dungeon idle animation plays wherever the app draws it (above the prompt, the Buddy tab, the box and the Pokédex), breathing, flapping or flickering as it does in the games, and now and then it turns to look the other way. Each one starts at its own point, so a box of them does not move as one. A tall Pokémon is drawn at a smaller scale so it fits, and every box card seats its sprite in the same square, so the cards' names and buttons line up whatever is in the box. The terminal keeps the still icon. The sprites are from PMDCollab SpriteCollab under CC BY-NC 4.0, credited in `SPRITE-CREDITS.md`.
- The Buddy tab in the app is a Game Boy summary screen: the Pokédex's cream screen, the sprite framed, its number and type badges. The level and personality no longer run together (`Lv 11cheerful`).
- Next stones are a line each with an icon per stone, and the bag shows the icons too: a crescent, a flame, a drop, a bolt and a leaf in the app, a ◆ in the stone's colour in the terminal.

## 1.3.0 (2026-10-12)

- In the desktop app and the VS Code extension the `/buddy` panel's Pokédex looks like the device: a red case with the big blue lens and three lights, the list on a cream screen with a Poké Ball by each one caught and every row the same height. Click a caught name to open its entry, or, as on the Game Boy, ▲ and ▼ move a ▶ cursor between the ones you have caught (across pages too), Data opens its entry and ◀ ▶ turn the page, and each entry's sprite framed with its type as a coloured badge. The Box tab is a PC box: a card for each Pokémon with its sprite on a green wallpaper, your buddy's first. The terminal and the phone keep the list layout. The README shows both.

## 1.2.2 (2026-10-12)

- Commits, pushes and PRs count when Claude chains them with other commands. A command like `git commit -m x && git push | tail -3; git log` used to earn nothing, because its exit code belongs to the last part; now the lines git and gh print only on success (`[main 1a2b3c4] …`, `abc..def  main -> main`, the new PR's URL) prove them. Quiet runs (`-q`) print no proof and still count only when the exit code can vouch for them. A failed commit, a push with nothing to send and a PR that already exists still earn nothing.

## 1.2.1 (2026-10-11)

- The `/buddy` panel fits the terminal. In a narrow docked pane the skill bars go under the sprite instead of wrapping beside it, and the box's buttons go under each name. In a short inline pane the Feed, view and Mute buttons come right after the skills, so they are not cut off. The panel also asks for a wider dock, though a width you set yourself still wins.
- The Pokédex tab looks like the Game Boy one: all 151 by number, two columns per page with Prev and Next, ◓ and the name on the ones you have caught and `----------` on the rest. Picking one opens its entry: sprite, number, type, height, weight and text.
- Tabs and buttons show their keys (`1: Buddy`, `f: Feed`) in the terminal. Feed shows "Fed today" once you have fed, stone progress says what counts toward each stone, and a stone you can use has its Use button next to it in the bag.
- The Commands tab is now Help, a list of the typed commands. A mistyped `/buddy` command says it is not a command before the help, and `/buddy` always opens on the Buddy tab.
- The mute key is now `m` instead of `s`, and Stop evolving is on `b`.
- Releasing a Pokémon asks for confirmation on its own row, not at the bottom of the list.
- `/buddy stats` lists stone progress one stone per line.

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
