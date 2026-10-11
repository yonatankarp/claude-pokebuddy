import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptOrigin, Register, ToolCallResult } from 'claude-code'
import { dexText, helpText, parseArgs, parseStone, statsText } from './commands'
import { COMMAND, EVOLVE_MS, FLASH_MS, PENDING_LOG_MAX } from './config'
import { findSpecies, species } from './data/dex'
import { applyExp, applyTurn, cancelEvolution, feed, finishEvolution, useStone, type GameEvent } from './game'
import { judge } from './judge'
import { localTime, readOffset } from './localtime'
import { band } from './render/band'
import { signalsFromTool } from './signals'
import { speak, turnFacts } from './speech'
import { exportBlob, freshSave, importBlob, parseSave, type Save } from './state'
import { emptyTally, scoreTally, type Tally } from './tally'

const saveAtom = atom({ plugin: 'pokebuddy', key: 'save' } as const, null)
const bubbleAtom = atom({ plugin: 'pokebuddy', key: 'bubble' } as const, null)
const flashAtom = atom({ plugin: 'pokebuddy', key: 'flashUntil' } as const, 0)
const readOnlyAtom = atom({ plugin: 'pokebuddy', key: 'readOnly' } as const, false)

const WINDOW_MS = 10 * 60 * 1000
const READ_ONLY = 'Your pokebuddy save is from a newer version of the mod. Update the mod; nothing was changed.'

export function shouldHandleTurn(e: { agentId?: string; isAborted: boolean }): boolean {
  return e.agentId === undefined
}

export function countsAsPrompt(e: { text: string; origin: PromptOrigin }): boolean {
  return e.origin.kind !== 'plugin' && !e.text.trimStart().startsWith('/')
}

function failed(ran: ToolCallResult): boolean {
  return ran.deny !== undefined || ran.isError === true
}

/** Reads the save fresh from the store. null when it is from a newer version. */
async function loadFresh($: EngineInterface): Promise<Save | null> {
  const raw = await $.store.get('save')
  const parsed = parseSave(raw)
  if (parsed.kind === 'future') {
    await update($, readOnlyAtom, () => true)
    return null
  }
  if (parsed.kind === 'ok') return parsed.save
  if (parsed.kind === 'corrupt') await $.store.set('save.bak', raw as never)
  const seed = Array.from(crypto.getRandomValues(new Uint32Array(4)))
  const save = freshSave(seed)
  await $.store.set('save', save)
  if (parsed.kind === 'corrupt') $.ui.toast('Your pokebuddy save was damaged. It was backed up as save.bak and a new Pokémon was rolled.')
  return save
}

/** Read fresh, change, write back, refresh the drawing copy. */
async function mutate<T>($: EngineInterface, change: (s: Save) => { save: Save; events?: readonly GameEvent[] } & T): Promise<(T & { save: Save }) | null> {
  const cur = await loadFresh($)
  if (!cur) return null
  const r = change(cur)
  await $.store.set('save', r.save)
  await update($, saveAtom, () => r.save)
  if (r.events?.length) await announce($, r.events, r.save)
  return r
}

async function announce($: EngineInterface, events: readonly GameEvent[], save: Save) {
  for (const ev of events) {
    if (ev.kind === 'level') $.ui.toast(`${save.nickname ?? species(save.species).name} grew to Lv ${ev.level}!`)
    if (ev.kind === 'stone') $.ui.toast(`You found a ${ev.stone.replace('-', ' ').toUpperCase()}!`)
    if (ev.kind === 'evolved') $.ui.toast(`Congratulations! ${species(ev.from).name} evolved into ${species(ev.to).name}!`)
    if (ev.kind === 'max') $.ui.toast('Level 100!')
  }
  if (events.some(e => e.kind === 'level' || e.kind === 'evolved' || e.kind === 'evolving')) {
    const now = await $.clock.now()
    await update($, flashAtom, () => now + FLASH_MS)
    $.clock.after(FLASH_MS + 50, () => $.ui.invalidate('ui.render'))
  }
  if (events.some(e => e.kind === 'evolving')) {
    $.clock.after(EVOLVE_MS, () => mutate($, s => finishEvolution(s)))
  }
}

/** The loader follows `$` only into this file, so the pure modules get a client that spells each call out. */
function clients($: EngineInterface) {
  return {
    process: { run: (...a: Parameters<EngineInterface['process']['run']>) => $.process.run(...a) },
    model: { complete: (...a: Parameters<EngineInterface['model']['complete']>) => $.model.complete(...a) },
  }
}

