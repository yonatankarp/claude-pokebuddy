import type { Elements } from 'claude-code'
import { evolutionHints, feedStreak } from '../commands'
import { POKEDEX } from '../data/pokedex.generated'
import { species } from '../data/dex'
import { STONES, stoneName } from '../data/types'
import { stoneEvolution } from '../evolution'
import { expForLevel, MAX_LEVEL } from '../exp'
import type { Save } from '../state'
import { buddyArt, expBarTexts, skillColumns } from './band'
import { TYPE_COLOR } from './sprite'

export const PANEL = 'pokebuddy'
export type PanelTab = 'buddy' | 'box' | 'dex' | 'commands'
export type PanelElements = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'> & Partial<Pick<Elements['desktop'], 'Svg'>>
/** What the panel draws: the save, the tab, a box entry waiting on a release confirm, the last action's reply. */
export type PanelView = { save: Save; tab: PanelTab; releasing: number | null; note: string | null; today: string }
/** What a press does: run a `/buddy` sub-command, change tab, ask or drop a release confirm. */
export type PanelActions = { run: (args: string) => void; tab: (tab: PanelTab) => void; releasing: (index: number | null) => void }

const TABS: [PanelTab, string][] = [['buddy', 'Buddy'], ['box', 'Box'], ['dex', 'Pokédex'], ['commands', 'Commands']]
// Pokédex numbers a row of the grid holds.
const DEX_ROW = 15

/** The /buddy dialog: tabs along the top, the tab's content, the last reply at the bottom. */
export function panel(els: PanelElements, view: PanelView, act: PanelActions, isApp: boolean) {
  const { Box, Text, Button } = els
  const body = view.tab === 'box' ? boxTab(els, view, act)
    : view.tab === 'dex' ? dexTab(els, view)
    : view.tab === 'commands' ? commandsTab(els, view, act)
    : buddyTab(els, view, act, isApp)
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box key="tabs" flexDirection="row">
        {TABS.map(([tab, label], i) => (
          <Box key={`t-${tab}`} marginRight={1}>
            <Button key={`tab:${tab}`} hotkey={String(i + 1)} variant={view.tab === tab ? 'primary' : 'secondary'} onPress={() => act.tab(tab)}>{label}</Button>
          </Box>
        ))}
      </Box>
      <Box key="body" flexDirection="column" marginTop={1}>{body}</Box>
      {view.note && <Box key="note" marginTop={1}><Text dimColor>{view.note}</Text></Box>}
      <Box key="hint" marginTop={1}><Text dimColor>Esc to close</Text></Box>
    </Box>
  )
}

function buddyTab(els: PanelElements, { save, today }: PanelView, act: PanelActions, isApp: boolean) {
  const { Box, Text, Button } = els
  const sp = species(save.species)
  const color = TYPE_COLOR[sp.types[0]!]
  const toNext = save.level >= MAX_LEVEL ? 'max level' : `${expForLevel(sp.growth, save.level + 1) - save.exp} EXP to Lv ${save.level + 1}`
  const c = save.counters
  const streak = feedStreak(save, today)
  const bag = STONES.filter(s => save.bag[s]).map(s => `${stoneName(s)} ×${save.bag[s]}`).join(', ') || 'empty'
  const usable = STONES.filter(s => (save.bag[s] ?? 0) > 0 && stoneEvolution(save.species, s) !== null)
  const hints = save.evolution ? [`Evolving into ${species(save.evolution.to).name}!`] : evolutionHints(sp)
  return [
    <Box key="top" flexDirection="row">
      <Box key="art" flexDirection="column">{buddyArt(els, save, isApp)}</Box>
      <Box key="facts" flexDirection="column" marginLeft={2}>
        <Box key="name" flexDirection="row">
          <Text bold>{save.nickname ? `${save.nickname} (${sp.name})` : sp.name}</Text>
          {save.isShiny && <Text color="#f8d030"> ★</Text>}
          <Text>{`  Lv ${save.level}  `}</Text>
          <Text dimColor>{save.personality}</Text>
        </Box>
        <Box key="exp" flexDirection="row">
          {expBarTexts(els, save, 10, color, isApp)}
          <Text dimColor>{`  ${toNext}`}</Text>
        </Box>
        {(hints.length ? hints : ['Does not evolve.']).map(hint => <Text key={hint} dimColor>{hint}</Text>)}
        <Box key="skills" marginTop={1}>{skillColumns(els, save, color, isApp)}</Box>
      </Box>
    </Box>,
    <Box key="bag" flexDirection="column" marginTop={1}>
      <Text>{`Bag: ${bag}    Feed streak: ${streak} day${streak === 1 ? '' : 's'}`}</Text>
      <Text dimColor>{`Next stones: Thunder ${c.greens % 10}/10 · Fire ${c.commits % 10}/10 · Water ${c.configEdits % 10}/10 · Leaf ${streak % 7}/7`}</Text>
    </Box>,
    <Box key="actions" flexDirection="row" marginTop={1}>
      <Box key="a-feed" marginRight={1}><Button key="feed" hotkey="f" variant="primary" onPress={() => act.run('feed')}>Feed</Button></Box>
      <Box key="a-view" marginRight={1}><Button key="toggle" hotkey="v" onPress={() => act.run('toggle')}>{save.view === 'full' ? 'Compact view' : 'Full view'}</Button></Box>
      <Box key="a-speech" marginRight={1}><Button key="quiet" hotkey="s" onPress={() => act.run('quiet')}>{save.speechOn ? 'Speech: on' : 'Speech: off'}</Button></Box>
      {save.evolution && <Box key="a-stop" marginRight={1}><Button key="stop" onPress={() => act.run('stop')}>Stop evolving</Button></Box>}
      {usable.map(s => <Box key={`a-${s}`} marginRight={1}><Button key={`use:${s}`} onPress={() => act.run(`use ${s}`)}>{`Use ${stoneName(s)}`}</Button></Box>)}
    </Box>,
  ]
}

