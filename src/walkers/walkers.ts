import { mulberry32 } from '../sim/demand'
import { around, overlaps, pointAt, polyline, sameBounds, type Bounds, type Polyline, type Vec } from '../sim/geometry'
import { WALKING_PACE } from '../sim/signals'
import { STORYLETS, timeOf, type Step, type Storylet, type TimeOfDay } from './storylets'

/** A kind of Walker (#176), drawn with a model of its own: a shopper with a bag, a schoolchild, an office worker. */
export type Kind = 'shopper' | 'schoolchild' | 'worker'

/**
 * What a Walker is doing (#288): strolling their pavement (or along it to where they leave it for a Place), stopped on
 * it, going off it to a Place, at the Place (indoors, sat on a bench, or indoors on the way up to a terrace), up on the
 * terrace and indoors on the way down from it (#293), or coming back to where they left it. Or (#296) waiting at the
 * kerb for the Walk phase, or crossing the Road in it.
 */
type Doing = 'stroll' | 'stop' | 'go' | 'act' | 'up' | 'down' | 'back' | 'wait' | 'cross'

/**
 * A zebra across a Road at a Junction (#296), by its two ends where the Walkers who cross it wait: each on the centre
 * line of the pavement on its side of the Road.
 */
export interface Zebra {
  readonly junction: string
  readonly ends: readonly [Vec, Vec]
}

/**
 * The seconds Walkers have left to cross at the Junction `junction` now (#296): the rest of its Walk phase once they
 * may step off the kerb, 0 while they may not, and undefined where it has no Signal.
 */
export type LeftToCross = (junction: string) => number | undefined

/**
 * One end of a zebra, as the Walkers of the pavement it is on know it: the Junction, how far round the pavement it
 * is, the way across to the other end, and the pavement there.
 */
interface ZebraEnd {
  readonly junction: string
  readonly s: number
  readonly across: Vec
  readonly to: Polyline
}

/** A spot on a pavement: its centre line, and m round it. */
interface Round {
  readonly line: Polyline
  readonly s: number
}

/**
 * A crossing a Walker makes (#296), from the moment they choose it till they are across: the Junction whose Walk
 * phase they cross in; where on their pavement they leave it; their way from there up to their spot at the kerb,
 * `kerb` m along it, and on over the Road; and where on the far pavement it comes to.
 */
interface Crossing {
  readonly junction: string
  readonly s: number
  readonly path: Polyline
  readonly kerb: number
  readonly to: Round
}

/**
 * Somewhere a Walker goes to do something (#288), noted as the City is built: a door's step, facing out of the door,
 * or a bench's seat at ground level, facing the way one sat on it looks. Or a terrace or a roof garden with room to
 * stand (#293): the step of the door it is gone up to by, and `up`, where on it one stands, or sits (`sit`), `h` m above
 * the road, facing `ry`. On the map, `ry` 0 north and π/2 west.
 */
export type Place = {
  readonly x: number
  readonly y: number
  readonly ry: number
} & (
  | { readonly kind: 'door' | 'bench' }
  | {
      readonly kind: 'terrace'
      readonly up: { readonly x: number; readonly y: number; readonly h: number; readonly ry: number; readonly sit: boolean }
    }
)

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

/** What a door of a Walker's own is to them (#291): their home, a shop they keep, or the plant they work at. */
export type Own = 'home' | 'shop' | 'plant'

/**
 * A person of the City: who they are, drawn once from their seed, and where on their pavement they walk.
 * ponytail: `home` is a phrase from a short list and names no door in the City, and with 24 names two Walkers can
 * share one; a Walker with a home of their own (`own`) lives at its door instead. The lists grow as Storylets need them.
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
  /** The centre line of the pavement they lap: their Block's, or the one across the Road they last crossed to. */
  line: Polyline
  /** m to the left of `line`, and of their way to a Place, they walk: 0 alone, and either side of it in a two. */
  readonly side: number
  /** In a two, the one they walk beside and do as. */
  readonly lead?: Walker
  /**
   * A door of their own (#291), on their Block, and what it is to them, if they have one: drawn from their seed and
   * the doors their Block's pavement reaches, so that the same City gives them the same door. In a two, the lead's,
   * which the other shares unless a schoolchild at a shop or a plant.
   */
  own?: { readonly kind: Own; readonly door: Place }
  /** m round `line`. */
  s: number
  /** m/s, either way round. */
  speed: number
  doing: Doing
  /** The way to the Place they are bound for, from the moment they choose it till they are back on `line`. */
  way?: Way
  /** What they walk of `way`, while off `line`, and `along` it m: or, crossing, of `crossing`'s way. */
  path?: Polyline
  along: number
  /** The crossing they make, from the moment they choose it till they are across. */
  crossing?: Crossing
  /** s till they next choose what to do, stop being stopped, or leave the Place. */
  time: number
  /** Where their own stream of chances has got to: what they do is drawn from it. */
  luck: number
  /** Whether the player Keeps them (#290), so that their Storylets go on while the player looks elsewhere: a two both. */
  kept: boolean
  /** s the player has Followed them, or the other of their two, since their last Storylet. In a two, the lead's. */
  followedFor: number
  /** s till a Storylet may begin for them. In a two, the lead's. */
  rest: number
  /**
   * The Storylet they are in, the beat of it they are at, and whether they have set out on it: one that begins on
   * their way somewhere waits till they are back. In a two, the lead's.
   */
  storylet?: { readonly of: Storylet; beat: number; setOut: boolean }
  /** Their Storylets, the one they are in last: in a two, one log the two share. */
  readonly log: LogEntry[]
}

