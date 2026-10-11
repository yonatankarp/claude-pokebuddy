# Contributing

The repository is called claude-pokebuddy because the `claude-` prefix is reserved for plugin names; the plugin itself is `pokebuddy`, and its command is `/buddy`.

## Layout

`hooks/` holds the mod: `register.tsx` wires the hooks, the game rules, save handling and speech sit in their own modules beside it, and `hooks/render/` draws the band. `hooks/data/pokedex.generated.ts` is the baked Pokédex. `types/index.d.ts` is the contract the mod ships, including the `Save` type. `tests/` runs in Claude Code's plugin test kit, and `scripts/` holds the data pipeline with its own Node tests.

## Running the checks

```
npm ci
npm run test:scripts
npx tsc -p tsconfig.scripts.json
npx tsc -p .
claude plugin validate .
claude plugin test .
```

To try your changes in a session, start Claude Code with `--plugin-dir .` from the repository.

## Building the data

The Pokédex data, with the Gen 7 menu icons, is committed. The bake also downloads the Crystal sprites, but only to derive the icons' shiny palettes; it does not emit them. To regenerate it from PokeAPI and the PokeAPI sprites repository:

```
npm run data
```

`npm run check:data` re-bakes and diffs the result, so it needs the raw files that `npm run data` downloads into `scripts/raw/`. The bake refuses to write a generated module over 1,000,000 bytes, because Claude Code does not load a module over 1 MiB.

## CI

CI runs the script tests, the scripts type check, `claude plugin validate .` and `claude plugin test .` on Claude Code 2.1.296. It does not run `check:data` because the raw downloads are not in the repository.
