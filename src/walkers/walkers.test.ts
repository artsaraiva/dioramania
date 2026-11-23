import { expect, it } from 'vitest'
import { sameBounds, type Bounds } from '../sim/geometry'
import { cellBounds } from '../sim/tiles'
import type { Storylet } from './storylets'
import { whereIs, Walkers, type Place, type Walker } from './walkers'

/** The pavement round a square Block `inset` m in from the edges of `tile`. */
function pavement(tile: Bounds, inset: number) {
  const [x0, y0, x1, y1] = [tile.x0 + inset, tile.y0 + inset, tile.x1 - inset, tile.y1 - inset]
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
}

const [WEST, EAST] = [cellBounds({ x: 0, y: 0 }), cellBounds({ x: 1, y: 0 })]

/** The Walkers of a City of seed `seed` and of `tiles`, laid in the order given, each with two pavements. */
function cityOf(seed: number, ...tiles: Bounds[]) {
  const walkers = new Walkers(seed)
  for (const tile of tiles) walkers.add(tile, [pavement(tile, 12), pavement(tile, 40)])
  return walkers
}
/** The Walkers on `tile`. */
const on = (walkers: Walkers, tile: Bounds) => walkers.all.filter((w) => sameBounds(w.tile, tile))

// Walkers

it('the same seed gives the same Walkers, whatever order their Tiles were laid in', () => {
  const city = cityOf(7, WEST, EAST)
  expect(city.all.length).toBeGreaterThan(4)
  for (const w of city.all) {
    expect(w.name).not.toBe('')
    expect(w.home).not.toBe('')
    expect(w.job).not.toBe('')
    expect(w.traits.length === 1 || w.traits.length === 2).toBe(true)
  }
  const again = cityOf(7, EAST, WEST)
  expect(on(again, WEST)).toEqual(on(city, WEST))
  expect(on(again, EAST)).toEqual(on(city, EAST))
  // Another seed, other Walkers.
  expect(on(cityOf(8, WEST, EAST), WEST)).not.toEqual(on(city, WEST))
})

it('a Swap or an Undo of one Tile leaves the Walkers of the others who they were', () => {
  const city = cityOf(7, WEST, EAST)
  const [west, east] = [structuredClone(on(city, WEST)), structuredClone(on(city, EAST))]
  // A Swap of the east Tile: its Walkers go, and others come on its new pavement.
  city.takeOff([EAST])
  city.add(EAST, [pavement(EAST, 25)])
  expect(on(city, WEST)).toEqual(west)
  // The Undo of the Swap puts the Tile before it back, with the Walkers it had.
  city.takeOff([EAST])
  city.add(EAST, [pavement(EAST, 12), pavement(EAST, 40)])
  expect(on(city, EAST)).toEqual(east)
  expect(on(city, WEST)).toEqual(west)
  // The Undo of the east Tile's placement leaves the west Tile's Walkers as they were.
  city.takeOff([EAST])
  expect(on(city, EAST)).toEqual([])
  expect(on(city, WEST)).toEqual(west)
})

// Places

/** A box on the map from (x0, y0) to (x1, y1), counterclockwise. */
const box = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]
// On the west Tile's pavement 12 m in, along its south side: a shop door with a pot straight between it and the
// pavement, a bench, and the door of a shop with a terrace on its roof. All face south, to the pavement.
const DOOR: Place = { kind: 'door', x: 0, y: -35, ry: Math.PI }
const BENCH: Place = { kind: 'bench', x: -20, y: -30, ry: Math.PI }
const TERRACE: Place = { kind: 'terrace', x: 20, y: -35, ry: Math.PI, up: { x: 20, y: -30, h: 10, ry: Math.PI, sit: false } }
const POT = box(-0.3, -37, 0.3, -36.4)

/** What each Walker of a City of seed `seed` with the west Tile was doing, and where, every step of ten minutes. */
function seen(seed: number) {
  const walkers = new Walkers(seed)
  walkers.add(WEST, [pavement(WEST, 12)], [DOOR, BENCH, TERRACE], [POT])
  const steps: string[][] = []
  for (let t = 0; t < 600; t += 0.1) {
    walkers.step(0.1)
    steps.push(walkers.all.map((w) => `${w.doing}:${w.way?.place.kind ?? ''}@${w.s.toFixed(2)}`))
  }
  return steps
}

it('what each Walker does comes from the City’s seed', () => {
  const seven = seen(7)
  expect(seen(7)).toEqual(seven)
  expect(seen(8)).not.toEqual(seven)
  expect(['act:door', 'act:bench', 'up:terrace'].every((act) => seven.flat().some((w) => w.startsWith(act)))).toBe(true)
})

// Crossing at a Signal

