import type { Elements } from 'claude-code'
import { COMMAND_HELP, evolutionHints, feedStreak, stoneProgress } from '../commands'
import { COMMAND } from '../config'
import { POKEDEX } from '../data/pokedex.generated'
import { species } from '../data/dex'
import { STONES, stoneName } from '../data/types'
import { stoneEvolution } from '../evolution'
import { expForLevel, MAX_LEVEL } from '../exp'
import type { Save } from '../state'
import { buddyArt, expBarTexts, skillColumns, speciesArt } from './band'
import { TYPE_COLOR } from './sprite'

export const PANEL = 'pokebuddy'
export type PanelTab = 'buddy' | 'box' | 'dex' | 'commands'
export type PanelElements = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'> & Partial<Pick<Elements['desktop'], 'Svg'>>
/** The Pokédex tab: the list page it shows, or the entry open over it. */
export type DexView = { page: number; entry: number | null }
/** What the panel draws: the save, the tab, a box entry waiting on a release confirm, the Pokédex, the last action's reply. */
export type PanelView = { save: Save; tab: PanelTab; releasing: number | null; note: string | null; dex: DexView; today: string; columns: number }
/** What a press does: run a `/buddy` sub-command, change tab, ask or drop a release confirm, move in the Pokédex. */
export type PanelActions = {
  run: (args: string) => void; tab: (tab: PanelTab) => void; releasing: (index: number | null) => void; dex: (dex: DexView) => void
}

const TABS: [PanelTab, string][] = [['buddy', 'Buddy'], ['box', 'Box'], ['dex', 'Pokédex'], ['commands', 'Help']]
// A Pokédex page is two columns of 13, as narrow as the docked pane and 151 in six pages.
const DEX_ROWS = 13
const DEX_PAGE = DEX_ROWS * 2
const DEX_PAGES = Math.ceil(POKEDEX.length / DEX_PAGE)
const DEX_RED = '#e3350d'
const dexNo = (id: number) => String(id).padStart(3, '0')
// Body columns under which the terminal stacks what sits side by side: the sprite and the skill bars need about this much.
const NARROW = 56

/** A name as the person sees it: the nickname with the species after it. */
const monName = (m: { species: number; nickname: string | null; isShiny: boolean }) =>
  (m.nickname ? `${m.nickname} (${species(m.species).name})` : species(m.species).name) + (m.isShiny ? ' ★' : '')

/**
 * The /buddy dialog: tabs along the top, the tab's content, the last reply under it. The terminal draws a
 * plain Button as `f: Feed`, so hotkeys show there; the app draws native buttons and needs no key hints.
 */
export function panel(els: PanelElements, view: PanelView, act: PanelActions, isApp: boolean) {
  const { Box, Text, Button } = els
  const isNarrow = !isApp && view.columns < NARROW
  const body = view.tab === 'box' ? boxTab(els, view, act, isNarrow)
    : view.tab === 'dex' ? dexTab(els, view, act, isApp)
    : view.tab === 'commands' ? helpTab(els, isApp, isNarrow)
    : buddyTab(els, view, act, isApp, isNarrow)
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box key="top" flexDirection="row" justifyContent="space-between">
        <Box key="tabs" flexDirection="row" flexWrap="wrap">
          {TABS.map(([tab, label], i) => (
            <Box key={`t-${tab}`} marginRight={2}>
              <Button key={`tab:${tab}`} hotkey={String(i + 1)} plain variant={view.tab === tab ? 'primary' : 'secondary'}
                dimColor={view.tab !== tab} onPress={() => act.tab(tab)}>{label}</Button>
            </Box>
          ))}
        </Box>
        {!isApp && !isNarrow && <Text key="esc" dimColor>Esc to close</Text>}
      </Box>
      <Box key="body" flexDirection="column" marginTop={1}>{body}</Box>
      {view.note && (
        <Box key="note" flexDirection="row" marginTop={1}>
          <Text key="mark" color="#f8d030">› </Text>
          <Text key="text">{view.note}</Text>
        </Box>
      )}
      {isNarrow && <Box key="esc" marginTop={1}><Text dimColor>Esc to close</Text></Box>}
    </Box>
  )
}

