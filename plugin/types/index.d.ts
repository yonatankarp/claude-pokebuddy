/** A caught Pokémon waiting in the box: what the active one keeps of its own, minus an evolution in progress. */
export type Mon = {
  species: number
  isShiny: boolean
  personality: 'cheerful' | 'grumpy' | 'sleepy' | 'brave' | 'timid' | 'sassy' | 'curious' | 'proud'
  nickname: string | null
  level: number
  exp: number
  /** EXP this Pokémon earned, all-time and by source (its skills). Box entries from before them read as 0 and {}. */
  lifetimeExp: number
  expBySource: Partial<Record<'prompt' | 'tool' | 'active' | 'config' | 'commit' | 'push' | 'green' | 'judge' | 'feed', number>>
}

/**
 * The buddy as `$.store` keeps it under `save`. Self-contained: hooks/state.ts imports it from here.
 * The top-level Pokémon fields are the active Pokémon; `box` holds the others.
 */
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
  /** Sessions that ended (session.end) with lines still in pendingLog, to judge. Saves from before it read as []. */
  finishedSessions: string[]
  /** The caught Pokémon not active. Saves from before it read as []. */
  box: Mon[]
  /** Every species caught, now or ever, by Pokédex number. Saves from before it read as the ones they hold. */
  caught: number[]
  /** Wild Pokémon met on the local day `date`, to cap them per day. Saves from before it read as none. */
  encounters: { date: string | null; count: number }
}

declare module 'claude-code' {
  interface PluginState {
    'pokebuddy': {
      save: Save | null
      bubble: string | null
      flashUntil: number
      panelTab: 'buddy' | 'box' | 'dex' | 'commands'
      releasing: number | null
      panelNote: string | null
      /** The Pokédex tab: the list page it shows, or the entry open over it, and on the app's case the one its cursor is on. */
      dex: { page: number; entry: number | null; cursor?: number }
    }
  }
}