// Across the west Tile from west to east, a Road 28 m wide between kerbs at y = ±14, and the pavements of the Blocks
// either side of it 1.6 m in from each kerb. At x = 0 the zebra of the Junction X crosses it, from one pavement to the
// other: 31.2 m.
const [SOUTH, NORTH] = [box(-40, -40, 40, -15.6), box(-40, 15.6, 40, 40)]
const ZEBRA = {
  junction: 'X',
  ends: [
    { x: 0, y: -15.6 },
    { x: 0, y: 15.6 },
  ],
} as const

/**
 * Twenty minutes of the Walkers of the west Tile, the lights of X showing `walkLeft` s of the Walk phase left at each
 * second of the Sim's clock (undefined: X has no Signal): whether anyone was in the Road while it was not the Walk
 * phase, how many got across to the other Block, and how many were seen waiting at the kerb.
 */
function crossing(walkLeft: (t: number) => number | undefined) {
  const walkers = new Walkers(7)
  walkers.add(WEST, [SOUTH, NORTH], [], [], [ZEBRA])
  const north = new Map(walkers.all.map((w) => [w, whereIs(w).y > 0]))
  const seen = { outOfPhase: false, across: new Set<Walker>(), waited: new Set<Walker>() }
  for (let t = 0; t < 1200; t += 0.1) {
    walkers.step(0.1, (junction) => (junction === 'X' ? walkLeft(t + 0.1) : undefined))
    for (const w of walkers.all) {
      const { y } = whereIs(w)
      if (Math.abs(y) < 14 && !walkLeft(t + 0.1)) seen.outOfPhase = true
      if (Math.abs(y) > 15 && y > 0 !== north.get(w)) seen.across.add(w)
      if (w.doing === 'wait') seen.waited.add(w)
    }
  }
  return seen
}

it('a Walker starts across a Road only in the Walk phase, with time enough left to reach the far kerb', () => {
  // A cycle of a minute whose first 30 s are the Walk phase: Walkers cross, and nobody is caught in the Road.
  const cycle = crossing((t) => Math.max(0, 30 - (t % 60)))
  expect(cycle.across.size).toBeGreaterThan(3)
  expect(cycle.outOfPhase).toBe(false)
  // A Walk phase that never has long enough left to cross 31 m at a brisk pace: they wait, and nobody starts across.
  const short = crossing(() => 12)
  expect(short.waited.size).toBeGreaterThan(3)
  expect(short.across.size).toBe(0)
  // No Signal at X: nobody waits for one, or crosses.
  const none = crossing(() => undefined)
  expect(none.waited.size + none.across.size).toBe(0)
})

// Storylets

/** `w`'s log, by Storylet: its title, then each line it holds. */
const said = (w: Walker) => w.log.map((entry) => [entry.title, ...entry.lines])
const ERRAND: Storylet = {
  title: 'An errand',
  beats: [
    ['stop', 'A stopped.'],
    ['door', 'A went in.'],
    ['bench', 'A sat down.'],
  ],
  end: 'A walked on.',
}

it('a Storylet begins only for a Walker Followed five seconds or Kept, and its beats end in their log in order', () => {
  const walkers = new Walkers(7, [ERRAND])
  walkers.add(WEST, [pavement(WEST, 12)], [DOOR, BENCH, TERRACE], [POT])
  const [followed, glanced, kept, passer] = walkers.all.filter((w) => !w.side)
  // A glance of a few seconds begins nothing.
  walkers.followed = glanced
  for (let t = 0; t < 4; t += 0.1) walkers.step(0.1)
  walkers.followed = followed
  walkers.keep(kept, true)
  const ending: Walker[] = [] // as their Storylets end, the newest first
  for (let t = 0; t < 600; t += 0.1) {
    walkers.step(0.1)
    for (const w of [followed, kept]) if (w.log[0]?.ended && !ending.includes(w)) ending.unshift(w)
  }
  for (const w of [followed, kept])
    expect(said(w)).toEqual([['An errand', `${w.name} stopped.`, `${w.name} went in.`, `${w.name} sat down.`, `${w.name} walked on.`]])
  expect(said(glanced)).toEqual([])
  expect(said(passer)).toEqual([])
  // The City's list of the Storylets that ended, newest first.
  expect(walkers.ended).toEqual(ending.map((w) => ({ who: w.name, title: 'An errand', lines: said(w)[0].slice(1) })))
})