/** A Storylet in a Walker's log (#290): its title, and the line of each beat done; once it has ended, its end too. */
interface LogEntry {
  readonly title: string
  readonly lines: string[]
  ended: boolean
}

/** A Storylet that has ended (#290), as the City's list of them has it: who it happened to, its title and its lines. */
export interface Ended {
  readonly who: string
  readonly title: string
  readonly lines: readonly string[]
}

const SPACING = 34 // m of pavement per Walker, or per two
const TWOS = 0.2 // of Walkers bring another, so that a third walk in twos
const PAIR = 0.4 // m either side of the line a two walk
const BODY = 0.25 // m a Walker keeps off what stands
const REACH = 20 // m in off a pavement a Place may be and be gone to
const SHIFTS = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6] // m along the pavement to try leaving it from, nearest first
const SNAP = 3 // m off a pavement's centre line a crossing's end may lie and be on it
const SPREAD = 3.6 // m along the kerb, about a zebra's middle, that those who wait to cross it stand spread over
const SPOTS = [-1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8] // m along the pavement from a zebra's end that a Walker may wait at
// m toward the kerb from the pavement's centre line of the rows those who wait stand in: the front row on the tactile
// pad, which the furniture by the kerb keeps clear of, and the one behind it.
const ROWS = [0.8, 0]
const ROOM = 0.6 // m between two Walkers who wait, a step apart
// ponytail: 14 spots at each end of a zebra; one more Walker waiting there stands where there is most room, on someone.
// About five wait at once on a busy Crossroads. Queue them back along the pavement if a crowd shows it.
const SPARE = 1.5 // m more than their way across that the Walk phase left must carry a Walker for them to start across
const PATIENCE = 150 // s a Walker waits at the kerb before they give up and stroll on
const FOLLOWED = 5 // s a Walker is Followed before a Storylet begins for them
const REST = 30 // s at least, and up to 40 s more, from the end of a Walker's Storylet till the next may begin
const BEAT = 2 // s at least, and up to 3 s more, from one beat of a Storylet done till the next is set out on
const SOON = 0.5 // s from a Storylet beginning for a Walker who strolls till they set out on its first beat
const HOME = 0.28 // of the times a Walker with a door of their own on the pavement they walk chooses what to do, they go in at it
const LATELY = 40 // ended Storylets the City's list of them holds, the newest
/**
 * A door of a Walker's own, by what it is to them (#291): the share of those who may have one who do, the lead of a two
 * or one alone, and no schoolchild for a shop or a plant, so that of all a Tile's Walkers most have a home, about a
 * third keep a shop and most work at a plant, the other of a two sharing the lead's; and what their note says of it,
 * where they live or what they do, heading for it and inside, and of a visit to it, by `host`, whose own it is.
 */
const OWN: Record<
  Own,
  {
    share: number
    home?: string
    job?: string
    heading: string
    inside: string
    visit: (host: string) => { heading: string; inside: string }
  }
> = {
  home: {
    share: 0.85,
    home: 'a home on this Block',
    heading: 'heading home',
    inside: 'at home',
    visit: (host) => ({ heading: `calling on ${host}`, inside: `at ${host}'s` }),
  },
  shop: {
    share: 0.5,
    job: 'keeps a shop on this Block',
    heading: 'heading back to the shop',
    inside: 'minding the shop',
    visit: (host) => ({ heading: `heading for ${host}'s shop`, inside: `in ${host}'s shop` }),
  },
  plant: {
    share: 0.85,
    job: 'works at the plant on this Block',
    heading: 'heading in to work',
    inside: 'at work',
    visit: (host) => ({ heading: `heading for the plant where ${host} works`, inside: `in the plant where ${host} works` }),
  },
}
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
  const life = { kept: false, followedFor: 0, rest: 0, log: lead?.log ?? [] }
  return lead ? { ...who, ...life, lead, s: lead.s, speed: lead.speed, time: lead.time } : { ...who, ...life }
}

