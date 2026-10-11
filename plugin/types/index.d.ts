/** The buddy as `$.store` keeps it under `save`. Self-contained: hooks/state.ts imports it from here. */
export type Save = {
  version: 1
  seed: number[]
  species: number
  isShiny: boolean
  personality: 'cheerful' | 'grumpy' | 'sleepy' | 'brave' | 'timid' | 'sassy' | 'curious' | 'proud'
  nickname: string | null
  level: number
  exp: number
  lifetimeExp: number
  expBySource: Partial<Record<'prompt' | 'tool' | 'active' | 'config' | 'commit' | 'push' | 'green' | 'judge' | 'feed', number>>
  bag: Partial<Record<'moon-stone' | 'fire-stone' | 'water-stone' | 'thunder-stone' | 'leaf-stone', number>>
  counters: { greens: number; commits: number; configEdits: number; feedRun: number }
  checks: Record<string, boolean>
  lastMoonDate: string | null
  feed: { lastDate: string | null }
  pendingLog: string[]
  speechOn: boolean
  view: 'compact' | 'full'
  evolution: { to: number } | null
  cancelledAtLevel: number | null
  /** The local day of the last `/buddy reset confirm` (YYYY-MM-DD). Saves from before it read as null. */
  lastResetDate: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'pokebuddy': {
      save: Save | null
      bubble: string | null
      flashUntil: number
    }
  }
}