it('a Storylet fits who the Walker is, who they are with, the time of day and their pavement, and is never their last', () => {
  /** A Storylet of one beat, which fits as `fit` says. */
  const only = (title: string, fit: Partial<Storylet> = {}): Storylet => ({
    title,
    beats: [['stop', 'A and B stopped.']],
    end: 'A walked on.',
    ...fit,
  })
  const storylets = [
    only('Anyone'),
    only('Alone', { pair: false }),
    only('Together', { pair: true }),
    only('After school', { kinds: ['schoolchild'] }),
    only('Late', { when: ['night'] }),
    only('Up high', { beats: [['terrace', 'A went up.']] }),
  ]
  // On the pavement round the Block 12 m in with its Places, or on the one 40 m in, which reaches none: everyone Kept,
  // a two by keeping the one who walks beside the lead.
  const walkers = new Walkers(7, storylets)
  walkers.add(WEST, [pavement(WEST, 12), pavement(WEST, 40)], [DOOR, BENCH, TERRACE], [POT])
  for (const w of walkers.all) if (w.lead || !walkers.otherOfTwo(w)) walkers.keep(w, true)
  const reaches = new Map(walkers.all.map((w) => [w, w.line.length > 200]))
  // The s from each Storylet's end to the next one's beginning, as two always fit.
  const [rests, ended] = [[] as number[], new Map<Walker, { entries: number; at?: number }>()]
  let t = 0
  const run = (seconds: number, timeOfDay: number) => {
    for (const end = t + seconds; t < end; t += 0.1) {
      walkers.step(0.1, undefined, 0.1, timeOfDay)
      for (const w of walkers.all.filter((w) => !w.lead)) {
        const seen = ended.get(w) ?? { entries: 0 }
        if (w.log.length > seen.entries && seen.at !== undefined) rests.push(t - seen.at)
        ended.set(w, { entries: w.log.length, at: w.log.at(-1)?.ended ? (seen.at ?? t) : undefined })
      }
    }
  }
  run(1800, 0.25)
  const atNoon = new Map(walkers.all.map((w) => [w, w.log.length]))
  run(1800, 0.8)
  expect(rests.length).toBeGreaterThan(50)
  for (const rest of rests) expect(rest > 29.9 && rest < 70.3).toBe(true)

  const titles = new Set<string>()
  for (const w of walkers.all) {
    const other = walkers.otherOfTwo(w)
    w.log.forEach(({ title, lines, ended }, i) => {
      titles.add(title)
      if (title === 'Alone') expect(other).toBeUndefined()
      if (title === 'Together') expect(other).toBeDefined()
      // A two's are the lead's, who the other walks beside.
      if (title === 'After school') expect((w.lead ?? w).kind).toBe('schoolchild')
      if (title === 'Late') expect(i).toBeGreaterThanOrEqual(atNoon.get(w)!)
      if (title === 'Up high') expect(reaches.get(w)).toBe(true)
      expect(title).not.toBe(w.log[i - 1]?.title)
      // A two's Storylets are both of theirs, and name both.
      const [a, b] = w.lead ? [w.lead.name, w.name] : [w.name, other?.name]
      if (title === 'Together' && ended) expect(lines).toEqual([`${a} and ${b} stopped.`, `${a} walked on.`])
    })
  }
  expect([...titles].sort()).toEqual(['After school', 'Alone', 'Anyone', 'Late', 'Together', 'Up high'])
})

it('a beat’s line reaches the log once it is done: across the Road, never while still waiting to cross', () => {
  const across: Storylet = {
    title: 'Across',
    beats: [
      ['cross', 'A crossed over.'],
      ['stop', 'A looked back.'],
    ],
    end: 'A walked on.',
  }
  /** Twenty minutes of the Walkers of the west Tile, all Kept, at the zebra of X as `crossing` has it. */
  const kept = (walkLeft: (t: number) => number) => {
    const walkers = new Walkers(7, [across])
    walkers.add(WEST, [SOUTH, NORTH], [], [], [ZEBRA])
    for (const w of walkers.all) walkers.keep(w, true)
    // The side of the Road each last waited on.
    const waitedNorth = new Map<Walker, boolean>()
    let told = 0
    for (let t = 0; t < 1200; t += 0.1) {
      walkers.step(0.1, (junction) => (junction === 'X' ? walkLeft(t + 0.1) : undefined))
      for (const w of walkers.all) {
        const north = whereIs(w).y > 0
        const entry = w.log.at(-1)
        const running = entry && !entry.ended ? entry.lines : []
        if (w.doing === 'wait' || w.doing === 'cross') {
          // Still to cross, their Storylet says nothing yet.
          expect(running).toEqual([])
          if (w.doing === 'wait') waitedNorth.set(w, north)
        } else if (running.length === 1) {
          // Their Storylet says they crossed over: they are on the far side from where they waited.
          expect(north).toBe(!waitedNorth.get(w))
          told++
        }
      }
    }
    return { walkers, told }
  }
  expect(kept((t) => Math.max(0, 30 - (t % 60))).told).toBeGreaterThan(0)
  // A Walk phase never long enough to cross in: they wait, give up, and nothing of it reaches a log.
  const { walkers } = kept(() => 12)
  expect(walkers.all.flatMap((w) => w.log.flatMap((entry) => entry.lines))).toEqual([])
  expect(walkers.all.some((w) => w.doing === 'wait')).toBe(true)
})
