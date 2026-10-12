import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export const RAW = new URL('./raw/', import.meta.url)
export const MANIFEST = new URL('./sources.json', import.meta.url)
export type Manifest = { spritesRef: string; pmdRef: string; files: Record<string, string> }

export const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

/** Fails unless every input recorded in scripts/sources.json is in scripts/raw/ with the recorded checksum. */
export async function verifyRaw() {
  const manifest: Manifest = JSON.parse(await readFile(MANIFEST, 'utf8'))
  for (const [rel, sum] of Object.entries(manifest.files)) {
    const body = await readFile(new URL(rel, RAW)).catch(() => null)
    if (!body) throw new Error(`${rel} is missing from scripts/raw/; run npm run fetch`)
    if (sha256(body) !== sum) throw new Error(`${rel} does not match scripts/sources.json; delete scripts/raw/ and run npm run fetch to download it again, or run npm run fetch -- --update if the change is intended`)
  }
}
