import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { MANIFEST, RAW, sha256, type Manifest } from './sources.ts'

// A commit of PokeAPI/sprites, so the sprites cannot change under a re-bake. Bump it deliberately, then run `npm run fetch -- --update`.
const SPRITES_REF = '961f4fcc85b159f9c5fff356356dee1bf9069898'
const SPRITES = `https://raw.githubusercontent.com/PokeAPI/sprites/${SPRITES_REF}/sprites/pokemon/versions/generation-ii/crystal/transparent`
const ICONS = `https://raw.githubusercontent.com/PokeAPI/sprites/${SPRITES_REF}/sprites/pokemon/versions/generation-vii/icons`
const API = 'https://pokeapi.co/api/v2'

const update = process.argv.includes('--update')
const exists = (p: URL) => access(p).then(() => true, () => false)

const known: Manifest = await readFile(MANIFEST, 'utf8').then(JSON.parse, () => ({ spritesRef: SPRITES_REF, files: {} }))
if (!update && known.spritesRef !== SPRITES_REF) throw new Error('scripts/sources.json was made for another sprites commit; run npm run fetch -- --update')
const seen: Record<string, string> = {}

// Every input, downloaded now or already on disk, is checked against the recorded checksum, so a changed PokeAPI answer fails loudly.
async function get(url: string, rel: string, as: 'json' | 'bytes') {
  const to = new URL(rel, RAW)
  let body: Buffer
  if (await exists(to)) body = await readFile(to)
  else {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url)
      if (res.ok) {
        body = as === 'json' ? Buffer.from(JSON.stringify(await res.json())) : Buffer.from(await res.arrayBuffer())
        break
      }
      if (attempt === 3) throw new Error(`${res.status} for ${url}`)
      await new Promise(r => setTimeout(r, 1000 * attempt))
    }
    await writeFile(to, body)
  }
  const sum = sha256(body)
  seen[rel] = sum
  if (!update && known.files[rel] !== sum) throw new Error(`${rel} does not match scripts/sources.json (${known.files[rel] ?? 'unrecorded'} vs ${sum}); run npm run fetch -- --update if the change is intended`)
}

await mkdir(new URL('sprites/shiny/', RAW), { recursive: true })
await mkdir(new URL('icons/', RAW), { recursive: true })
await mkdir(new URL('species/', RAW), { recursive: true })
await mkdir(new URL('pokemon/', RAW), { recursive: true })
await mkdir(new URL('chains/', RAW), { recursive: true })

for (let id = 1; id <= 151; id++) {
  await get(`${SPRITES}/${id}.png`, `sprites/${id}.png`, 'bytes')
  await get(`${SPRITES}/shiny/${id}.png`, `sprites/shiny/${id}.png`, 'bytes')
  await get(`${ICONS}/${id}.png`, `icons/${id}.png`, 'bytes')
  await get(`${API}/pokemon-species/${id}/`, `species/${id}.json`, 'json')
  await get(`${API}/pokemon/${id}/`, `pokemon/${id}.json`, 'json')
  const species = JSON.parse(await readFile(new URL(`species/${id}.json`, RAW), 'utf8'))
  const chainId = Number(String(species.evolution_chain.url).split('/').filter(Boolean).pop())
  await get(species.evolution_chain.url, `chains/${chainId}.json`, 'json')
  process.stdout.write(`\r${id}/151`)
}
process.stdout.write('\n')

if (update) {
  const files = Object.fromEntries(Object.entries(seen).sort(([a], [b]) => (a < b ? -1 : 1)))
  await writeFile(MANIFEST, JSON.stringify({ spritesRef: SPRITES_REF, files }, null, 1) + '\n')
  console.log(`recorded ${Object.keys(files).length} checksums in scripts/sources.json`)
}