function buddyTab(els: PanelElements, { save, today }: PanelView, act: PanelActions, isApp: boolean, isNarrow: boolean) {
  const { Box, Text, Button } = els
  const sp = species(save.species)
  const color = TYPE_COLOR[sp.types[0]!]
  const toNext = save.level >= MAX_LEVEL ? 'max level' : `${expForLevel(sp.growth, save.level + 1) - save.exp} EXP to Lv ${save.level + 1}`
  const streak = feedStreak(save, today)
  const fedToday = save.feed.lastDate === today
  const held = STONES.filter(s => (save.bag[s] ?? 0) > 0)
  const hints = save.evolution ? [`Evolving into ${species(save.evolution.to).name}!`] : evolutionHints(sp)
  const label = (text: string) => <Box key="label" width={13} flexShrink={0}><Text dimColor>{text}</Text></Box>
  return [
    <Box key="top" flexDirection="row">
      <Box key="art" flexDirection="column" flexShrink={0}>{buddyArt(els, save, isApp)}</Box>
      <Box key="facts" flexDirection="column" marginLeft={2}>
        <Box key="name" flexDirection="row">
          <Text key="n" bold>{save.nickname ? `${save.nickname} (${sp.name})` : sp.name}</Text>
          {save.isShiny && <Text key="shiny" color="#f8d030"> ★</Text>}
          <Text key="lv">{`  Lv ${save.level}  `}</Text>
          <Text key="p" dimColor>{save.personality}</Text>
        </Box>
        <Box key="exp" flexDirection={isNarrow ? 'column' : 'row'}>
          {expBarTexts(els, save, 10, color, isApp)}
          <Text key="next" dimColor>{isNarrow ? toNext : `  ${toNext}`}</Text>
        </Box>
        {(hints.length ? hints : ['Does not evolve.']).map(hint => <Text key={hint} color={save.evolution ? color : undefined} dimColor={!save.evolution}>{hint}</Text>)}
        {!isNarrow && <Box key="skills" marginTop={1}>{skillColumns(els, save, color, isApp)}</Box>}
      </Box>
    </Box>,
    // Too narrow for the bars beside the sprite: they go under it, full width.
    ...(isNarrow ? [<Box key="skills" marginTop={1}>{skillColumns(els, save, color, isApp)}</Box>] : []),
    // The buttons come before the bag and stones: an inline pane is short, and what it cuts off should be the reading.
    <Box key="actions" flexDirection="row" flexWrap="wrap" marginTop={1}>
      <Box key="a-feed" marginRight={3}>
        <Button key="feed" hotkey="f" plain variant={fedToday ? 'secondary' : 'primary'} dimColor={fedToday} onPress={() => act.run('feed')}>
          {fedToday ? 'Fed today' : 'Feed'}
        </Button>
      </Box>
      <Box key="a-view" marginRight={3}><Button key="toggle" hotkey="v" plain onPress={() => act.run('toggle')}>{save.view === 'full' ? 'Compact view' : 'Full view'}</Button></Box>
      <Box key="a-speech" marginRight={3}><Button key="quiet" hotkey="m" plain onPress={() => act.run('quiet')}>{save.speechOn ? 'Mute' : 'Unmute'}</Button></Box>
      {save.evolution && <Box key="a-stop" marginRight={3}><Button key="stop" hotkey="b" plain onPress={() => act.run('stop')}>Stop evolving</Button></Box>}
    </Box>,
    <Box key="bag" flexDirection="row" flexWrap="wrap" marginTop={1}>
      {label('Bag')}
      {held.length === 0 && <Text key="empty" dimColor>No stones yet</Text>}
      {held.map(s => (
        <Box key={`s-${s}`} flexDirection="row" marginRight={2}>
          <Text key="t">{`${stoneName(s)} ×${save.bag[s]}`}</Text>
          {stoneEvolution(save.species, s) !== null &&
            <Box key="b" marginLeft={1}><Button key={`use:${s}`} variant="primary" onPress={() => act.run(`use ${s}`)}>Use</Button></Box>}
        </Box>
      ))}
    </Box>,
    <Box key="streak" flexDirection="row">
      {label('Feed streak')}
      <Text key="t">{`${streak} day${streak === 1 ? '' : 's'}`}</Text>
    </Box>,
    <Box key="stones" flexDirection="row">
      {label('Next stones')}
      <Box key="list" flexDirection="row" flexWrap="wrap">
        {stoneProgress(save, today).map(p => (
          <Box key={p.name} flexDirection="row" marginRight={2}>
            <Text key="n">{`${p.name.replace(' Stone', '')} ${p.done}/${p.of}`}</Text>
            <Text key="w" dimColor>{` ${p.work}`}</Text>
          </Box>
        ))}
      </Box>
    </Box>,
  ]
}

