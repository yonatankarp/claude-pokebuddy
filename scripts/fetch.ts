import { access, mkdir, readFile, writeFile } from 'node:fs/promises'

const RAW = new URL('./raw/', import.meta.url)
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-ii/crystal/transparent'
const ICONS = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-vii/icons'
const API = 'https://pokeapi.co/api/v2'

const exists = (p: URL) => access(p).then(() => true, () => false)

async function get(url: string, to: URL, as: 'json' | 'bytes') {
  if (await exists(to)) return
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url)
    if (res.ok) {
      const body = as === 'json' ? Buffer.from(JSON.stringify(await res.json())) : Buffer.from(await res.arrayBuffer())
      await writeFile(to, body)
      return
    }
    if (attempt === 3) throw new Error(`${res.status} for ${url}`)
    await new Promise(r => setTimeout(r, 1000 * attempt))
  }
}

await mkdir(new URL('sprites/shiny/', RAW), { recursive: true })
await mkdir(new URL('icons/', RAW), { recursive: true })
await mkdir(new URL('species/', RAW), { recursive: true })
await mkdir(new URL('pokemon/', RAW), { recursive: true })
await mkdir(new URL('chains/', RAW), { recursive: true })

for (let id = 1; id <= 151; id++) {
  await get(`${SPRITES}/${id}.png`, new URL(`sprites/${id}.png`, RAW), 'bytes')
  await get(`${SPRITES}/shiny/${id}.png`, new URL(`sprites/shiny/${id}.png`, RAW), 'bytes')
  await get(`${ICONS}/${id}.png`, new URL(`icons/${id}.png`, RAW), 'bytes')
  await get(`${API}/pokemon-species/${id}/`, new URL(`species/${id}.json`, RAW), 'json')
  await get(`${API}/pokemon/${id}/`, new URL(`pokemon/${id}.json`, RAW), 'json')
  const species = JSON.parse(await readFile(new URL(`species/${id}.json`, RAW), 'utf8'))
  const chainId = Number(String(species.evolution_chain.url).split('/').filter(Boolean).pop())
  await get(species.evolution_chain.url, new URL(`chains/${chainId}.json`, RAW), 'json')
  process.stdout.write(`\r${id}/151`)
}
process.stdout.write('\n')
