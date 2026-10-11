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
/** Like Sprite's pixels, but each frame's 4-bit values are run-length coded (rleEncode) before base64. */
export type Frames = { w: number; h: number; px: readonly string[] }
/** One step of a Crystal pic animation: show frame `frame` for `ticks` Crystal ticks. */
export type AnimStep = { frame: number; ticks: number }
export type SpeciesData = {
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
  /** The Crystal battle sprite. */
  sprite: Sprite
  /** The Gen 7 menu icon (40x30 before cropping), for bands too short for the sprite. */
  icon: Sprite
}
export type Animation = {
  /**
   * The Crystal animation frames, all cropped to one box so they stay aligned and drawn with
   * `sprite.palette` or `sprite.shiny`. Frame 0 is the base pose.
   */
  frames: Frames
  /** The Crystal pic animations, loops unrolled: `intro` as the Pokémon appears, `idle` while it waits. */
  anim: { intro: readonly AnimStep[]; idle: readonly AnimStep[] }
}
/** pokedex.generated.ts and animation.generated.ts hold the two halves: each file stays under the loader's 1 MiB. */
export type Species = SpeciesData & Animation