function boxTab({ Box, Text, Button }: PanelElements, { save, releasing }: PanelView, act: PanelActions, isNarrow: boolean) {
  return [
    <Box key="active" flexDirection="row">
      <Box key="label" width={8}><Text dimColor>Buddy</Text></Box>
      <Text key="name" bold>{`${monName(save)}  Lv ${save.level}`}</Text>
    </Box>,
    <Box key="head" flexDirection="row" marginTop={1}>
      <Box key="label" width={8}><Text dimColor>Box</Text></Box>
      <Text key="count" dimColor>{save.box.length === 0 ? 'empty' : `${save.box.length} Pokémon`}</Text>
    </Box>,
    ...(save.box.length === 0
      ? [<Text key="empty" dimColor>Wild Pokémon turn up as you work: a fixed check, a commit, a session judged 80+, or every 7th day of a feed streak.</Text>]
      : save.box.map((m, i) => (
        // Narrow, the buttons go on a line of their own under the name.
        <Box key={`m-${i}`} flexDirection={isNarrow ? 'column' : 'row'}>
          <Box key="label" width={isNarrow ? undefined : 30}><Text wrap="truncate-end">{`${i + 1}. ${monName(m)}  Lv ${m.level}`}</Text></Box>
          <Box key="acts" flexDirection="row" marginLeft={isNarrow ? 3 : 0}>{releasing === i ? [
            <Text key="ask" color="#f08030">{isNarrow ? 'Let it go for good? ' : `Let ${m.nickname ?? species(m.species).name} go for good? `}</Text>,
            <Box key="yes" marginRight={1}><Button key="release-yes" variant="primary" onPress={() => { act.releasing(null); act.run(`release ${i + 1} confirm`) }}>Release</Button></Box>,
            <Button key="release-no" onPress={() => act.releasing(null)}>Keep</Button>,
          ] : [
            <Box key="go" marginRight={1}><Button key={`switch:${i}`} dimColor={save.evolution !== null} onPress={() => { act.releasing(null); act.run(`switch ${i + 1}`) }}>Make buddy</Button></Box>,
            <Button key={`release:${i}`} dimColor onPress={() => act.releasing(i)}>Release</Button>,
          ]}</Box>
        </Box>
      ))),
  ]
}

/** The Gen 1 Pokédex: a numbered list, ◓ on the ones caught, and a data page for each of those. */
function dexTab(els: PanelElements, view: PanelView, act: PanelActions, isApp: boolean) {
  return view.dex.entry === null ? dexList(els, view, act) : dexEntry(els, view, act, isApp)
}

function dexList({ Box, Text, Button }: PanelElements, { save, dex }: PanelView, act: PanelActions) {
  const caught = new Set(save.caught)
  const page = Math.min(Math.max(dex.page, 0), DEX_PAGES - 1)
  const ids = POKEDEX.slice(page * DEX_PAGE, (page + 1) * DEX_PAGE).map(s => s.id)
  const cell = (id: number) => caught.has(id)
    ? (
      <Box key={`d-${id}`} flexDirection="row" width={17}>
        <Text key="ball" color={DEX_RED}>◓</Text>
        <Text key="no">{`${dexNo(id)} `}</Text>
        <Button key={`dex:${id}`} plain onPress={() => act.dex({ page, entry: id })}>{species(id).name}</Button>
      </Box>
    )
    : <Box key={`d-${id}`} width={17}><Text dimColor>{` ${dexNo(id)} ----------`}</Text></Box>
  return [
    <Box key="head" flexDirection="row" justifyContent="space-between">
      <Text key="t" bold color={DEX_RED}>POKéDEX</Text>
      <Text key="own">{`OWN ${caught.size}/${POKEDEX.length}`}</Text>
    </Box>,
    <Box key="list" flexDirection="row" marginTop={1}>
      {[0, 1].map(c => (
        <Box key={`c${c}`} flexDirection="column" marginRight={c === 0 ? 2 : 0}>{ids.slice(c * DEX_ROWS, (c + 1) * DEX_ROWS).map(cell)}</Box>
      ))}
    </Box>,
    <Box key="pager" flexDirection="row" marginTop={1}>
      <Box key="prev" marginRight={2}>
        <Button key="dex-prev" hotkey="p" plain dimColor={page === 0} onPress={() => act.dex({ page: Math.max(page - 1, 0), entry: null })}>Prev</Button>
      </Box>
      <Box key="next" marginRight={2}>
        <Button key="dex-next" hotkey="n" plain dimColor={page === DEX_PAGES - 1} onPress={() => act.dex({ page: Math.min(page + 1, DEX_PAGES - 1), entry: null })}>Next</Button>
      </Box>
      <Text key="at" dimColor>{`${dexNo(ids[0]!)}–${dexNo(ids[ids.length - 1]!)}`}</Text>
    </Box>,
  ]
}

