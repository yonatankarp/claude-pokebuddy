# Collection and the /buddy panel

Status: built in 1.2.0 (2026-10-11); "As built" at the end lists where the build differs from this draft. Builds on [the original design](2026-10-11-pokebuddy-design.md).

## Why

- People get one random Pokémon and are stuck with it. "I hate my Pokémon" has no answer since `/buddy reset` was removed in 1.1.0.
- Collecting is the core of Pokémon, and filling the 151-entry Pokédex gives a long-term goal.
- `/buddy` prints plain text into the transcript. It should open a panel like `/usage`.

## 1. The /buddy panel

`/buddy` with no arguments opens a dialog: a pane opened with `focus`, `closeOnEscape` and `holdToasts`, sized to its content with `rows`. It takes the keyboard, Tab and the arrow keys move between buttons, and Esc closes it. Four tabs, switched with the buttons along the top or the number keys:

```
╭─ pokebuddy ──────────────────────────────────────────────────────────╮
│  [1 Buddy]   2 Box   3 Pokédex   4 Commands                          │
│                                                                      │
│   ▄▄██▄       CUBONE  Lv 6  timid                                    │
│  ██▀▀██▄      ▰▰▰▰▰▱▱▱  41 EXP to Lv 7                               │
│  ▀█▄▄█▀█      Evolves into MAROWAK at Lv 28                          │
│   ▀▀ ▀▀                                                              │
│               DEBUGGING  ▰▰▰▰▱▱▱▱▱▱  42    SHIPPING   ▰▰▱▱▱▱▱▱▱▱  20 │
│               HACKING    ▰▰▰▰▰▰▰▱▱▱  70    FOCUS      ▰▰▰▰▰▱▱▱▱▱  50 │
│               TINKERING  ▰▰▱▱▱▱▱▱▱▱  20    WISDOM     ▰▰▰▱▱▱▱▱▱▱  30 │
│                                                                      │
│   Bag: Thunder Stone ×1        Feed streak: 3 days                   │
│   Next stones: Thunder 4/10 · Fire 7/10 · Water 1/10 · Leaf 3/7       │
│                                                                      │
│   ( Feed )  ( Switch view )  ( Speech: on )             Esc to close │
╰──────────────────────────────────────────────────────────────────────╯
```

- **Buddy:** the active Pokémon's sprite (half-blocks in the terminal, SVG in the app), level, EXP, evolution hint, skills, bag, stone progress and feed streak. Buttons: Feed, Switch view, Speech on/off, and Use stone when the bag holds one this species can use.
- **Box:** every caught Pokémon as a grid of small icons with name and level; the active one marked. Enter or a click makes one active. Release is behind a confirm step.
- **Pokédex:** caught and seen counts (`Caught 12 / 151`), a grid of the 151 with uncaught ones as dark silhouettes, and the entry text for the one selected.
- **Commands:** each command with a one-line description and a button that runs it. This replaces the plain help text.

The text commands stay (`/buddy feed`, `/buddy dex pikachu`, `/buddy switch 3`) for quick use, headless runs and surfaces that do not draw panes. Unknown subcommands open the panel on the Commands tab instead of printing help.

## 2. Collection

### The box

- The save holds a **box** of caught Pokémon and which one is **active**. Each Pokémon keeps its own species, level, EXP, shiny flag, nature, nickname, evolution state and cancelled level.
- The trainer keeps everything else: bag, counters, checks, feed streak, the skills (EXP by source), the log and settings.
- **EXP goes to the active Pokémon only**, as in the games, so choosing who to train matters. The skills grow from all work regardless of who is active.
- No box limit. Release is allowed for any Pokémon except the last one.

### Encounters

A wild Pokémon appears on real milestones, never per turn, so it stays rare and earned:

| Milestone | Encounter |
| --- | --- |
| Every 5th fixed check | 1 |
| Every 10th commit | 1 |
| A finished session judged 80 or more | 1 |
| A 7-day feed streak | 1, with double the shiny chance |

- Catching is automatic: a toast says "A wild GASTLY appeared! Caught it." and the Pokédex marks it caught.
- Species come from the existing weighted table (base forms, legendaries at 0.02), with the 1 in 512 shiny chance. Duplicates are allowed.
- At most 3 encounters a day, so a big refactor session does not flood the box.

### Pokédex

- **Seen:** every species that appeared, including evolutions reached. **Caught:** every species in the box, now or ever (releasing does not un-catch).
- `/buddy dex` and the panel show `Caught n / 151`.

## 3. Save version 2

- `version: 2`. A version 1 save converts on load: its Pokémon becomes the only one in the box, active, and is marked caught.
- A version 1 build reading a version 2 save treats it as "from a newer version" and pauses until updated; it never replaces it.
- The convert step has its own tests, including a mid-evolution save and a save with a `lastResetDate` from before 1.1.0.

## 4. Out of scope

Battles, trading between people, party limits, Poké Balls and catch chances, move sets, held items. Each is large and none is needed for collect-and-switch.

## Open questions (defaults in bold)

1. Should a re-roll come back, for example "release your only Pokémon to get a random new one", or **no: the box is the answer**?
2. Encounter rates: **the table above**, or more frequent?
3. Should the band show a small "caught" flash when an encounter happens, **yes for 3 seconds**?
4. Open the panel from bare `/buddy` (**yes**), or keep bare `/buddy` as text and add `/buddy panel`?

## As built (1.2.0)

- **No version 2.** The save stays at version 1 and only gains keys: the active Pokémon keeps today's top-level fields, and `box`, `caught` and `encounters` are new. 1.1.0 ignores unknown keys and keeps them when it writes, so an older build still runs your buddy and leaves the box alone. A version bump would have made 1.1.0 pause instead.
- **A bad box entry is dropped, not fatal.** One unreadable box entry never costs the active Pokémon or the rest of the box.
- **Caught only, no "seen".** Every encounter is caught at once, so the two would always match. `caught` is rebuilt on every load from the active and boxed species, which counts evolutions without a write of their own.
- **Box tab is a list,** with Make buddy and Release buttons per row (Release asks first), not a grid of icons.
- **Pokédex tab is a grid of numbers,** caught ones bright, plus the caught names; entries stay on `/buddy dex <name>`.
- **No switch while evolving:** the evolution finishes or is stopped first, so it never moves to the wrong Pokémon.
- Open questions went with their defaults: no re-roll, the encounter table as drafted, a band flash on a catch, and bare `/buddy` opens the panel.

