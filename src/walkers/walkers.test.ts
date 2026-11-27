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

/**
 * What each Walker of a City of seed `seed` with the west Tile, its door a home to whoever has one of their own, was
 * doing, and where, every step of ten minutes: at their own door, `own`.
 */
function seen(seed: number) {
  const walkers = new Walkers(seed)
  walkers.add(WEST, [pavement(WEST, 12)], [DOOR, BENCH, TERRACE], [POT], [], 'home')
  const where = (w: Walker) => (w.way && w.way.place === w.own?.door ? 'own' : (w.way?.place.kind ?? ''))
  const steps: string[][] = []
  for (let t = 0; t < 600; t += 0.1) {
    walkers.step(0.1)
    steps.push(walkers.all.map((w) => `${w.doing}:${where(w)}@${w.s.toFixed(2)}`))
  }
  return steps
}

/** Doors along each side of `tile`'s pavement 12 m in, 3 m in from it, each facing it: `n` to a side. */
function doorsOn(tile: Bounds, n = 3): Place[] {
  const [cx, cy, r] = [(tile.x0 + tile.x1) / 2, (tile.y0 + tile.y1) / 2, (tile.x1 - tile.x0) / 2 - 15]
  return Array.from({ length: n }, (_, k) => -r + ((k + 0.5) * 2 * r) / n).flatMap((along): Place[] => [
    { kind: 'door', x: cx + along, y: cy - r, ry: Math.PI },
    { kind: 'door', x: cx + along, y: cy + r, ry: 0 },
    { kind: 'door', x: cx - r, y: cy + along, ry: Math.PI / 2 },
    { kind: 'door', x: cx + r, y: cy + along, ry: -Math.PI / 2 },
  ])
}

it('a Walker’s own door comes from the City’s seed, the same each time the City is laid', () => {
  /** The Walkers of a City of seed 7 whose Tiles, laid in the order given, have doors that are `own` to them. */
  const laid = (own: 'home' | 'shop' | undefined, ...tiles: Bounds[]) => {
    const walkers = new Walkers(7)
    for (const tile of tiles) walkers.add(tile, [pavement(tile, 12), pavement(tile, 40)], doorsOn(tile), [], [], own)
    return walkers
  }
  const homes = laid('home', WEST, EAST)
  // A home of their own is at a door their pavement reaches: on the pavement 40 m in, which reaches none, nobody has one.
  const residents = homes.all.filter((w) => w.own)
  expect(residents.length).toBeGreaterThan(0)
  for (const w of residents) {
    expect(w.own!.kind).toBe('home')
    expect(doorsOn(w.tile)).toContainEqual(w.own!.door)
    expect(w.line.length).toBeGreaterThan(200)
  }
  // The other of a two lives where the lead lives, if anywhere.
  for (const w of homes.all.filter((w) => w.lead)) expect(w.own === undefined || w.own === w.lead!.own).toBe(true)
  // Laid in another order, or the Tile laid again as a Swap's Undo lays it, each has the same door.
  expect(on(laid('home', EAST, WEST), WEST)).toEqual(on(homes, WEST))
  homes.takeOff([EAST])
  homes.add(EAST, [pavement(EAST, 12), pavement(EAST, 40)], doorsOn(EAST), [], [], 'home')
  expect(on(homes, EAST)).toEqual(on(laid('home', WEST, EAST), EAST))
  // The same doors after a Stage-up, however the build noted them, the same door.
  const before = structuredClone(on(homes, WEST).map((w) => w.own))
  homes.refit(WEST, doorsOn(WEST).reverse(), [], 'home')
  expect(on(homes, WEST).map((w) => w.own)).toEqual(before)
  // Where a door is a shop, some keep one, and no schoolchild does; and where a door is nobody's own, nobody has one.
  const keepers = laid('shop', WEST, EAST).all.filter((w) => w.own)
  expect(keepers.length).toBeGreaterThan(0)
  expect(keepers.every((w) => w.own!.kind === 'shop' && w.kind !== 'schoolchild')).toBe(true)
  expect(laid(undefined, WEST, EAST).all.some((w) => w.own)).toBe(false)
})

