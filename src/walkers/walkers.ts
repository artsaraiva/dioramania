import { mulberry32 } from '../sim/demand'
import { around, overlaps, pointAt, polyline, sameBounds, type Bounds, type Polyline, type Vec } from '../sim/geometry'

/** A kind of Walker (#176), drawn with a model of its own: a shopper with a bag, a schoolchild, an office worker. */
export type Kind = 'shopper' | 'schoolchild' | 'worker'

/**
 * What a Walker is doing (#288): strolling their pavement (or along it to where they leave it for a Place), stopped on
 * it, going off it to a Place, at the Place (indoors, or sat on a bench), or coming back to where they left it.
 */
type Doing = 'stroll' | 'stop' | 'go' | 'act' | 'back'

/**
 * Somewhere a Walker goes to do something (#288), noted as the City is built: a door's step, facing out of the door,
 * or a bench's seat at ground level, facing the way one sat on it looks. On the map, `ry` 0 north and π/2 west.
 */
export interface Place {
  readonly kind: 'door' | 'bench'
  readonly x: number
  readonly y: number
  readonly ry: number
}

/**
 * The way from a pavement to a Place, round whatever stands between: from `pts[0]`, `s` m round the pavement, to the
 * Place's step or seat, `pts[2]`. `two`: whether two side by side fit on it too.
 */
export interface Way {
  readonly place: Place
  readonly s: number
  readonly pts: readonly Vec[]
  readonly two: boolean
}

/**
 * A person of the City: who they are, drawn once from their seed, and where on their pavement they walk.
 * ponytail: `home` is a phrase from a short list and names no door in the City, and with 24 names two Walkers can
 * share one. #291 gives a resident a door of their own; the lists grow as Storylets need them.
 */
export interface Walker {
  /** Their own seed, from the City's seed and where their pavement lies: all they are was drawn from it. */
  readonly seed: number
  readonly name: string
  readonly kind: Kind
  /** One or two. */
  readonly traits: readonly string[]
  readonly home: string
  /** What they do. */
  readonly job: string
  /** The Tile whose pavement they walk, by its bounds. */
  readonly tile: Bounds
  /** The centre line of the pavement they lap. */
  readonly line: Polyline
  /** m to the left of `line`, and of their way to a Place, they walk: 0 alone, and either side of it in a two. */
  readonly side: number
  /** In a two, the one they walk beside and do as. */
  readonly lead?: Walker
  /** m round `line`. */
  s: number
  /** m/s, either way round. */
  speed: number
  doing: Doing
  /** The way to the Place they are bound for, from the moment they choose it till they are back on `line`. */
  way?: Way
  /** What they walk of `way`, while off `line`, and `along` it m. */
  path?: Polyline
  along: number
  /** s till they next choose what to do, stop being stopped, or leave the Place. */
  time: number
  /** Where their own stream of chances has got to: what they do is drawn from it. */
  luck: number
}

const SPACING = 34 // m of pavement per Walker, or per two
const TWOS = 0.2 // of Walkers bring another, so that a third walk in twos
const PAIR = 0.4 // m either side of the line a two walk
const BODY = 0.25 // m a Walker keeps off what stands
const REACH = 20 // m in off a pavement a Place may be and be gone to
const SHIFTS = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6] // m along the pavement to try leaving it from, nearest first
// How many of every ten Walkers are of each kind.
const DEAL: Kind[] = ['shopper', 'shopper', 'shopper', 'shopper', 'schoolchild', 'schoolchild', 'schoolchild', 'worker', 'worker', 'worker'] // prettier-ignore
const NAMES = ['Hana', 'Kenji', 'Yui', 'Sora', 'Aoi', 'Ren', 'Mei', 'Daichi', 'Emi', 'Haruto', 'Mio', 'Takumi', 'Rin', 'Kaito', 'Nao', 'Shun', 'Saki', 'Yuto', 'Kana', 'Riku', 'Momo', 'Jun', 'Chie', 'Akira'] // prettier-ignore
const TRAITS = ['early riser', 'sweet tooth', 'chatty', 'daydreamer', 'bargain hunter', 'bookworm', 'night owl', 'plant lover', 'always late', 'collector'] // prettier-ignore
const HOMES = [
  'a flat over the bakery',
  'the house with the orange roof',
  'the ninth floor of a tower by the park',
  'a room above the family shop',
  'a terrace round the corner',
]
const JOBS: Record<Kind, string[]> = {
  shopper: ['keeps a flower stall', 'works nights at the hospital', 'teaches piano', 'is retired and busy', 'draws for a magazine'],
  schoolchild: ['is in the fourth year', 'is in the sixth year', 'plays in the school band', 'is on the football team'],
  worker: ['works in an office on the avenue', 'sells insurance', 'keeps the books for three shops', 'is new at the firm'],
}

