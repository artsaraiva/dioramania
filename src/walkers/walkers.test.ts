import { expect, it } from 'vitest'
import { sameBounds, type Bounds } from '../sim/geometry'
import { cellBounds } from '../sim/tiles'
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
// pavement, a bench, and a bench walled off from the pavement by a fence. All face south, to the pavement.
const DOOR: Place = { kind: 'door', x: 0, y: -35, ry: Math.PI }
const BENCH: Place = { kind: 'bench', x: -20, y: -30, ry: Math.PI }
const WALLED: Place = { kind: 'bench', x: 20, y: -30, ry: Math.PI }
const [POT, FENCE] = [box(-0.3, -37, 0.3, -36.4), box(14, -30.6, 26, -30.4)]

/** A City of seed `seed` with the west Tile, walked `seconds` s, and what each Walker was doing every step of it. */
function walk(seed: number, seconds = 600) {
  const walkers = new Walkers(seed)
  walkers.add(WEST, [pavement(WEST, 12)], [DOOR, BENCH, WALLED], [POT, FENCE])
  const steps: Walker[][] = []
  for (let t = 0; t < seconds; t += 0.1) {
    walkers.step(0.1)
    steps.push(walkers.all.map((w) => ({ ...w })))
  }
  return { walkers, steps }
}
const doingOf = (w: Walker) => `${w.doing}:${w.way?.place.kind ?? ''}`

it('what each Walker does comes from the City’s seed', () => {
  const seen = (seed: number) => walk(seed).steps.map((step) => step.map((w) => `${doingOf(w)}@${w.s.toFixed(2)}`))
  expect(seen(7)).toEqual(seen(7))
  expect(seen(8)).not.toEqual(seen(7))
})

it('a Walker goes in at a door and comes out, sits on a bench and gets up, and stops on the pavement', () => {
  const { steps } = walk(7)
  const changes = new Set<string>()
  for (let i = 1; i < steps.length; i++) {
    steps[i].forEach((w, k) => changes.add(`${doingOf(steps[i - 1][k])} > ${doingOf(w)}`))
  }
  for (const change of [
    'go:door > act:door',
    'act:door > back:door',
    'back:door > stroll:',
    'go:bench > act:bench',
    'act:bench > back:bench',
    'back:bench > stroll:',
    'stroll: > stop:',
    'stop: > stroll:',
  ]) {
    expect(changes).toContain(change)
  }
})

it('no Walker passes through what stands on the way to a Place, nor goes where there is no way', () => {
  const { steps } = walk(7)
  for (const w of steps.flat()) {
    const { x, y } = whereIs(w)
    // Off the pot by most of a body, on whichever side.
    expect(x < -0.3 - 0.2 || x > 0.3 + 0.2 || y < -37 - 0.2 || y > -36.4 + 0.2).toBe(true)
    expect(w.way?.place).not.toEqual(WALLED)
  }
  expect(steps.flat().some((w) => w.doing === 'act' && w.way?.place === DOOR)).toBe(true)
})

it('a third of Walkers walk in twos, and a two does all of it together', () => {
  const tiles = [0, 1, 2, 3].flatMap((x) => [0, 1, 2].map((y) => cellBounds({ x, y })))
  const city = cityOf(7, ...tiles)
  const twos = city.all.filter((w) => w.side !== 0)
  expect(twos.length / city.all.length).toBeGreaterThan(0.2)
  expect(twos.length / city.all.length).toBeLessThan(0.45)

  const { steps } = walk(7)
  let together = 0
  for (const step of steps) {
    for (const w of step.filter((w) => w.lead)) {
      const lead = step.find((l) => l.seed === w.lead!.seed)!
      expect([w.doing, w.way?.place]).toEqual([lead.doing, lead.way?.place])
      if (w.doing === 'act') together++
    }
  }
  expect(together).toBeGreaterThan(0)
})