function boxTab({ Box, Text, Button }: PanelElements, { save, releasing }: PanelView, act: PanelActions) {
  const name = (m: { species: number; nickname: string | null }) => m.nickname ? `${m.nickname} (${species(m.species).name})` : species(m.species).name
  const pending = releasing === null ? undefined : save.box[releasing]
  return [
    <Text key="active">{`Buddy: ${name(save)}${save.isShiny ? ' ★' : ''}  Lv ${save.level}`}</Text>,
    ...(save.box.length === 0
      ? [<Text key="empty" dimColor>The box is empty. Wild Pokémon turn up as you work: every 5 fixed checks, every 10 commits, a session judged 80+ or a 7-day feed streak.</Text>]
      : save.box.map((m, i) => (
        <Box key={`m-${i}`} flexDirection="row" marginTop={i === 0 ? 1 : 0}>
          <Box key="label" width={28}><Text>{`${i + 1}. ${name(m)}${m.isShiny ? ' ★' : ''}  Lv ${m.level}`}</Text></Box>
          <Box key="go" marginRight={1}><Button key={`switch:${i}`} onPress={() => act.run(`switch ${i + 1}`)}>Make buddy</Button></Box>
          <Button key={`release:${i}`} onPress={() => act.releasing(i)}>Release</Button>
        </Box>
      ))),
    ...(pending && releasing !== null ? [
      <Box key="confirm" flexDirection="row" marginTop={1}>
        <Text key="ask" color="#f08030">{`Let ${name(pending)} (Lv ${pending.level}) go for good?  `}</Text>
        <Box key="yes" marginRight={1}><Button key="release-yes" variant="primary" onPress={() => { act.releasing(null); act.run(`release ${releasing + 1} confirm`) }}>Release</Button></Box>
        <Button key="release-no" onPress={() => act.releasing(null)}>Keep</Button>
      </Box>,
    ] : []),
  ]
}

function dexTab({ Box, Text }: PanelElements, { save }: PanelView) {
  const caught = new Set(save.caught)
  const rows: number[][] = []
  for (let i = 0; i < POKEDEX.length; i += DEX_ROW) rows.push(POKEDEX.slice(i, i + DEX_ROW).map(s => s.id))
  return [
    <Text key="count" bold>{`Caught ${caught.size} / ${POKEDEX.length}`}</Text>,
    <Box key="grid" flexDirection="column" marginTop={1}>
      {rows.map((row, r) => (
        <Box key={`r-${r}`} flexDirection="row">
          {row.map(id => <Text key={`d-${id}`} bold={caught.has(id)} dimColor={!caught.has(id)}>{`${String(id).padStart(3, '0')} `}</Text>)}
        </Box>
      ))}
    </Box>,
    <Text key="names" dimColor>{[...caught].sort((a, b) => a - b).map(id => species(id).name).join(', ')}</Text>,
    <Text key="more" dimColor>{'Entries: /buddy dex <name or number>'}</Text>,
  ]
}

function commandsTab({ Box, Text, Button }: PanelElements, { save }: PanelView, act: PanelActions) {
  const row = (key: string, label: string, args: string, about: string) => (
    <Box key={key} flexDirection="row">
      <Box key="b" width={18}><Button key={`cmd:${key}`} onPress={() => act.run(args)}>{label}</Button></Box>
      <Text key="t" dimColor>{about}</Text>
    </Box>
  )
  const typed: [string, string][] = [
    ['/buddy dex <name or number>', 'A Pokédex entry'],
    ['/buddy use <stone>', 'Evolve with a stone from your bag'],
    ['/buddy nickname <name>', 'Set a nickname, or clear it with no name'],
    ['/buddy switch <number or name>', 'Make a Pokémon from the box your buddy'],
    ['/buddy release <number> confirm', 'Let a Pokémon from the box go'],
  ]
  return [
    row('feed', 'Feed', 'feed', 'A Rare Candy, once a day'),
    row('toggle', 'Switch view', 'toggle', `Full view or compact line (now ${save.view})`),
    row('quiet', 'Speech on/off', 'quiet', `Speech and the session judge (now ${save.speechOn ? 'on' : 'off'})`),
    row('stop', 'Stop evolving', 'stop', 'Cancel an evolution in progress'),
    <Box key="typed" flexDirection="column" marginTop={1}>
      <Text key="h" bold>Typed commands</Text>
      {typed.map(([cmd, about]) => (
        <Box key={cmd} flexDirection="row">
          <Box key="c" width={34}><Text>{cmd}</Text></Box>
          <Text key="t" dimColor>{about}</Text>
        </Box>
      ))}
    </Box>,
  ]
}

/** Rows the panel asks for inline: the tallest tab's content, so it opens whole. */
export const PANEL_ROWS = 26