/**
 * The seed of the Walkers of the pavement `loop` in the City of `seed`: where the pavement lies, by its south-west
 * corner, and nothing laid before it or beside it, so that a pavement laid again as it was has the same Walkers.
 */
function pavementSeed(seed: number, loop: Vec[]) {
  const { x0, y0 } = around(loop)
  return (seed ^ Math.imul(Math.round(x0), 0x9e3779b1) ^ Math.imul(Math.round(y0), 0x85ebca6b)) >>> 0
}

/** A Walker from their seed, `seed`, who laps `line` on `tile`, `side` m to its left, beside `lead` if in a two. */
function walker(seed: number, tile: Bounds, line: Polyline, side = 0, lead?: Walker): Walker {
  const draw = mulberry32(seed)
  const pick = <T>(a: readonly T[]) => a[Math.floor(draw() * a.length)]
  const kind = pick(DEAL)
  let name = pick(NAMES)
  if (name === lead?.name) name = NAMES[(NAMES.indexOf(name) + 7) % NAMES.length]
  const traits = [...new Set([pick(TRAITS), pick(TRAITS)])]
  const [home, job] = [pick(HOMES), pick(JOBS[kind])]
  const s = draw() * line.length
  const speed = (0.9 + draw() * 0.6) * (draw() < 0.5 ? 1 : -1) * (kind === 'schoolchild' ? 0.85 : 1)
  const [luck, time] = [Math.floor(draw() * 4294967296), 2 + draw() * 18]
  const who = { seed, name, kind, traits, home, job, tile, line, side, s, speed, doing: 'stroll' as const, along: 0, time, luck }
  return lead ? { ...who, lead, s: lead.s, speed: lead.speed, time: lead.time } : who
}

/** The next of `w`'s chances, 0 to 1: mulberry32, kept as a number so a Walker stays plain data. */
function roll(w: Walker) {
  w.luck = (w.luck + 0x6d2b79f5) >>> 0
  let t = Math.imul(w.luck ^ (w.luck >>> 15), w.luck | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
/** How long `w` strolls before choosing what to do next, s. */
const strolling = (w: Walker) => 8 + roll(w) * 24

const wrap = (s: number, length: number) => ((s % length) + length) % length
/** `p` moved `side` m to the left of `heading`. */
const beside = (p: Vec, heading: number, side: number) => ({ x: p.x - Math.sin(heading) * side, y: p.y + Math.cos(heading) * side })
const cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/** How far `p` is from the segment `a`–`b`. */
function toSegment(p: Vec, a: Vec, b: Vec) {
  const [dx, dy] = [b.x - a.x, b.y - a.y]
  const t = dx || dy ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t)
}

/** How far the segment `a`–`b` passes from `hull`, a convex outline counterclockwise, or a post or a rail of one or two points. */
function apart(a: Vec, b: Vec, hull: readonly Vec[]) {
  if (hull.length > 2 && hull.every((p, i) => cross(p, hull[(i + 1) % hull.length], a) >= 0)) return 0
  let d = Infinity
  for (let i = 0; i < hull.length; i++) {
    const [p, q] = [hull[i], hull[(i + 1) % hull.length]]
    if (cross(a, b, p) * cross(a, b, q) < 0 && cross(p, q, a) * cross(p, q, b) < 0) return 0
    d = Math.min(d, toSegment(p, a, b), toSegment(a, p, q), toSegment(b, p, q))
  }
  return d
}

/** Whether `p` is inside the loop `loop`. */
function inside(p: Vec, loop: readonly Vec[]) {
  let odd = false
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [a, b] = [loop[i], loop[j]]
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)) odd = !odd
  }
  return odd
}