function dexEntry(els: PanelElements, { save, dex }: PanelView, act: PanelActions, isApp: boolean) {
  const { Box, Text, Button } = els
  const sp = species(dex.entry!)
  // Prev and Next step through the caught ones, as the original only opens Pokémon it has data on.
  const owned = [...new Set(save.caught)].sort((a, b) => a - b)
  const at = owned.indexOf(sp.id)
  const open = (id: number | undefined) => { if (id !== undefined) act.dex({ page: Math.floor((id - 1) / DEX_PAGE), entry: id }) }
  return [
    <Box key="top" flexDirection="row">
      <Box key="art" flexDirection="column" flexShrink={0}>{speciesArt(els, sp, false, isApp)}</Box>
      <Box key="facts" flexDirection="column" marginLeft={2}>
        <Text key="no" color={DEX_RED}>{`No.${dexNo(sp.id)}`}</Text>
        <Text key="name" bold>{sp.name}</Text>
        <Box key="types" flexDirection="row">
          {sp.types.map(t => <Text key={t} color={TYPE_COLOR[t]}>{`${t.toUpperCase()} `}</Text>)}
        </Box>
        <Text key="ht">{`HT  ${(sp.height / 10).toFixed(1)} m`}</Text>
        <Text key="wt">{`WT  ${(sp.weight / 10).toFixed(1)} kg`}</Text>
      </Box>
    </Box>,
    <Text key="rule" color={DEX_RED} wrap="truncate-end">{'▔'.repeat(40)}</Text>,
    <Text key="text">{sp.dex}</Text>,
    <Box key="pager" flexDirection="row" marginTop={1}>
      <Box key="prev" marginRight={2}><Button key="dex-prev" hotkey="p" plain dimColor={at <= 0} onPress={() => open(owned[at - 1])}>Prev</Button></Box>
      <Box key="back" marginRight={2}><Button key="dex-back" hotkey="b" plain onPress={() => act.dex({ page: dex.page, entry: null })}>List</Button></Box>
      <Box key="next"><Button key="dex-next" hotkey="n" plain dimColor={at === owned.length - 1} onPress={() => open(owned[at + 1])}>Next</Button></Box>
    </Box>,
  ]
}

function helpTab({ Box, Text }: PanelElements, isApp: boolean, isNarrow: boolean) {
  const width = Math.max(...COMMAND_HELP.map(([args]) => args.length)) + COMMAND.length + 4
  return [
    <Text key="head" bold>Typed commands</Text>,
    // Two columns where they fit; a narrow pane puts each about under its command.
    ...COMMAND_HELP.map(([args, about]) => !isNarrow
      ? (
        <Box key={args} flexDirection="row">
          <Box key="c" width={width}><Text>{`/${COMMAND} ${args}`}</Text></Box>
          <Text key="t" dimColor>{about}</Text>
        </Box>
      )
      : (
        <Box key={args} flexDirection="column">
          <Text key="c">{`/${COMMAND} ${args}`}</Text>
          <Box key="t" marginLeft={2}><Text dimColor>{about}</Text></Box>
        </Box>
      )),
    ...(isApp ? [] : [
      <Box key="keys" marginTop={1}><Text dimColor>Keys: 1-4 tabs · a button's letter presses it · Tab/arrows move · Esc closes</Text></Box>,
    ]),
  ]
}

/** Rows the panel asks for inline: the tallest tab's content, so it opens whole. */
export const PANEL_ROWS = 26
/** Columns it asks for docked: the Buddy tab's sprite, facts and skill bars side by side; a third of the screen wraps them. */
export const PANEL_COLUMNS = 64