it('what each Walker does comes from the City’s seed: going in and out of their own door too', () => {
  const seven = seen(7)
  expect(seen(7)).toEqual(seven)
  expect(seen(8)).not.toEqual(seven)
  const did = ['act:door', 'act:own', 'back:own', 'act:bench', 'up:terrace']
  expect(did.every((act) => seven.flat().some((w) => w.startsWith(act)))).toBe(true)
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
    only('At home', { needs: 'home', beats: [['home', 'A went in.']] }),
    only('At the shop', { needs: 'shop' }),
  ]
  // On the pavement round the Block 12 m in with its Places, its door a home to whoever has one of their own, or on the
  // one 40 m in, which reaches none: everyone Kept, a two by keeping the one who walks beside the lead.
  const walkers = new Walkers(7, storylets)
  walkers.add(WEST, [pavement(WEST, 12), pavement(WEST, 40)], [DOOR, BENCH, TERRACE], [POT], [], 'home')
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
      if (title === 'At home') expect((w.lead ?? w).own?.door).toBe(DOOR)
      expect(title).not.toBe(w.log[i - 1]?.title)
      // A two's Storylets are both of theirs, and name both.
      const [a, b] = w.lead ? [w.lead.name, w.name] : [w.name, other?.name]
      if (title === 'Together' && ended) expect(lines).toEqual([`${a} and ${b} stopped.`, `${a} walked on.`])
    })
  }
  // Nobody keeps a shop where a door is a home.
  expect([...titles].sort()).toEqual(['After school', 'Alone', 'Anyone', 'At home', 'Late', 'Together', 'Up high'])
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

it('a Walker whose pavement reaches no Place or Signal still has Storylets, alone or in a two, at any time of day', () => {
  for (const timeOfDay of [0, 0.25, 0.5, 0.75]) {
    const walkers = new Walkers(7)
    walkers.add(WEST, [pavement(WEST, 12)])
    for (const w of walkers.all) walkers.keep(w, true)
    for (let t = 0; t < 120; t += 0.1) walkers.step(0.1, undefined, 0.1, timeOfDay)
    expect(
      walkers.all.some((w) => w.lead),
      'a two walks there',
    ).toBe(true)
    for (const w of walkers.all) expect(w.log.some((entry) => entry.ended)).toBe(true)
  }
})

// Walking between Tiles

/**
 * The pavement round `tile`'s one Block as a Tile lays it, 3.6 m in from its edges: those of two Tiles side by side lie
 * 7.2 m apart, either side of their Footpath.
 */
const footpathSide = (tile: Bounds) => pavement(tile, 3.6)

it('a Walker bound for a Place on the next Tile reaches it and comes back to their own door', () => {
  // Homes on the west Tile, and shops on the east one.
  const [homes, shops] = [doorsOn(WEST), doorsOn(EAST)]
  const walkers = new Walkers(7)
  walkers.add(WEST, [footpathSide(WEST)], homes, [], [], 'home')
  walkers.add(EAST, [footpathSide(EAST)], shops, [], [], 'shop')
  const residents = on(walkers, WEST).filter((w) => w.own && !w.lead)
  // The Places each was at, in turn, where each who walks alone was a step ago, and the Place each last set out for.
  const visits = new Map(residents.map((w) => [w, [] as Place[]]))
  const was = new Map(residents.filter((w) => !w.side).map((w) => [w, whereIs(w)]))
  const bound = new Map<Walker, Place>()
  for (let t = 0; t < 1800; t += 0.1) {
    walkers.step(0.1)
    for (const w of residents) {
      if (w.bound?.way) bound.set(w, w.bound.way.place)
      const at = w.doing === 'act' ? w.way!.place : undefined
      // The shop they go in at is the one they set out for.
      if (at && shops.includes(at)) expect(at).toBe(bound.get(w))
      if (at && visits.get(w)!.at(-1) !== at) visits.get(w)!.push(at)
      // They walk the whole way there and back: never further in a step than a stride.
      const [before, now] = [was.get(w), whereIs(w)]
      if (!before) continue
      expect(Math.hypot(now.x - before.x, now.y - before.y)).toBeLessThan(0.3)
      was.set(w, now)
    }
  }
  // Whoever went in at a shop went in at their own door next.
  const after = [...visits].flatMap(([w, places]) =>
    places.flatMap((at, i) => (shops.includes(at) && places[i + 1] ? [places[i + 1] === w.own!.door] : [])),
  )
  expect(after.length).toBeGreaterThan(3)
  expect(after).not.toContain(false)
})