/** The point of `line` nearest `p`: m round it, and m off it. */
function nearest(line: Polyline, p: Vec) {
  let best = { s: 0, d: Infinity }
  for (let i = 1; i < line.pts.length; i++) {
    const [a, b] = [line.pts[i - 1], line.pts[i]]
    const d = toSegment(p, a, b)
    if (d >= best.d) continue
    const seg = line.cum[i] - line.cum[i - 1]
    const t = seg > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (seg * seg))) : 0
    best = { s: line.cum[i - 1] + seg * t, d }
  }
  return best
}

/**
 * What the Walker `side` m to the left of `line` walks of `way`: off the pavement beside it, along each leg of it the
 * same way to the left, to the bench's seat beside the other of a two, or to the door's step itself.
 */
function pathOf(line: Polyline, way: Way, side: number) {
  if (!side) return polyline([...way.pts])
  const start = pointAt(line, way.s)
  const pts = [beside(start, start.heading, side)]
  for (let i = 1; i < way.pts.length; i++) {
    const [a, b] = [way.pts[i - 1], way.pts[i]]
    const heading = Math.atan2(b.y - a.y, b.x - a.x)
    const step = i === way.pts.length - 1 && way.place.kind === 'door'
    for (const p of [beside(a, heading, side), step ? b : beside(b, heading, side)]) {
      const last = pts[pts.length - 1]
      if (Math.hypot(p.x - last.x, p.y - last.y) > 1e-6) pts.push(p)
    }
  }
  return polyline(pts)
}

/**
 * The ways from the pavement `line` round the Block `loop` to those of `places` it reaches: each from the nearest
 * point of the pavement whose way keeps clear of `obstacles`, the outlines on the map of all that stands at a Walker's
 * height, and for two side by side if one does. A Place it has no clear way to, nobody goes to.
 *
 * ponytail: a way is the straight legs pavement, front, Place, so about one Place in ten with a pole or a tree before
 * it goes unused; find a way round it (a few points off to each side) if a Block looks empty of people.
 */
function waysOf(line: Polyline, loop: Vec[], places: readonly Place[], obstacles: readonly (readonly Vec[])[]) {
  const boxes = obstacles.map((o) => around([...o]))
  const ways: Way[] = []
  for (const place of places) {
    const out = place.kind === 'door' ? 1 : 0.7 // m in front of a step or a seat to come up to it from
    const front = { x: place.x - Math.sin(place.ry) * out, y: place.y + Math.cos(place.ry) * out }
    const { s, d } = nearest(line, front)
    if (!(d < 2.6 || (d < REACH && inside(place, loop)))) continue
    const starts = SHIFTS.map((shift) => wrap(s + shift, line.length))
    const reach = around([...starts.map((s) => pointAt(line, s)), front, place])
    const near = obstacles.filter(
      (o, i) =>
        overlaps(boxes[i], { x0: reach.x0 - 1, y0: reach.y0 - 1, x1: reach.x1 + 1, y1: reach.y1 + 1 }) && apart(place, place, o) > 0.35, // the bench itself, or the step
    )
    const clear = (pts: readonly Vec[]) => pts.every((b, i) => i === 0 || near.every((o) => apart(pts[i - 1], b, o) >= BODY))
    let alone: Way | undefined
    for (const s of starts) {
      const p = pointAt(line, s)
      const way = { place, s, pts: [{ x: p.x, y: p.y }, front, { x: place.x, y: place.y }], two: false }
      if (!clear(way.pts)) continue
      if ([-PAIR, PAIR].every((side) => clear(pathOf(line, way, side).pts))) {
        alone = { ...way, two: true }
        break
      }
      alone ??= way
    }
    if (alone) ways.push(alone)
  }
  return ways
}

/**
 * Where `w` is on the map, and which way they face: on their pavement, beside the other of a two, stopped facing them,
 * or alone facing in to look in a window; or on their way to a Place, at it facing out of the bench or into the door.
 */
