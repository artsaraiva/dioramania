import { middle, type Vec } from '../sim/geometry'
import type { Network } from '../sim/network'
import { cellAt, junctionId } from '../sim/tiles'
import { KERB, twiceArea, type Block } from './blocks'
import type { Field } from './field'
import { to, type Kit } from './kit'
import { walk, type Footprint } from './kerbside'
import { near, turned } from './zones/ground'

// A Block's Drive (#327): the one place on its kerb where a vehicle turns off the Road. It sits on the Block's longest
// Road frontage, as far from the Tile's Junction as the Block allows, clear of the utility poles that stand there
// first and, where the frontage has room, of the Block's lamps and street trees, which are left off where it lies. It reads only the Block, the network and those, never the Zone or the Stage, so it is
// in the same place at every Stage and through a Rezoning; a Swap's new Blocks get Drives of their own.
//
// m: how wide its mouth is along the kerb and how deep its ground reaches in from the edge; how far from its kerb a
// Road's outer lane runs, at most, for that kerb to be the Road's frontage; how far its ground keeps from a lamp, a
// street tree or a pole, and from each end of the frontage; how far apart the places tried along the frontage are.
const DRIVE = { wide: 4.5, deep: 4.5, kerbside: 6, room: 1, end: 0.5, step: 0.25 }
// The plain Drive: a crossover of concrete from the kerbstone line to the back of its ground, where the kerb is
// dropped; and a gate across it at the back of the pavement, between two posts, an accordion gate standing open, folded
// against one of them. m: where the crossover begins in from the edge, the gate's line in from the edge, its posts, how
// tall the folded gate stands and how far along it its folded bars reach.
const PLAIN = { from: 0.26, gate: 2.2, post: 0.2, tall: 1.3, foldedTall: 1.1, folded: 0.5, concrete: '#d6d1c7', steel: '#7a838e' }

/**
 * Where a Block's Drive lies: its ground as a claim has it (`../kit`'s `Claim`), `w` along the kerb by `d` in from it,
 * centred on `(x, y)` and turned `ry`, the way in to the left of the way `ry` points.
 */
export type Drive = Footprint

/**
 * The Block's Drive: on its longest Road frontage that has room, as far from its Tile's Junction as the frontage allows,
 * its ground clear of each of `fixed` (the utility poles round the Block) and, where the frontage has room for that too,
 * of each of `movable` (its lamps and street trees: the caller leaves off those `nearDrive` finds on it, as on a short
 * arm of a Roundabout). Null if no frontage has room, as on a Block that faces no Road.
 */
export function driveOf(block: Block, net: Network, field: Field, fixed: Vec[], movable: Vec[]): Drive | null {
  const { loop } = block
  const n = loop.length
  const { along, length } = walk(loop)
  const turn = twiceArea(loop) > 0 ? 1 : -1 // counterclockwise, the inside is to the left of the way round
  const reach = DRIVE.kerbside
  // The outer lane of each Road near the Block, as segments: a kerb faces the Road whose outer lane runs nearest it.
  const lanes: { road: string; a: Vec; b: Vec }[] = []
  for (const lane of net.lanes) {
    if (!('road' in lane.owner) || lane.index !== 0) continue
    const { pts } = lane.line
    for (let k = 0; k + 1 < pts.length; k++) {
      const [a, b] = [pts[k], pts[k + 1]]
      if (Math.max(a.x, b.x) < block.x0 - reach || Math.min(a.x, b.x) > block.x1 + reach) continue
      if (Math.max(a.y, b.y) < block.y0 - reach || Math.min(a.y, b.y) > block.y1 + reach) continue
      lanes.push({ road: lane.owner.road, a, b })
    }
  }
  const roadAt = loop.map((p) => {
    let [road, best]: [string | null, number] = [null, reach]
    for (const { road: r, a, b } of lanes) {
      const [dx, dy] = [b.x - a.x, b.y - a.y]
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
      const d = Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y)
      if (d < best) [road, best] = [r, d]
    }
    return road
  })

  // The frontages: runs of the outline along one Road, each as its points in order round the loop, longest first.
  const start = roadAt.findIndex((r, i) => r !== roadAt[(i + n - 1) % n]) // where a run begins; -1 if none does
  const runs: number[][] = []
  for (let k = 0; k < n; k++) {
    const i = (Math.max(0, start) + k) % n
    if (roadAt[i] === null) continue
    if (k > 0 && roadAt[i] === roadAt[(i + n - 1) % n] && runs.length) runs[runs.length - 1].push(i)
    else runs.push([i])
  }
  const span = (run: number[]) => (along[run[run.length - 1]] - along[run[0]] + length) % length
  runs.sort((a, b) => span(b) - span(a))

  const junction = net.junctions.find((j) => j.id === junctionId(cellAt(middle(block))))?.at ?? middle(block)
  const { wide: w, deep: d, room } = DRIVE
  for (const run of runs) {
    // The run as a polyline, and the point `s` m along it.
    const pts = run.map((i) => loop[i])
    const cum = [0]
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y))
    const total = cum[cum.length - 1]
    const at = (s: number): Vec => {
      let k = 1
      while (k < pts.length - 1 && cum[k] < s) k++
      const f = (s - cum[k - 1]) / (cum[k] - cum[k - 1] || 1)
      return { x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * f, y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * f }
    }
    for (const keep of [[...fixed, ...movable], fixed]) {
      let [best, far]: [Drive | null, number] = [null, -1]
      for (let s = w / 2 + DRIVE.end; s <= total - w / 2 - DRIVE.end; s += DRIVE.step) {
        const [p, a, b] = [at(s), at(s - w / 2), at(s + w / 2)]
        const ry = Math.atan2(b.y - a.y, b.x - a.x) + (turn > 0 ? 0 : Math.PI) // the way in to the left
        const [x, y] = to(p.x, p.y, ry, 0, d / 2)
        const ground = { x, y, ry, w, d }
        const clear = keep.every((q) => !near(ground, q.x, q.y, room))
        const onBlock = [-w / 2, 0, w / 2].every((u) => field.sample(...to(x, y, ry, u, d / 2)) > 0)
        const away = Math.hypot(p.x - junction.x, p.y - junction.y)
        if (clear && onBlock && away > far) [best, far] = [ground, away]
      }
      if (best) return best
    }
  }
  return null
}