it('a Walker on a neighbour’s Tile when it is swapped or taken off is on their own pavement afterwards', () => {
  /** Whether `p` is on the pavement of `tile`'s Block, or beside it as one of a two walks. */
  const onPavement = (p: { x: number; y: number }, tile: Bounds) =>
    Math.abs(Math.max(Math.abs(p.x - (tile.x0 + tile.x1) / 2), Math.abs(p.y - (tile.y0 + tile.y1) / 2)) - 46.4) < 0.45
  let caught = 0
  // The east Tile taken off at one moment after another: whoever of the west Tile is out is caught wherever they are.
  for (let at = 60; at <= 1200; at += 60) {
    const walkers = new Walkers(7)
    walkers.add(WEST, [footpathSide(WEST)], doorsOn(WEST), [], [], 'home')
    walkers.add(EAST, [footpathSide(EAST)], doorsOn(EAST), [], [], 'shop')
    for (let t = 0; t < at; t += 0.1) walkers.step(0.1)
    // Out: over the Footpath, east of their own pavement.
    const before = new Map(on(walkers, WEST).map((w) => [w, whereIs(w)]))
    const out = on(walkers, WEST).filter((w) => before.get(w)!.x > 46.85)
    caught += out.length
    walkers.takeOff([EAST])
    expect(on(walkers, WEST).length).toBe(before.size)
    for (const w of out) expect(onPavement(whereIs(w), WEST)).toBe(true)
    // Everyone else is where they were.
    for (const [w, was] of before) if (!out.includes(w)) expect(whereIs(w)).toEqual(was)
    // A Swap lays the Tile again, and an Undo does not: either way they walk on, and nobody is left out on nothing.
    if (at % 120) walkers.add(EAST, [pavement(EAST, 25)])
    for (let t = 0; t < 300; t += 0.1) {
      walkers.step(0.1)
      for (const w of on(walkers, WEST)) expect(whereIs(w).x).toBeLessThan(46.85)
    }
  }
  expect(caught).toBeGreaterThan(5)
})

it('a Walker crosses at the Signal of a Tile that is not theirs, and only in the Walk phase', () => {
  // The Road of the crossing above runs on across the east Tile, where the zebra of the Junction E crosses it at
  // x = 100, and a Footpath joins the Blocks south of it. The shops are north of it, on the east Tile.
  const [EAST_SOUTH, EAST_NORTH] = [box(53.6, -46.4, 146.4, -15.6), box(53.6, 15.6, 146.4, 46.4)]
  const zebra = {
    junction: 'E',
    ends: [
      { x: 100, y: -15.6 },
      { x: 100, y: 15.6 },
    ],
  } as const
  const shops: Place[] = [70, 100, 130].map((x) => ({ kind: 'door', x, y: 19, ry: Math.PI }))
  /**
   * Thirty minutes of the Walkers of the west Tile's south Block, the lights of E as `crossing`'s are of X: whether any
   * was in the east Tile's Road while it was not the Walk phase, how many were seen waiting at its kerb, and how many
   * went in at a shop.
   */
  const visiting = (walkLeft: (t: number) => number | undefined) => {
    const walkers = new Walkers(7)
    walkers.add(WEST, [box(-46.4, -46.4, 46.4, -15.6)])
    walkers.add(EAST, [EAST_SOUTH, EAST_NORTH], shops, [], [zebra])
    const seen = { outOfPhase: false, waited: new Set<Walker>(), shopped: new Set<Walker>() }
    for (let t = 0; t < 1800; t += 0.1) {
      walkers.step(0.1, (junction) => (junction === 'E' ? walkLeft(t + 0.1) : undefined))
      for (const w of on(walkers, WEST)) {
        if (Math.abs(whereIs(w).y) < 14 && !walkLeft(t + 0.1)) seen.outOfPhase = true
        if (w.doing === 'wait') seen.waited.add(w)
        if (w.doing === 'act' && shops.includes(w.way!.place)) seen.shopped.add(w)
      }
    }
    return seen
  }
  // A cycle of a minute whose first 30 s are the Walk phase: they cross to the shops, and nobody is caught in the Road.
  const cycle = visiting((t) => Math.max(0, 30 - (t % 60)))
  expect(cycle.shopped.size).toBeGreaterThan(2)
  expect(cycle.outOfPhase).toBe(false)
  // A Walk phase never long enough to cross in: they wait, and nobody reaches a shop.
  const short = visiting(() => 12)
  expect(short.waited.size).toBeGreaterThan(2)
  expect(short.shopped.size).toBe(0)
  // No Signal at E: nobody waits for one, or reaches a shop.
  const none = visiting(() => undefined)
  expect(none.waited.size + none.shopped.size).toBe(0)
})