export function whereIs(w: Walker): { x: number; y: number; heading: number } {
  if (w.path && w.way) {
    const p = pointAt(w.path, w.along)
    const { kind, ry } = w.way.place
    if (w.doing === 'act') return { x: p.x, y: p.y, heading: ry + (kind === 'bench' ? Math.PI / 2 : -Math.PI / 2) }
    return w.doing === 'back' ? { ...p, heading: p.heading + Math.PI } : p
  }
  const p = pointAt(w.line, w.s)
  const at = beside(p, p.heading, w.side)
  if (w.doing !== 'stop') return { ...at, heading: p.heading + (w.speed < 0 ? Math.PI : 0) }
  // In a two, each faces the other; alone, the side the Block is on, of a pavement run round either way.
  const left = w.side ? w.side < 0 : w.line.pts.reduce((a, q, i, pts) => a + cross(pts[0], pts[i - 1] ?? q, q), 0) > 0
  return { ...at, heading: p.heading + (left ? Math.PI / 2 : -Math.PI / 2) }
}

/** What `w` is doing now, in a few words, as the note of a Walker the player Follows says it. */
export function doingNow(w: Walker): string {
  const door = w.way?.place.kind === 'door'
  switch (w.doing) {
    case 'stroll':
      return !w.way ? 'out for a stroll' : door ? 'on an errand' : 'heading for a bench'
    case 'stop':
      return w.side ? 'stopped for a chat' : 'looking in a window'
    case 'go':
      return door ? 'going indoors' : 'sitting down on a bench'
    case 'act':
      return door ? 'indoors' : 'resting on a bench'
    case 'back':
      return door ? 'coming back out' : 'getting up from the bench'
  }
}

/**
 * The City's Walkers, each drawn once from the City's seed and the pavement they walk, so that the same City has the
 * same Walkers every time, and a placement, a Swap or an Undo of one Tile changes nobody on the others. Each walks the
 * centre line of one Block's pavement, so never crosses a Road, and leaves it only for a Place on its Block: to go in
 * at a door and come out, or sit on a bench. What each does, and when, is drawn from their own seed too. A third walk
 * in twos, and a two does all of it together. Nothing in the Sim reads them, and nothing here draws them:
 * `src/render/walkers` does.
 */
export class Walkers {
  private walkers: Walker[] = []
  /** Each pavement's ways to its Places, by the pavement's centre line. */
  private pavements: { tile: Bounds; loop: Vec[]; line: Polyline; ways: Way[] }[] = []

  /** `seed`: the City's. */
  constructor(private readonly seed: number) {}

  /** Every Walker, in the order their Tiles were added, and each of a two after the one they walk beside. */
  get all(): readonly Walker[] {
    return this.walkers
  }

  /** The other of `w`'s two: the one they walk beside, or the one who walks beside them. */
  otherOfTwo(w: Walker): Walker | undefined {
    return w.lead ?? this.walkers.find((other) => other.lead === w)
  }

  /**
   * Walkers on `pavements`, the centre lines of the pavements of the Tile `tile`, each a loop of points round its
   * Block, and the ways to the `places` on them round `obstacles` (see {@link refit}).
   */
  add(tile: Bounds, pavements: Vec[][], places: readonly Place[] = [], obstacles: readonly (readonly Vec[])[] = []) {
    for (const loop of pavements) {
      const seeds = mulberry32(pavementSeed(this.seed, loop))
      const line = polyline([...loop, loop[0]])
      this.pavements.push({ tile, loop, line, ways: waysOf(line, loop, places, obstacles) })
      for (let k = Math.max(2, Math.round(line.length / SPACING)); k > 0; k--) {
        const two = seeds() < TWOS
        const lead = walker((seeds() * 4294967296) >>> 0, tile, line, two ? -PAIR : 0)
        this.walkers.push(lead)
        if (two) this.walkers.push(walker((seeds() * 4294967296) >>> 0, tile, line, PAIR, lead))
      }
    }
  }

