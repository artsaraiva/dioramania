import { around, middle, type Bounds, type Vec } from '../sim/geometry'
import { cellAt, cellBounds } from '../sim/tiles'
import type { Kit } from './kit'
import { raised } from './shapes'

export const KERB = 1.2 // m a Block stands above the road: chunky on purpose, it is the toy look
const BEVEL = 0.24
/** m between a Tile's Blocks and its edge: the Tile's half of a Footpath, which its Blocks' pavement paves (ADR 0012, #362). */
export const FOOTPATH = 2
// m from its Tile's edge within which a point of a Block's outline lies along that edge: the Footpath's half, and half
// the 1.25 m between the field's samples (`./field`), by which an outline cuts the corner where it turns from the edge.
const BY_EDGE = FOOTPATH + 0.65
/** The pavement's colour, which the surface pattern picks the pavement out by to lay its paving joints (`./pattern`, #176). */
export const PAVEMENT = '#f1ede5'
const SLIVER = 5 // m: an outline narrower than this on average is left as road plate, not raised as a Block

/** A Block's outline, with its bounding box. */
export interface Block extends Bounds {
  loop: Vec[]
}

/** A Block from an outline of the field. */
export const block = (loop: Vec[]): Block => ({ loop, ...around(loop) })

/** The ground of the Tile a Block lies on. */
export const tileOf = (b: Bounds): Bounds => cellBounds(cellAt(middle(b)))

/**
 * Whether a point of a Block's outline lies along the edge of its Tile `tile`: on its Footpath side, or where its kerb
 * turns onto that side.
 */
export const byEdge = (tile: Bounds, p: Vec) => Math.min(p.x - tile.x0, tile.x1 - p.x, p.y - tile.y0, tile.y1 - p.y) <= BY_EDGE

/** `v` carried out to `lo` or `hi` where it lies within `reach` of either, else left where it is. */
const snap = (v: number, lo: number, hi: number, reach: number) => (v - lo <= reach ? lo : hi - v <= reach ? hi : v)

/**
 * The outline a Block's pavement is raised from (#362): its own, carried out to the edge of its Tile `tile` along each
 * side that faces it, the Tile's half of a Footpath (ADR 0012). Each point within `BY_EDGE` of a side of the Tile goes
 * out onto it, so the corner by a corner of the Tile goes out to that corner, and a kerb that meets the edge runs on
 * straight to it. The Block keeps its own outline: what stands on it, and who walks it, are drawn from that.
 */
export function paved(loop: Vec[], tile: Bounds): Vec[] {
  const out: Vec[] = []
  for (const p of loop) {
    const [x, y] = [snap(p.x, tile.x0, tile.x1, BY_EDGE), snap(p.y, tile.y0, tile.y1, BY_EDGE)]
    const last = out[out.length - 1]
    if (!last || last.x !== x || last.y !== y) out.push({ x, y })
  }
  while (out.length > 1 && out[0].x === out[out.length - 1].x && out[0].y === out[out.length - 1].y) out.pop()
  return out
}

/** Twice the area inside an outline (m², the shoelace formula): positive if it runs counterclockwise. */
export function twiceArea(loop: Vec[]): number {
  let twice = 0
  loop.forEach((p, i) => {
    const q = loop[(i + 1) % loop.length]
    twice += p.x * q.y - q.x * p.y
  })
  return twice
}

/** The area inside an outline, m². */
export const area = (loop: Vec[]) => Math.abs(twiceArea(loop)) / 2

/**
 * Whether an outline is wide enough to be a Block rather than a sliver: twice its area over its perimeter is its width,
 * on average. A seam between two pieces of slab can leave a sliver between a Road and the seam.
 */
export function wide({ loop }: Block): boolean {
  let [twice, perimeter] = [0, 0]
  loop.forEach((p, i) => {
    const q = loop[(i + 1) % loop.length]
    twice += p.x * q.y - q.x * p.y
    perimeter += Math.hypot(q.x - p.x, q.y - p.y)
  })
  return Math.abs(twice) / perimeter >= SLIVER
}

/**
 * A Block's pavement as one brick: a bevelled slab raised from its outline carried out to its Tile's edge (`paved`),
 * which the surface pattern paves (#174, on every Tile since #176). A roundabout's island is one too. Along the Tile's
 * edge the slab stands upright, with no bevel, so that the next Tile's half of the Footpath meets it level, with no
 * groove between them, and an open edge of the City is pavement to the brim of the road plate (#362).
 */
export function pavement(kit: Kit, b: Block) {
  const { x, y } = middle(b)
  const tile = tileOf(b)
  const geo = raised(paved(b.loop, tile), KERB, BEVEL)
  const position = geo.attributes.position
  for (let i = 0; i < position.count; i++) {
    position.setX(i, snap(position.getX(i), tile.x0, tile.x1, BEVEL + 1e-3))
    position.setZ(i, -snap(-position.getZ(i), tile.y0, tile.y1, BEVEL + 1e-3))
  }
  geo.computeVertexNormals()
  kit.pavement(geo, PAVEMENT)
  kit.brick('block', x, y, 0, 3)
}
