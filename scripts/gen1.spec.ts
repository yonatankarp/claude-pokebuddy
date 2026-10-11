import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evolutionsFrom, idFromUrl } from './gen1.ts'

const chain = {
  species: { url: 'https://pokeapi.co/api/v2/pokemon-species/172/' },
  evolution_details: [],
  evolves_to: [{
    species: { url: 'https://pokeapi.co/api/v2/pokemon-species/25/' },
    evolution_details: [{ trigger: { name: 'level-up' }, min_level: null, min_happiness: 220 }],
    evolves_to: [{
      species: { url: 'https://pokeapi.co/api/v2/pokemon-species/26/' },
      evolution_details: [{ trigger: { name: 'use-item' }, item: { name: 'thunder-stone' } }],
      evolves_to: [],
    }],
  }],
}

test('idFromUrl', () => {
  assert.equal(idFromUrl('https://pokeapi.co/api/v2/pokemon-species/25/'), 25)
})

test('Pikachu evolves by Thunder Stone; Pichu is outside Gen 1', () => {
  assert.deepEqual(evolutionsFrom(chain, 25), [{ kind: 'stone', to: 26, stone: 'thunder-stone' }])
  assert.deepEqual(evolutionsFrom(chain, 26), [])
})

test('level and trade triggers map; targets above 151 are dropped', () => {
  const c = {
    species: { url: '/pokemon-species/64/' }, evolution_details: [],
    evolves_to: [
      { species: { url: '/pokemon-species/65/' }, evolution_details: [{ trigger: { name: 'trade' } }], evolves_to: [] },
    ],
  }
  const d = {
    species: { url: '/pokemon-species/133/' }, evolution_details: [],
    evolves_to: [
      { species: { url: '/pokemon-species/196/' }, evolution_details: [{ trigger: { name: 'level-up' }, min_happiness: 160 }], evolves_to: [] },
      { species: { url: '/pokemon-species/135/' }, evolution_details: [{ trigger: { name: 'use-item' }, item: { name: 'thunder-stone' } }], evolves_to: [] },
    ],
  }
  const l = {
    species: { url: '/pokemon-species/4/' }, evolution_details: [],
    evolves_to: [{ species: { url: '/pokemon-species/5/' }, evolution_details: [{ trigger: { name: 'level-up' }, min_level: 16 }], evolves_to: [] }],
  }
  assert.deepEqual(evolutionsFrom(c, 64), [{ kind: 'trade', to: 65 }])
  assert.deepEqual(evolutionsFrom(d, 133), [{ kind: 'stone', to: 135, stone: 'thunder-stone' }])
  assert.deepEqual(evolutionsFrom(l, 4), [{ kind: 'level', to: 5, level: 16 }])
})