/** Whether `q`, a lamp or a street tree, stands on the Drive or too near it to be left standing. */
export const nearDrive = (drive: Drive, q: Vec) => near(drive, q.x, q.y, DRIVE.room)

/** Points over a Drive's ground, its corners, the middles of its sides and its centre: what a landmark's site keeps off. */
export function driveCorners({ x, y, ry, w, d }: Drive): Vec[] {
  const out: Vec[] = []
  for (const u of [-w / 2, 0, w / 2]) for (const v of [-d / 2, 0, d / 2]) out.push(turned(x, y, ry, u, v))
  return out
}

/**
 * The plain Drive (#327), every Zone's until a later ticket dresses it for its own: claims its ground, which nothing
 * else stands on, and lays the crossover where the kerb is dropped, as one brick, and the open gate, as another.
 */
export function plainDrive(kit: Kit, drive: Drive) {
  const { x, y, ry, w, d } = drive
  const front = -d / 2 // the kerb's edge, in the Drive's frame
  const deep = d - PLAIN.from
  kit.add(kit.cuboid(w, 0.03, deep), PLAIN.concrete, ...to(x, y, ry, 0, front + PLAIN.from + deep / 2), KERB + 0.01, ry)
  kit.brick('ground', x, y, KERB)
  kit.claim('drive', x, y, w, d, ry) // riding the gate's brick
  kit.furniture(() => {
    const line = front + PLAIN.gate
    for (const side of [-1, 1]) {
      const post = to(x, y, ry, side * (w / 2 - PLAIN.post / 2), line)
      kit.add(kit.cuboid(PLAIN.post, PLAIN.tall, PLAIN.post), PLAIN.steel, ...post, KERB, ry)
    }
    // The folded gate against the post on the left: its bars close together between its rails, on a wheel at its foot.
    const fold = to(x, y, ry, -w / 2 + PLAIN.post + PLAIN.folded / 2, line)
    for (const z of [0.12, PLAIN.foldedTall - 0.06]) kit.add(kit.cuboid(PLAIN.folded, 0.06, 0.12), PLAIN.steel, ...fold, KERB + z, ry)
    for (let k = 0; k < 6; k++) {
      const bar = to(x, y, ry, -w / 2 + PLAIN.post + 0.03 + (k * (PLAIN.folded - 0.06)) / 5, line)
      kit.add(kit.cuboid(0.03, PLAIN.foldedTall - 0.12, 0.08), PLAIN.steel, ...bar, KERB + 0.12, ry)
    }
    kit.add(kit.cuboid(0.12, 0.12, 0.12), PLAIN.steel, ...fold, KERB, ry)
    kit.brick('building', ...to(x, y, ry, 0, line), KERB)
  })
}
