import { expect, it } from 'vitest'
import { sameBounds, type Bounds } from '../sim/geometry'
import { cellBounds } from '../sim/tiles'
import { Walkers, type Place } from './walkers'

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
// pavement, and a bench. Both face south, to the pavement.
const DOOR: Place = { kind: 'door', x: 0, y: -35, ry: Math.PI }
const BENCH: Place = { kind: 'bench', x: -20, y: -30, ry: Math.PI }
const POT = box(-0.3, -37, 0.3, -36.4)

/** What each Walker of a City of seed `seed` with the west Tile was doing, and where, every step of ten minutes. */
function seen(seed: number) {
  const walkers = new Walkers(seed)
  walkers.add(WEST, [pavement(WEST, 12)], [DOOR, BENCH], [POT])
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
  expect(['act:door', 'act:bench'].every((act) => seven.flat().some((w) => w.startsWith(act)))).toBe(true)
})