  /**
   * The Places of the Tile `tile` as it now stands, `places`, and `obstacles`, the outlines on the map of all that
   * stands at a Walker's height on it, after a Stage-up or a Rezoning. Its Walkers bound for a Place go back to their
   * pavement and choose again.
   */
  refit(tile: Bounds, places: readonly Place[], obstacles: readonly (readonly Vec[])[]) {
    for (const p of this.pavements) if (sameBounds(p.tile, tile)) p.ways = waysOf(p.line, p.loop, places, obstacles)
    for (const w of this.walkers) {
      if (!sameBounds(w.tile, tile) || !w.way) continue
      if (w.path) w.s = w.way.s
      Object.assign(w, { doing: 'stroll', way: undefined, path: undefined, along: 0 })
    }
  }

  /** Take the Walkers off `tiles`, which a Swap or an Undo is lifting. */
  takeOff(tiles: Bounds[]) {
    const kept = (t: Bounds) => !tiles.some((tile) => sameBounds(tile, t))
    this.walkers = this.walkers.filter((w) => kept(w.tile))
    this.pavements = this.pavements.filter((p) => kept(p.tile))
  }

  /** Walk on `dt` seconds. */
  step(dt: number) {
    for (const w of this.walkers) {
      if (w.lead) follow(w, w.lead)
      else this.live(w, dt)
    }
  }

  /** `w`'s next `dt` seconds. */
  private live(w: Walker, dt: number) {
    const pace = Math.abs(w.speed) * dt
    switch (w.doing) {
      case 'stroll': {
        const { length } = w.line
        if (w.way && wrap((w.way.s - w.s) * Math.sign(w.speed), length) <= pace) {
          Object.assign(w, { s: w.way.s, doing: 'go', path: pathOf(w.line, w.way, w.side), along: 0 })
          break
        }
        w.s = wrap(w.s + w.speed * dt, length)
        if (!w.way && (w.time -= dt) <= 0) this.choose(w)
        break
      }
      case 'stop':
        if ((w.time -= dt) <= 0) Object.assign(w, { doing: 'stroll', time: strolling(w) })
        break
      case 'go':
        if ((w.along += pace) < w.path!.length) break
        w.along = w.path!.length
        w.doing = 'act'
        w.time = w.way!.place.kind === 'door' ? 6 + roll(w) * 8 : 10 + roll(w) * 14
        break
      case 'act':
        if ((w.time -= dt) <= 0) w.doing = 'back'
        break
      case 'back':
        if ((w.along -= pace) > 0) break
        Object.assign(w, { doing: 'stroll', way: undefined, path: undefined, along: 0, time: strolling(w) })
    }
  }

  /** What `w` does next, strolling: stop, go in at a door, sit on a bench, or stroll on. */
  private choose(w: Walker) {
    const r = roll(w)
    if (r >= 0.8) {
      w.time = strolling(w)
      return
    }
    const kind = r < 0.3 ? undefined : r < 0.6 ? 'door' : 'bench'
    const { length } = w.line
    const gap = (way: Way) => Math.min(wrap(way.s - w.s, length), wrap(w.s - way.s, length))
    const ways = (this.pavements.find((p) => p.line === w.line)?.ways ?? [])
      .filter((way) => way.place.kind === kind && (way.two || !w.side))
      .sort((a, b) => gap(a) - gap(b))
      .slice(0, 3)
    if (!ways.length) {
      Object.assign(w, { doing: 'stop', time: 3 + roll(w) * 6 })
      return
    }
    w.way = ways[Math.floor(roll(w) * ways.length)]
    w.speed = Math.abs(w.speed) * (wrap(w.way.s - w.s, length) <= length / 2 ? 1 : -1)
  }
}

/** `w`, of a two, doing as `lead` does beside them. */
function follow(w: Walker, lead: Walker) {
  if (w.way !== lead.way || !lead.path) w.path = undefined
  if (lead.path && !w.path) w.path = pathOf(w.line, lead.way!, w.side)
  Object.assign(w, { s: lead.s, speed: lead.speed, doing: lead.doing, way: lead.way, time: lead.time })
  w.along = w.path && lead.path ? (lead.along * w.path.length) / lead.path.length : 0
}
