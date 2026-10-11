# Contributing

The plugin is `pokebuddy` and its command is `/buddy`.

## Layout

The shipped plugin lives in `plugin/`, and the marketplace in `.claude-plugin/marketplace.json` points at it; everything else in the repository is the build workspace and never reaches an install. `plugin/hooks/` holds the mod: `register.tsx` wires the hooks, the game rules, save handling and speech sit in their own modules beside it, and `plugin/hooks/render/` draws the band. `plugin/hooks/data/pokedex.generated.ts` is the baked Pokédex. `plugin/types/index.d.ts` is the contract the mod ships, including the `Save` type. `plugin/tests/` runs in Claude Code's plugin test kit; the tests ship inside `plugin/` because `claude plugin test` scans only the plugin folder, and `scripts/` holds the data pipeline and the screenshot renderer with their own Node tests. `plugin/LICENSE` and `plugin/NOTICE` are copies of the root files, and CI checks that they match.

## Running the checks

```
npm ci
npm run test:scripts
npx tsc -p tsconfig.scripts.json
claude plugin validate --strict plugin
claude plugin validate --strict .
claude plugin test plugin
```

To try your changes in a session, start Claude Code with `--plugin-dir plugin` from the repository.

### Type-checking the plugin

`npx tsc -p .` checks `plugin/hooks/` and `plugin/tests/`, but it needs the `claude-code` types, which Claude Code writes to `plugin/.claude-plugin/types/` (gitignored) each time it loads a plugin from a folder. `validate` and `test` do not write them, and a session that is not logged in stops before it does. So start a logged-in, interactive `claude --plugin-dir plugin` once, quit, then run `npx tsc -p .`. CI has no login, so it cannot type-check `plugin/`; do it locally before opening a PR.

## Screenshots

The images in `docs/images/` are drawn by the band's own code: `npm run screenshots` lays out the band for a few fixed saves the way the terminal would and writes them as SVG. Run it after changing `plugin/hooks/render/` and commit the result.

## Building the data

The Pokédex data, with the Gen 7 menu icons, is committed. The bake also downloads the Crystal sprites, but only to derive the icons' shiny palettes; it does not emit them. To regenerate it from PokeAPI and the PokeAPI sprites repository:

```
npm run data
```

The sprites are fetched from a pinned commit of the sprites repository (`SPRITES_REF` in `scripts/fetch.ts`), and `scripts/sources.json` records that commit and the SHA-256 of every downloaded input. A fetch fails if a file differs from its recorded checksum, so a PokeAPI change cannot slip into the data unnoticed. After bumping the commit or accepting a changed PokeAPI answer, run `npm run fetch -- --update` to rewrite the checksums, then `npm run bake`, and commit both files with the regenerated module. The bake re-verifies `scripts/raw/` against the checksums before it writes anything, and it is otherwise deterministic.

`npm run check:data` re-bakes and diffs the result, so it needs the raw files that `npm run data` downloads into `scripts/raw/`. The bake refuses to write a generated module over 1,000,000 bytes, because Claude Code does not load a module over 1 MiB.

## Releasing

1. Bump `version` in `plugin/.claude-plugin/plugin.json`. It is the only place the version lives; the marketplace entry carries none, which `claude plugin validate --strict .` accepts.
2. Add the version, with the date, to `CHANGELOG.md`.
3. After the change is merged, tag the merge commit `vX.Y.Z` and create a GitHub release from the tag.

## CI

CI runs the script tests, the scripts type check (which includes the screenshot renderer), `claude plugin validate --strict` on the plugin and the marketplace, and `claude plugin test plugin` on Claude Code 2.1.296. It then installs the plugin from the checkout into a throwaway config folder and fails if the install contains `package.json` or `node_modules`. It also re-draws the screenshots and fails if `docs/images/` differs from the render code. A separate, non-required job runs the validation and tests on the latest Claude Code. CI does not run `check:data`, because that needs about 800 downloads from PokeAPI on every run; run it locally after touching the data pipeline.