export const register: Register = (on, options) => {
  const model = String(options.speechModel ?? 'haiku')
  let tally: Tally = emptyTally()
  let lastWindow = -1
  let offset: number | null = null

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'buddy', description: 'Your Gen 1 Pokémon buddy: stats, dex, feed, evolve' })
    offset = await readOffset(clients($))
    // A reload or exit inside the evolution window drops its timer; finish it now.
    const loaded = await mutate($, s => (s.evolution ? finishEvolution(s) : { save: s }))
    // Take the pending log first, then score it, so a second session cannot judge the same turns.
    let taken: string[] = []
    if (loaded && loaded.save.pendingLog.length > 0) {
      await mutate($, s => {
        taken = s.pendingLog
        return { save: { ...s, pendingLog: [] } }
      })
    }
    if (taken.length > 0) {
      $.clock.after(0, async () => {
        const score = await judge(clients($), model, taken)
        if (score === null) return
        await mutate($, s => applyExp(s, { judge: score }))
        $.ui.toast(`Last session judged ${score}/100: +${score} EXP`)
      })
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (countsAsPrompt(e)) {
      tally.prompts++
      const window = Math.floor((await $.clock.now()) / WINDOW_MS)
      if (window !== lastWindow) { tally.activeWindows++; lastWindow = window }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    try {
      tally.signals.push(...signalsFromTool(String(e.tool), e as unknown as Record<string, unknown>, failed(ran)))
    } catch {}
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!shouldHandleTurn(e)) return result
    const turn = tally
    tally = emptyTally()
    const local = localTime(await $.clock.now(), offset)
    const facts = turnFacts(turn.signals, turn.prompts)
    const r = await mutate($, s => {
      const applied = applyTurn(s, scoreTally(turn, s.checks), local)
      return { ...applied, save: { ...applied.save, pendingLog: [...applied.save.pendingLog, facts].slice(-PENDING_LOG_MAX) } }
    })
    if (r?.save.speechOn) {
      const save = r.save
      $.clock.after(0, async () => {
        const line = await speak(clients($), model, save, facts)
        await update($, bubbleAtom, () => line)
      })
    }
    return result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'buddy' }, async ($, e) => {
    const { sub, rest } = parseArgs(e.args)
    if (sub === 'help') return { text: helpText(COMMAND) }
    if (sub === 'dex' && rest) {
      const s = findSpecies(rest)
      return { text: s ? dexText(s, false) : `No Gen 1 Pokémon called "${rest}".` }
    }
    const local = localTime(await $.clock.now(), offset)
    switch (sub) {
      case 'stats': {
        const s = await loadFresh($)
        if (s) await update($, saveAtom, () => s)
        return { text: s ? statsText(s) : READ_ONLY }
      }
      case 'dex': {
        const s = await loadFresh($)
        return { text: s ? dexText(species(s.species), true) : READ_ONLY }
      }
      case 'feed': {
        const r = await mutate($, s => feed(s, local))
        if (!r) return { text: READ_ONLY }
        const name = species(r.save.species).name
        if (!r.fed) return { text: `${name} has already eaten today. Come back tomorrow.` }
        const days = r.save.counters.feedRun
        return { text: `You fed ${name} a Rare Candy. +${r.gained} EXP. Streak: ${days} day${days === 1 ? '' : 's'}.` }
      }
      case 'use': {
        const stone = parseStone(rest)
        if (!stone) return { text: 'Which stone? moon, fire, water, thunder or leaf.' }
        let from = 0
        const r = await mutate($, s => { from = s.species; return useStone(s, stone) })
        if (!r) return { text: READ_ONLY }
        if (r.error) return { text: r.error }
        return { text: `${species(from).name} evolved into ${species(r.save.species).name}!` }
      }
      case 'stop': {
        const r = await mutate($, s => cancelEvolution(s))
        if (!r) return { text: READ_ONLY }
        return { text: r.cancelled ? `Huh? ${species(r.save.species).name} stopped evolving!` : 'Nothing is evolving right now.' }
      }
      case 'toggle': {
        const r = await mutate($, s => ({ save: { ...s, view: s.view === 'full' ? 'compact' as const : 'full' as const } }))
        return { text: r ? `Showing the ${r.save.view} view.` : READ_ONLY }
      }
      case 'quiet': {
        const r = await mutate($, s => ({ save: { ...s, speechOn: !s.speechOn } }))
        if (!r) return { text: READ_ONLY }
        if (!r.save.speechOn) await update($, bubbleAtom, () => null)
        return { text: r.save.speechOn ? 'Speech is on.' : 'Speech is off. No model calls will be made for reactions.' }
      }
      case 'nickname': {
        const nickname = rest.trim().slice(0, 12) || null
        const r = await mutate($, s => ({ save: { ...s, nickname } }))
        if (!r) return { text: READ_ONLY }
        return { text: nickname ? `Nickname set to ${nickname}.` : 'Nickname cleared.' }
      }
      case 'export': {
        const s = await loadFresh($)
        if (!s) return { text: READ_ONLY }
        const blob = exportBlob(s)
        const copied = await $.ui.copy({ text: blob })
        return { text: copied.isCopied ? 'Save copied to the clipboard.' : `Copy this save:\n${blob}` }
      }
      case 'import': {
        const parsed = importBlob(rest)
        if (parsed.kind === 'bad') return { text: parsed.reason }
        const prev = await $.store.get('save')
        if (prev !== undefined) await $.store.set('save.bak', prev as never)
        await $.store.set('save', parsed.save)
        await update($, saveAtom, () => parsed.save)
        await update($, readOnlyAtom, () => false)
        return { text: `Restored ${species(parsed.save.species).name} at Lv ${parsed.save.level}. Your previous save is in save.bak.` }
      }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const save = await read($, saveAtom)
    if (!save) return next(e)
    const now = await $.clock.now()
    const isFlash = (await read($, flashAtom)) > now
    const view = {
      save,
      bubble: await read($, bubbleAtom),
      showFull: save.view === 'full' || isFlash,
      evolving: save.evolution !== null,
      isFlash: isFlash && save.view !== 'full',
    }
    return band($.ui.resolve(e), view, e.props.maxRows, e.props.bodyColumns)
  })
}
