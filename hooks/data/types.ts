export type PokemonType =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice' | 'fighting' | 'poison'
  | 'ground' | 'flying' | 'psychic' | 'bug' | 'rock' | 'ghost' | 'dragon' | 'steel' | 'fairy' | 'dark'
export type Growth = 'fast' | 'medium-fast' | 'medium-slow' | 'slow'
export type Stone = 'moon-stone' | 'fire-stone' | 'water-stone' | 'thunder-stone' | 'leaf-stone'
export const STONES: readonly Stone[] = ['moon-stone', 'fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone']
export type Evolution =
  | { kind: 'level'; to: number; level: number }
  | { kind: 'stone'; to: number; stone: Stone }
  | { kind: 'trade'; to: number }
/** 4 bits per pixel, row-major, base64. Index 0 is transparent. */
export type Sprite = { w: number; h: number; px: string; palette: readonly string[]; shiny: readonly string[] }
export type Species = {
  id: number
  name: string
  types: readonly PokemonType[]
  /** decimetres, as PokeAPI */
  height: number
  /** hectograms, as PokeAPI */
  weight: number
  dex: string
  growth: Growth
  evolvesFrom: number | null
  evolutions: readonly Evolution[]
  /** The Gen 7 menu icon (40x30 before cropping). */
  icon: Sprite
}