/**
 * Draw `w`'s door of their own (#291) from those `ways` go to, their Block's pavement's, where a door is `own` to
 * whoever has one; or none. Whether they have one is drawn from a stream of their seed's own, so that all else they are
 * is drawn as before; and which, by where the doors stand rather than the order they were noted in, so that the same
 * doors give them the same door however the City was built. The other of a two shares the lead's, as they go in
 * together: they live, keep a shop or work there too, a schoolchild only at home.
 */
function drawOwn(w: Walker, ways: readonly Way[], own: Own | undefined) {
  const may = (kind: Own) => kind === 'home' || w.kind !== 'schoolchild'
  if (w.lead) {
    w.own = w.lead.own && may(w.lead.own.kind) ? w.lead.own : undefined
    return
  }
  const draw = mulberry32(w.seed ^ 0x0d0045)
  const [has, which] = [draw(), draw()]
  const doors = ways
    .filter((way) => way.place.kind === 'door' && (way.two || !w.side))
    .map((way) => way.place)
    .sort((a, b) => a.x - b.x || a.y - b.y)
  const fits = own && may(own) && doors.length > 0 && has < OWN[own].share
  w.own = fits ? { kind: own, door: doors[Math.floor(which * doors.length)] } : undefined
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
/** How long `w` stops on their pavement, s. */
const stopping = (w: Walker) => 3 + roll(w) * 6
/** `w` out of their Storylet: the next may begin once they have rested, and once Followed long enough again. */
const rests = (w: Walker) => Object.assign(w, { storylet: undefined, followedFor: 0, rest: REST + roll(w) * 40 })
/** How long `w` is indoors on the way up to a terrace or down from it, by the stairs or the lift, s. */
const stairs = (w: Walker) => 4 + roll(w) * 3

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
 * same way to the left, to the bench's seat beside the other of a two, or to the door's step itself (a terrace's too).
 */
function pathOf(line: Polyline, way: Way, side: number) {
  if (!side) return polyline([...way.pts])
  const start = pointAt(line, way.s)
  const pts = [beside(start, start.heading, side)]
  for (let i = 1; i < way.pts.length; i++) {
    const [a, b] = [way.pts[i - 1], way.pts[i]]
    const heading = Math.atan2(b.y - a.y, b.x - a.x)
    const step = i === way.pts.length - 1 && way.place.kind !== 'bench'
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
    const out = place.kind === 'bench' ? 0.7 : 1 // m in front of a seat or a step to come up to it from
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
 * or alone facing in to look in a window; or on their way to a Place, at it facing out of the bench or into the door;
 * or at the kerb facing across, or on their way across, a two side by side. Up on a terrace, `h` m above the road
 * (#293), where it has them stand or sit, beside the other of a two as on a bench; and there still as they go in again
 * on the way down, so that indoors they are where they were last seen.
 */
export function whereIs(w: Walker): { x: number; y: number; heading: number; h?: number } {
  if (w.crossing && (w.doing === 'wait' || w.doing === 'cross')) {
    const p = pointAt(w.crossing.path, w.along)
    return { ...beside(p, p.heading, w.side), heading: p.heading }
  }
  if (w.path && w.way) {
    const { place } = w.way
    if ((w.doing === 'up' || w.doing === 'down') && place.kind === 'terrace') {
      const { x, y, h, ry } = place.up
      const heading = ry + Math.PI / 2
      return { ...beside({ x, y }, heading + Math.PI, w.side), heading, h }
    }
    const p = pointAt(w.path, w.along)
    const { kind, ry } = place
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

/** Where `w` lives, as their note says it: at their own door, if it is their home (#291). */
export const homeOf = (w: Walker) => (w.own && OWN[w.own.kind].home) ?? w.home

/** What `w` does, as their note says it: keep a shop or work at a plant, if their own door is one (#291). */
export const jobOf = (w: Walker) => (w.own && OWN[w.own.kind].job) ?? w.job

/**
 * The ends of the zebras of `zebras` that join two of the pavements `lines` of one Tile, by the pavement each is on.
 * A zebra with an end on no pavement of the Tile, nobody crosses.
 */
function endsOf(lines: readonly Polyline[], zebras: readonly Zebra[]) {
  const ends = new Map<Polyline, ZebraEnd[]>(lines.map((line) => [line, []]))
  for (const {
    junction,
    ends: [from, to],
  } of zebras) {
    const [a, b] = [from, to].map((end) => {
      const near = lines.map((line) => ({ line, ...nearest(line, end) })).sort((a, b) => a.d - b.d)[0]
      return near && near.d < SNAP ? near : undefined
    })
    if (!a || !b || a.line === b.line) continue
    const across = { x: to.x - from.x, y: to.y - from.y }
    ends.get(a.line)!.push({ junction, s: a.s, across, to: b.line })
    ends.get(b.line)!.push({ junction, s: b.s, across: { x: -across.x, y: -across.y }, to: a.line })
  }
  return ends
}

/**
 * The City's Walkers, each drawn once from the City's seed and the pavement they walk, so that the same City has the
 * same Walkers every time, and a placement, a Swap or an Undo of one Tile changes nobody on the others. Each walks the
 * centre line of one Block's pavement, and leaves it only for a Place on its Block, to go in at a door and come out,
 * sit on a bench, or go in at a door, up onto its building's terrace a while (#293) and back down and out; or to cross
 * the Road at a Signal of their own Tile (#296): they wait at the kerb, facing across, for a Walk phase with time
 * enough left to reach the far kerb, and from there walk the pavement they reached, and go to its Places. Where the
 * doors of a Tile are homes, shops or plants, most of its Walkers have a home of their own, about a third a shop they
 * keep and most a plant they work at (#291): they go in and out of that door, and stay longer than a visitor would. What
 * each does, and when, is drawn from their own seed too. A third walk in twos, and a two does all of it together.
 * Nothing in the Sim reads them, and nothing here draws them: `src/render/walkers` does.
 *
 * A Storylet (#290) begins for a Walker Followed for five seconds, or Kept, once 30 to 70 s have passed since their
 * last: one of `storylets` that fits who they are, whether they walk in a two, the time of day, the door of their own
 * it needs, if any, and the Places and Signals their pavement reaches, and never the one they had last. While it runs, what they do next is its next beat,
 * and each beat's line goes in their log once done; so does its end, and then it goes in the City's list of those
 * that ended. A beat they can no longer do where they are (the Places gone in a Stage-up, the Signal they waited at
 * taken away) breaks the Storylet off, and the lines done so far stay in their log.
 */
export class Walkers {
  private walkers: Walker[] = []
  /**
   * Each pavement's ways to its Places and the zebras' ends on it, by the pavement's centre line, and the Walkers whose
   * Block's it is.
   */
  private pavements: { tile: Bounds; loop: Vec[]; line: Polyline; ways: Way[]; zebras: ZebraEnd[]; walkers: Walker[] }[] = []
  /** The Walker the player Follows (#289), if any: a Swap or an Undo that takes them off lets go of them. */
  followed: Walker | null = null
  private lately: Ended[] = []

  /** `seed`: the City's; `storylets`, every Storylet there is. */
  constructor(
    private readonly seed: number,
    private readonly storylets: readonly Storylet[] = STORYLETS,
  ) {}

  /** The Storylets that have ended lately, newest first: they outlast the Walkers they happened to. */
  get ended(): readonly Ended[] {
    return this.lately
  }

  /** The Walkers the player Keeps, a two by its lead, in the order their Tiles were added. */
  get kept(): readonly Walker[] {
    return this.walkers.filter((w) => w.kept && !w.lead)
  }

  /** Keep `w` (#290), so that their Storylets go on while the player looks elsewhere, or let them go: a two together. */
  keep(w: Walker, kept: boolean) {
    for (const one of [w, this.otherOfTwo(w)]) if (one) one.kept = kept
  }

  /**
   * The Places the pavements of the Tile `tile` reach, each by a way round all that stands there: those its Walkers go
   * to, as the scene check asks of a shed's door (#291).
   */
  reached(tile: Bounds): Place[] {
    return this.pavements.filter((p) => sameBounds(p.tile, tile)).flatMap((p) => p.ways.map((way) => way.place))
  }

  /** Every Walker, in the order their Tiles were added, and each of a two after the one they walk beside. */
  get all(): readonly Walker[] {
    return this.walkers
  }

  /** The other of `w`'s two: the one they walk beside, or the one who walks beside them. */
  otherOfTwo(w: Walker): Walker | undefined {
    return w.lead ?? this.walkers.find((other) => other.lead === w)
  }

  /**
   * What `w` is doing now, in a few words, as the note of a Walker the player Follows says it: at a door, whose it is,
   * if it is anyone's own (#291), theirs or another's.
   */
  doingNow(w: Walker): string {
    const door = w.way?.place.kind === 'door' ? w.way.place : undefined
    const host = door && (w.own?.door === door ? w : this.walkers.find((o) => o.own?.door === door))
    const says = host && (host === w ? OWN[host.own!.kind] : OWN[host.own!.kind].visit(host.name))
    if (says && w.doing === 'stroll' && !w.crossing) return says.heading
    if (says && w.doing === 'act') return says.inside
    const place = w.way?.place
    const bench = place?.kind === 'bench'
    switch (w.doing) {
      case 'stroll':
        return w.crossing
          ? 'heading for the crossing'
          : !place
            ? 'out for a stroll'
            : bench
              ? 'heading for a bench'
              : place.kind === 'door'
                ? 'on an errand'
                : 'heading for a terrace'
      case 'stop':
        return w.side ? 'stopped for a chat' : 'looking in a window'
      case 'go':
        return bench ? 'sitting down on a bench' : 'going indoors'
      case 'act':
        return bench ? 'resting on a bench' : place?.kind === 'door' ? 'indoors' : 'on the way up'
      case 'up':
        return place?.kind === 'terrace' && place.up.sit ? 'sitting out on a terrace' : 'out on a terrace'
      case 'down':
        return 'on the way down'
      case 'back':
        return bench ? 'getting up from the bench' : 'coming back out'
      case 'wait':
        return 'waiting to cross'
      case 'cross':
        return 'crossing the road'
    }
  }

  /**
   * Walkers on `pavements`, the centre lines of the pavements of the Tile `tile`, each a loop of points round its
   * Block, the ways to the `places` on them round `obstacles` (see {@link refit}), and the `zebras` between them; a
   * door on it is `own` to a Walker who has one of their own there (#291), and with none given, a door is nobody's.
   */
  add(
    tile: Bounds,
    pavements: Vec[][],
    places: readonly Place[] = [],
    obstacles: readonly (readonly Vec[])[] = [],
    zebras: readonly Zebra[] = [],
    own?: Own,
  ) {
    const lines = pavements.map((loop) => polyline([...loop, loop[0]]))
    const ends = endsOf(lines, zebras)
    for (const [i, loop] of pavements.entries()) {
      const seeds = mulberry32(pavementSeed(this.seed, loop))
      const line = lines[i]
      const pavement = { tile, loop, line, ways: waysOf(line, loop, places, obstacles), zebras: ends.get(line)!, walkers: [] as Walker[] }
      this.pavements.push(pavement)
      for (let k = Math.max(2, Math.round(line.length / SPACING)); k > 0; k--) {
        const two = seeds() < TWOS
        const lead = walker((seeds() * 4294967296) >>> 0, tile, line, two ? -PAIR : 0)
        pavement.walkers.push(lead)
        if (two) pavement.walkers.push(walker((seeds() * 4294967296) >>> 0, tile, line, PAIR, lead))
      }
      for (const w of pavement.walkers) drawOwn(w, pavement.ways, own)
      this.walkers.push(...pavement.walkers)
    }
  }

  /**
   * The Places of the Tile `tile` as it now stands, `places`, and `obstacles`, the outlines on the map of all that
   * stands at a Walker's height on it, after a Stage-up or a Rezoning, and what a door on it is to a Walker who has one
   * of their own, `own` (see {@link add}): each has their door again from those there are now. Its Walkers bound for a
   * Place go back to their pavement and choose again.
   */
  refit(tile: Bounds, places: readonly Place[], obstacles: readonly (readonly Vec[])[], own?: Own) {
    for (const p of this.pavements) {
      if (!sameBounds(p.tile, tile)) continue
      p.ways = waysOf(p.line, p.loop, places, obstacles)
      for (const w of p.walkers) drawOwn(w, p.ways, own)
    }
    for (const w of this.walkers) {
      if (!sameBounds(w.tile, tile) || !w.way) continue
      if (w.path) w.s = w.way.s
      Object.assign(w, { doing: 'stroll', way: undefined, path: undefined, along: 0 })
      // Their Storylet's beat, to set out on again soon, if the Places it needs are still there.
      if (!w.storylet) continue
      w.storylet.setOut = false
      w.time = Math.min(w.time, SOON)
    }
  }

  /** Take the Walkers off `tiles`, which a Swap or an Undo is lifting. */
  takeOff(tiles: Bounds[]) {
    const kept = (t: Bounds) => !tiles.some((tile) => sameBounds(tile, t))
    this.walkers = this.walkers.filter((w) => kept(w.tile))
    this.pavements = this.pavements.filter((p) => kept(p.tile))
    if (this.followed && !this.walkers.includes(this.followed)) this.followed = null
  }

  /**
   * Walk on `dt` seconds, with `simDt` seconds of the Sim's clock: they stroll and do things in real time, and wait at
   * the kerb and cross on the Sim's clock, by the seconds `leftToCross` at each Junction, so that at any speed of the
   * game they cross in the Walk phase the vehicles stop for. Their Storylets fit `timeOfDay`, 0–1 as the Sim's clock
   * reads it, and are Followed for in real time.
   */
  step(dt: number, leftToCross: LeftToCross = () => undefined, simDt = dt, timeOfDay = 0.25) {
    // A two's Storylets are its lead's, Followed through either of them.
    const followed = this.followed && (this.followed.lead ?? this.followed)
    for (const w of this.walkers) {
      if (w.lead) {
        follow(w, w.lead)
        continue
      }
      if (w === followed) w.followedFor += dt
      w.rest = Math.max(0, w.rest - dt)
      if (!w.storylet && !w.rest && (w.followedFor >= FOLLOWED || w.kept)) this.begin(w, timeOf(timeOfDay), leftToCross)
      this.live(w, dt, simDt, leftToCross)
    }
  }

  /** Begin a Storylet for `w`, at the time of day `now`, if one fits them. */
  private begin(w: Walker, now: TimeOfDay, leftToCross: LeftToCross) {
    // Where they will set out on it from: across the Road, if they are on their way over.
    const line = w.crossing?.to.line ?? w.line
    const last = w.log.at(-1)?.title
    const fits = this.storylets.filter(
      (s) =>
        (!s.kinds || s.kinds.includes(w.kind)) &&
        (s.pair === undefined || s.pair === (w.side !== 0)) &&
        (!s.when || s.when.includes(now)) &&
        (!s.needs || s.needs === w.own?.kind) &&
        s.title !== last &&
        this.canDo(
          w,
          line,
          s.beats.map(([step]) => step),
          leftToCross,
        ),
    )
    if (!fits.length) return
    const of = fits[Math.floor(roll(w) * fits.length)]
    w.storylet = { of, beat: 0, setOut: false }
    w.log.push({ title: of.title, lines: [], ended: false })
    if (w.doing === 'stroll' && !w.way && !w.crossing) w.time = Math.min(w.time, SOON)
  }

  /**
   * Whether `w` can do `steps` in turn from the pavement `line`: each Place there, their own door among them, that a two
   * side by side fit the way to if they walk in one, and across the Road at a Signal, the steps after it on the far
   * pavement.
   */
  private canDo(w: Walker, line: Polyline, steps: readonly Step[], leftToCross: LeftToCross): boolean {
    const pavement = this.pavements.find((p) => p.line === line)
    for (const [i, step] of steps.entries()) {
      if (step === 'cross')
        return !!pavement?.zebras.some((z) => leftToCross(z.junction) !== undefined && this.canDo(w, z.to, steps.slice(i + 1), leftToCross))
      if (step === 'home' && !this.wayHome(w, line)) return false
      if (step !== 'stop' && step !== 'home' && !pavement?.ways.some((way) => way.place.kind === step && (way.two || !w.side))) return false
    }
    return true
  }

  /**
   * Set `w` out on their Storylet's beat: false, and the Storylet broken off, if they cannot do it from where they are.
   */
  private beat(w: Walker, leftToCross: LeftToCross) {
    const storylet = w.storylet!
    const steps = storylet.of.beats.map(([step]) => step)
    const [step, after] = [steps[storylet.beat], steps.slice(storylet.beat + 1)]
    if (step === 'stop') Object.assign(w, { doing: 'stop', time: stopping(w) })
    else if (step === 'cross') {
      // At a crossing whose far pavement has what the beats after it need.
      if (!this.crossAt(w, leftToCross, (to) => this.canDo(w, to, after, leftToCross))) return this.breakOff(w)
    } else {
      const ways = step === 'home' ? [this.wayHome(w)].filter((way) => way !== undefined) : this.nearest(w, step)
      if (!ways.length) return this.breakOff(w)
      w.way = ways[Math.floor(roll(w) * ways.length)]
      headFor(w, w.way.s)
    }
    storylet.setOut = true
    return true
  }

  /**
   * `w` is back strolling their pavement, `done` with what they set out to do or turned back from it. If they had set
   * out on their Storylet's beat, done, its line goes in their log, and after the last beat, its end, and the Storylet
   * in the City's list of those that ended; turned back, the Storylet breaks off. If their Storylet began on the way,
   * they soon set out on its first beat.
   */
  private back(w: Walker, done = true) {
    const storylet = w.storylet
    if (!storylet) return
    if (!storylet.setOut) {
      w.time = Math.min(w.time, SOON)
      return
    }
    if (!done) {
      this.breakOff(w)
      return
    }
    const entry = w.log.at(-1)!
    const other = w.side ? this.otherOfTwo(w) : undefined
    // ponytail: `A` and `B` stand for the names wherever they are a word, so no line may use "A" as the article;
    // write the names as `{A}` and `{B}` if the library needs one to.
    const say = (line: string) => line.replace(/\bA\b/g, w.name).replace(/\bB\b/g, other?.name ?? '')
    entry.lines.push(say(storylet.of.beats[storylet.beat][1]))
    storylet.setOut = false
    if (++storylet.beat < storylet.of.beats.length) {
      w.time = BEAT + roll(w) * 3
      return
    }
    entry.lines.push(say(storylet.of.end))
    entry.ended = true
    this.lately.unshift({ who: other ? `${w.name} and ${other.name}` : w.name, title: entry.title, lines: [...entry.lines] })
    this.lately.length = Math.min(this.lately.length, LATELY)
    rests(w)
  }

  /** `w`'s Storylet broken off, and false: the lines done so far stay in their log, and with none, nor does it. */
  private breakOff(w: Walker) {
    if (!w.log.at(-1)!.lines.length) w.log.pop()
    rests(w)
    return false
  }

  /** The nearest three ways from `w`'s pavement to Places of the kind `kind`: ways a two fit, if they walk in one. */
  private nearest(w: Walker, kind: Place['kind']) {
    const { length } = w.line
    const gap = (way: Way) => Math.min(wrap(way.s - w.s, length), wrap(w.s - way.s, length))
    return (this.pavements.find((p) => p.line === w.line)?.ways ?? [])
      .filter((way) => way.place.kind === kind && (way.two || !w.side))
      .sort((a, b) => gap(a) - gap(b))
      .slice(0, 3)
  }

  /**
   * The way from the pavement `line`, theirs unless told, to `w`'s own door (#291), if it reaches it: a way a two fit,
   * in a two.
   */
  private wayHome(w: Walker, line = w.line) {
    const door = w.own?.door
    return door && this.pavements.find((p) => p.line === line)?.ways.find((way) => way.place === door && (way.two || !w.side))
  }

  /** `w`'s next `dt` seconds, `simDt` of the Sim's. */
  private live(w: Walker, dt: number, simDt: number, leftToCross: LeftToCross) {
    const pace = Math.abs(w.speed) * dt
    switch (w.doing) {
      case 'stroll': {
        const { length } = w.line
        const to = w.way?.s ?? w.crossing?.s
        if (to !== undefined && wrap((to - w.s) * Math.sign(w.speed), length) <= pace) {
          if (w.way) Object.assign(w, { s: to, doing: 'go', path: pathOf(w.line, w.way, w.side), along: 0 })
          else Object.assign(w, { s: to, doing: 'wait', along: 0, time: PATIENCE })
          break
        }
        w.s = wrap(w.s + w.speed * dt, length)
        if (to === undefined && (w.time -= dt) <= 0) this.choose(w, leftToCross)
        break
      }
      case 'wait': {
        // Up to their spot at the kerb, and across once the Walk phase has long enough left to reach the far kerb at
        // a brisk pace. The Signal gone, or waited long enough, they give up and stroll on.
        const { junction, path, kerb } = w.crossing!
        w.along = Math.min(kerb, w.along + pace)
        const left = leftToCross(junction)
        if (w.along === kerb && left !== undefined && left * WALKING_PACE >= path.length - kerb + SPARE) w.doing = 'cross'
        else if (left === undefined || (w.time -= simDt) <= 0) {
          strollOn(w, w)
          this.back(w, false)
        }
        break
      }
      case 'cross': {
        const { path, to } = w.crossing!
        if ((w.along += WALKING_PACE * simDt) < path.length) break
        strollOn(w, to)
        this.back(w)
        break
      }
      case 'stop':
        if ((w.time -= dt) > 0) break
        Object.assign(w, { doing: 'stroll', time: strolling(w) })
        this.back(w)
        break
      case 'go': {
        if ((w.along += pace) < w.path!.length) break
        w.along = w.path!.length
        w.doing = 'act'
        const { place } = w.way!
        // At their own door, they stay longer than a visitor would (#291).
        const visit = place === w.own?.door ? 14 + roll(w) * 26 : 6 + roll(w) * 8
        w.time = place.kind === 'door' ? visit : place.kind === 'bench' ? 10 + roll(w) * 14 : stairs(w)
        break
      }
      case 'act':
        if ((w.time -= dt) > 0) break
        if (w.way!.place.kind === 'terrace') Object.assign(w, { doing: 'up', time: 15 + roll(w) * 25 })
        else w.doing = 'back'
        break
      case 'up':
        if ((w.time -= dt) <= 0) Object.assign(w, { doing: 'down', time: stairs(w) })
        break
      case 'down':
        if ((w.time -= dt) <= 0) w.doing = 'back'
        break
      case 'back':
        if ((w.along -= pace) > 0) break
        Object.assign(w, { doing: 'stroll', way: undefined, path: undefined, along: 0, time: strolling(w) })
        this.back(w)
    }
  }

  /**
   * What `w` does next, strolling: their Storylet's next beat, if they are in one they can go on with. Or go in at their
   * own door (#291), if they have one on the pavement they walk. Or stop, go in at a door, sit on a bench, cross the
   * Road at a Signal, or stroll on. Where their pavement reaches a terrace, half the doors they would go in at are a
   * terrace's instead (#293), so that elsewhere nothing changes.
   */
  private choose(w: Walker, leftToCross: LeftToCross) {
    if (w.storylet && this.beat(w, leftToCross)) return
    const home = this.wayHome(w)
    if (home && roll(w) < HOME) {
      w.way = home
      headFor(w, home.s)
      return
    }
    const r = roll(w)
    if (r >= 0.8) {
      if (r >= 0.95 || !this.crossAt(w, leftToCross)) w.time = strolling(w)
      return
    }
    const goesUp = r >= 0.45 && r < 0.6 && this.nearest(w, 'terrace').length > 0
    const kind = r < 0.3 ? undefined : goesUp ? 'terrace' : r < 0.6 ? 'door' : 'bench'
    const ways = kind ? this.nearest(w, kind) : []
    if (!ways.length) {
      Object.assign(w, { doing: 'stop', time: stopping(w) })
      return
    }
    w.way = ways[Math.floor(roll(w) * ways.length)]
    headFor(w, w.way.s)
  }

  /**
   * Send `w` to wait at one of the nearest two crossings of their pavement whose Junction has a Signal, and whose far
   * pavement passes `reaches`, at a spot of the kerb a little along it from the zebra's middle, so that those who wait
   * stand spread along it: a spot nobody else waits at, if one is free. False if their pavement has none.
   */
  private crossAt(w: Walker, leftToCross: LeftToCross, reaches = (_to: Polyline) => true) {
    const { length } = w.line
    const gap = (s: number) => Math.min(wrap(s - w.s, length), wrap(w.s - s, length))
    const zebras = (this.pavements.find((p) => p.line === w.line)?.zebras ?? [])
      .filter((z) => leftToCross(z.junction) !== undefined && reaches(z.to))
      .sort((a, b) => gap(a.s) - gap(b.s))
      .slice(0, 2)
    if (!zebras.length) return false
    const { junction, s: middle, across, to } = zebras[Math.floor(roll(w) * zebras.length)]
    // The spots on the stretch of kerb the zebra meets, over its stripes, a two side by side on them: not round the
    // Block's corner, which a zebra's end is near.
    const end = pointAt(w.line, middle)
    const [ux, uy] = [across.x / Math.hypot(across.x, across.y), across.y / Math.hypot(across.x, across.y)]
    const stretch = SPOTS.map((d) => wrap(middle + d, length)).filter((s) => {
      const p = pointAt(w.line, s)
      const [dx, dy] = [p.x - end.x, p.y - end.y]
      return Math.abs(dx * ux + dy * uy) < 0.3 && Math.abs(dx * uy - dy * ux) + Math.abs(w.side) <= SPREAD / 2
    })
    /** The spot `row` m toward the kerb from `s` m round the pavement. */
    const spotAt = (s: number, row: number) => {
      const p = pointAt(w.line, s)
      return { x: p.x + ux * row, y: p.y + uy * row }
    }
    // Of the spots, the front row's before the one behind; of a row, those free, a step from anyone else who waits or
    // is on their way to; and with none free, the one with most room.
    const waiting = this.walkers.filter((o) => o.crossing && !o.lead && o !== w && o.doing !== 'cross')
    const spots = ROWS.flatMap((row) =>
      (stretch.length ? stretch : [middle]).map((s) => {
        const spot = spotAt(s, row)
        const room = Math.min(
          ...waiting.map((o) => {
            const q = pointAt(o.crossing!.path, o.crossing!.kerb)
            return Math.hypot(q.x - spot.x, q.y - spot.y) - Math.abs(w.side) - Math.abs(o.side)
          }),
        )
        return { s, row, room }
      }),
    )
    const free = ROWS.map((row) => spots.filter((p) => p.row === row && p.room >= ROOM)).find((row) => row.length)
    const { s, row } = free ? free[Math.floor(roll(w) * free.length)] : spots.reduce((a, b) => (b.room > a.room ? b : a))
    // Up to the spot, then straight over the Road to the far pavement, to the point of it nearest the far side of the
    // zebra from here.
    const from = spotAt(s, 0)
    const far = { line: to, s: nearest(to, { x: from.x + across.x, y: from.y + across.y }).s }
    const { x, y } = pointAt(to, far.s)
    const path = polyline(row ? [from, spotAt(s, row), { x, y }] : [from, { x, y }])
    w.crossing = { junction, s, path, kerb: row, to: far }
    headFor(w, s)
    return true
  }
}

/** `w`, of a two, doing as `lead` does beside them: across the Road with them too. */
function follow(w: Walker, lead: Walker) {
  w.line = lead.line
  if (w.way !== lead.way || !lead.path) w.path = undefined
  if (lead.path && !w.path) w.path = pathOf(w.line, lead.way!, w.side)
  Object.assign(w, { s: lead.s, speed: lead.speed, doing: lead.doing, way: lead.way, crossing: lead.crossing, time: lead.time })
  w.along = w.path && lead.path ? (lead.along * w.path.length) / lead.path.length : lead.crossing ? lead.along : 0
}

/** `w` turned to walk the shorter way round their pavement to `s` m round it. */
function headFor(w: Walker, s: number) {
  w.speed = Math.abs(w.speed) * (wrap(s - w.s, w.line.length) <= w.line.length / 2 ? 1 : -1)
}

/** `w` back to strolling, at `at` on a pavement: where they gave up waiting, or across the Road. */
function strollOn(w: Walker, at: Round) {
  Object.assign(w, { line: at.line, s: at.s, doing: 'stroll', crossing: undefined, along: 0, time: strolling(w) })
}
