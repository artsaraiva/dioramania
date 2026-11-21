import * as THREE from 'three'
import { mulberry32 } from '../sim/demand'
import { PATTERN, type Cladding, type Pattern } from './pattern'

/**
 * Windows as objects (#277): in the low-poly look (`./look`), what the surface pattern drew on a wall is built as small
 * boxes standing out of it, in the same bays and storeys `clad` and `wrap` lay the pattern in. A pane in every bay of
 * every storey, a sill under it, shutters either side where the pattern drew them, a door in the middle bay of the
 * ground floor where it drew one, and two panes a bay high up a shed's wall; and on an office tower's curtain wall,
 * two panes a bay between mullions, over a spandrel and a line of trim at each floor (#279). Every Zone's walls take
 * them from here.
 */

/**
 * What a box is: a pane in the glass's tint `0`, `1` or `2` (the kit's `windows`), lit at night, or one left `dark`; a
 * pane of a curtain wall (`CurtainPart`); or its trim (`Trim`).
 */
export type WindowPart = 0 | 1 | 2 | 'dark' | CurtainPart | Trim
/**
 * What stands round a window that is not glass: a sill; a shutter; a door or a curtain wall's spandrel, in a deeper
 * shade of its wall; or a curtain wall's line of trim at a floor or a mullion.
 */
type Trim = 'sill' | 'shutter' | 'door' | 'spandrel' | 'line' | 'mullion'
/** A pane of a curtain wall (#279) as a part: its third, its tone and whether it is lit (`CurtainPane`). */
export type CurtainPart = `curtain ${0 | 1 | 2} ${0 | 1 | 2} ${'lit' | 'dark'}`
/**
 * A pane of a curtain wall (#279), in its wall's own glass: which third of the wall's height it stands in, from the
 * foot (0 to 2), as the glass pales toward the sky a third at a time; its tone, darker, as it is or paler (0 to 2); and
 * whether its floor is lit at night.
 */
export interface CurtainPane {
  third: number
  tone: number
  lit: boolean
}
/** Whether `part` is a pane of a curtain wall. */
export const isCurtain = (part: WindowPart): part is CurtainPart => typeof part === 'string' && part.startsWith('curtain')
/** A curtain wall's `part` as the pane it is. */
export function curtainPane(part: CurtainPart): CurtainPane {
  const [, third, tone, lit] = part.split(' ')
  return { third: Number(third), tone: Number(tone), lit: lit === 'lit' }
}

/** Where a box lies, as shares of its bay across from the bay's middle and of its storey up from its floor, and how wide and tall. */
interface Measure {
  at: number
  wide: number
  foot: number
  tall: number
}

/** A pattern's windows: the boxes it drew in a bay of a storey. */
interface PatternWindows {
  /** Its panes in a bay: one in the middle, or a shed's two either side of a mullion. */
  panes: Measure[]
  sill?: boolean
  /** Its shutters, either side of its pane. */
  shutters?: Measure[]
  /** A door in the middle bay of the ground floor, and the pane in the door. */
  door?: { leaf: Measure; pane: Measure }
  /** Whether the middle bay of the ground floor is left for the door the Zone builds there, where the bays are odd. */
  open?: boolean
  /**
   * A curtain wall's (#279): across the foot of each storey, a spandrel in a deeper shade of the wall under a line of
   * trim at the floor, along the whole of a flat wall and across each bay round a round one; mullions of trim up the
   * wall, at each bay's edge and between its panes; and its panes in the wall's own glass, lit floor by floor across
   * the building (`floorsLit`).
   */
  curtain?: { spandrel: Measure; line: Measure; mullions: { edge: Measure; middle: Measure } }
}

const TEXELS = 128 // on a side of a pattern's layer (`./pattern`), which a bay and a storey take
/** A box `wide` by `tall` texels of its pattern's layer with its foot `foot` up, its middle `at` texels from the bay's. */
const measure = (wide: number, tall: number, foot: number, at = 0): Measure => ({
  at: at / TEXELS,
  wide: wide / TEXELS,
  foot: foot / TEXELS,
  tall: tall / TEXELS,
})
// Each windowed pattern's boxes, measured off its layer in `./pattern`'s `drawLayers`.
// ponytail: copied by hand, so a layer redrawn there leaves these behind; the surface pattern is to go once the
// low-poly look is the game's one look (#281), and then these are the measures.
const HIGH = [measure(30, 20, 80)] // a ground floor's high window
const TERRACED = [measure(48, 53, 41)] // a terraced house's
const SHUTTERED = [measure(44, 47, 36)] // a house's, between
const SHUTTERS = [measure(20, 53, 33, -35), measure(20, 53, 33, 35)]
const PATTERN_WINDOWS: Partial<Record<Pattern, PatternWindows>> = {
  [PATTERN.storey]: { panes: [measure(56, 58, 37)], sill: true },
  [PATTERN.wall]: { panes: HIGH, sill: true },
  [PATTERN.back]: { panes: HIGH, sill: true, door: { leaf: measure(34, 72, 8), pane: measure(22, 18, 54) } },
  [PATTERN.house]: { panes: TERRACED, sill: true },
  [PATTERN.rear]: { panes: TERRACED, sill: true, door: { leaf: measure(44, 86, 4), pane: measure(30, 22, 60) } },
  [PATTERN.home]: { panes: SHUTTERED, sill: true, shutters: SHUTTERS },
  [PATTERN.homeFront]: { panes: SHUTTERED, sill: true, shutters: SHUTTERS, open: true },
  [PATTERN.corrugated]: { panes: [measure(61, 17, 90, -32), measure(61, 17, 90, 32)] },
  [PATTERN.curtain]: {
    panes: [measure(61, 105, 23, -31.5), measure(61, 105, 23, 31.5)],
    // The middle mullion runs the storey's whole height, over its spandrel, as the edges' do: one box up the wall.
    curtain: {
      spandrel: measure(128, 19, 0),
      line: measure(128, 4, 19),
      mullions: { edge: measure(4, 128, 0, -64), middle: measure(2, 128, 0) },
    },
  },
}

/**
 * m each box stands out of its wall, and how far it reaches back into it, so that no gap shows where a cut corner
 * leaves the wall behind its plane. A sill, 7 cm deep and 8 cm wider than its pane each side, is set under the pane. A
 * curtain wall's panes stand out as far as a window's, flush with the line of trim under them, over a spandrel nearer
 * the wall and between mullions a little prouder.
 */
const OUT: Record<Trim | 'pane', number> = { pane: 0.14, sill: 0.26, shutter: 0.08, door: 0.1, spandrel: 0.06, line: 0.14, mullion: 0.16 }
/** Whether `part` is trim, not glass. */
const isTrim = (part: WindowPart): part is Trim => typeof part === 'string' && part in OUT
/** m a box of `part` stands out of its wall. */
const outOf = (part: WindowPart) => (isTrim(part) ? OUT[part] : OUT.pane)
const IN = 0.02
const SILL = { tall: 0.07, over: 0.08 }
/** The share of panes lit at night, as the pattern's are (its `LIT`); the lit ones take the glass's three tints in turn. */
const LIT = 0.7
/** What a wall's seed is mixed with to draw which panes light, so that the draws are not the pattern's tag; and which of a curtain wall's floors. */
const SALT = 0x2779b0c5
const FLOORS = 0x1c6e3a95
/** m a storey's window may stand over the top of its wall, past rounding, and still be built. */
const SLACK = 0.01

/** The way out of a flat wall: along `axis`, toward `sign`. */
export interface WallOut {
  axis: 0 | 2
  sign: number
}
/**
 * Whether a box `lo` to `hi`, in its wall's frame, is clear of everything else its building put there (#279). On a
 * curtain wall, a part that stands through the box, from behind the wall to about as far out as the box, does not count
 * (the `out` of a flat wall), as the glass runs behind a post or a fin; nor round a round wall does one that lies nearer
 * its axis than `inside` m, as a dome sunk in its top.
 */
export type Clear = (lo: THREE.Vector3, hi: THREE.Vector3, wall?: { out?: WallOut; inside?: number }) => boolean
/**
 * A box of a window, `lo` to `hi` in its wall's frame, or round a cylinder in its own frame, which `m` places in its
 * wall's, its back `inside` m from the cylinder's axis.
 */
type Box = { part: WindowPart; lo: THREE.Vector3; hi: THREE.Vector3; m?: THREE.Matrix4; inside?: number }
/**
 * A window's boxes, built only if all of them are clear, and those `beside` it, each built if it is clear itself once
 * the window stands: a shutter the pattern drew behind a door or a bracket is left out alone (#279).
 */
type Window = { boxes: Box[]; beside?: Box[] }

/** Whether a wall wearing `kind`, flat (`clad`) or round (`wrap`), has windows, which low poly builds as boxes. */
export const drawsWindows = (kind: number) => kind in PATTERN_WINDOWS
/** Whether `cladding` puts windows on any wall. */
export const windowed = (cladding: Cladding) => [cladding.front, cladding.back, cladding.sides].some((k) => k && drawsWindows(k))

/** How many storeys of `spec`'s windows stand on a wall `tall` m high in storeys of `storey` m. */
const storeysOf = (spec: PatternWindows, storey: number, tall: number) => {
  const top = Math.max(...spec.panes.map((p) => p.foot + p.tall))
  return Math.max(0, Math.floor((tall + SLACK) / storey - top) + 1)
}
/** A bay's pane, from its draw: lit in one of the glass's tints, or dark. */
const tintOf = (draw: number): WindowPart => (draw < LIT ? (Math.floor((draw / LIT) * 3) as 0 | 1 | 2) : 'dark')
/**
 * A curtain wall's panes on a wall `storeys` tall (#279): pane `k` of a bay from the bay's draw `u`, in storey `s`, in
 * the third of the wall it stands in, a tone of its own, and lit if its floor is. `share` of the floors are lit, one
 * draw a floor from `seed` on a stream of their own, so that a floor is lit across every wall of its building.
 */
function floorsLit(storeys: number, share: number, seed: number) {
  const draw = mulberry32(seed ^ FLOORS)
  const litFloors = Array.from({ length: storeys }, () => draw() < share)
  return (u: number, k: number, s: number): CurtainPart => {
    const third = Math.min(2, Math.floor(((s + 0.5) / storeys) * 3)) as 0 | 1 | 2
    const tone = Math.floor((u * 3 ** (k + 1)) % 3) as 0 | 1 | 2
    return `curtain ${third} ${tone} ${litFloors[s] ? 'lit' : 'dark'}`
  }
}
/** The triangles of `part` so far in `out`. */
const trianglesOf = (out: Map<WindowPart, number[]>, part: WindowPart) => out.get(part) ?? out.set(part, []).get(part)!

/**
 * The windows of a box in its own frame, `min` to `max`, that wears `cladding`, as `clad` lays it: each part's boxes'
 * faces as triangles in that frame, all but the face against the wall. Which panes light comes from `seed` (any whole
 * number), the wall's own, never the kit's stream. A window whose boxes are not `clear` is left out, whole.
 */
export function wallWindows(min: THREE.Vector3, max: THREE.Vector3, cladding: Cladding, seed: number, clear: Clear) {
  const [w, h, d] = [max.x - min.x, max.y - min.y, max.z - min.z]
  const { bay = 3, storey = h } = cladding
  const draw = mulberry32(seed ^ SALT)
  const out = new Map<WindowPart, number[]>()
  // Each wall as `clad` takes it: its pattern, the axis it faces along and which way, where it stands, and where its
  // bays start from and run along.
  const walls = [
    { kind: cladding.front, axis: 2, sign: -1, plane: min.z, from: min.x, across: w },
    { kind: cladding.back, axis: 2, sign: 1, plane: max.z, from: min.x, across: w },
    { kind: cladding.sides, axis: 0, sign: -1, plane: min.x, from: min.z, across: d },
    { kind: cladding.sides, axis: 0, sign: 1, plane: max.x, from: min.z, across: d },
  ] as const
  for (const { kind, axis, sign, plane, from, across } of walls) {
    const spec = kind && PATTERN_WINDOWS[kind]
    if (!spec) continue
    const bays = Math.max(1, Math.round(across / bay))
    const pitch = across / bays
    const middle = Math.floor(bays / 2)
    const back = new THREE.Vector3(axis === 0 ? -sign : 0, 0, axis === 2 ? -sign : 0)
    /** The box of `part` `wide` across with its middle `along` the wall, from `y0` to `y1` up it. */
    const box = (part: WindowPart, along: number, wide: number, y0: number, y1: number): Box => {
      const [u0, u1] = [from + along - wide / 2, from + along + wide / 2]
      const [n0, n1] = sign > 0 ? [plane - IN, plane + outOf(part)] : [plane - outOf(part), plane + IN]
      const lo = axis === 2 ? new THREE.Vector3(u0, min.y + y0, n0) : new THREE.Vector3(n0, min.y + y0, u0)
      const hi = axis === 2 ? new THREE.Vector3(u1, min.y + y1, n1) : new THREE.Vector3(n1, min.y + y1, u1)
      return { part, lo, hi }
    }
    /** The box of `part` measured `m` in the bay whose middle is `mid` m along, from storey `s` to storey `to`'s top. */
    const measured = (part: WindowPart, m: Measure, mid: number, s: number, to = s) =>
      box(part, mid + m.at * pitch, m.wide * pitch, (s + m.foot) * storey, (to + m.foot + m.tall) * storey)
    /** The box of `part` as high up storey `s` as `m` is in a bay, along the whole wall. */
    const band = (part: WindowPart, m: Measure, s: number) =>
      box(part, across / 2, across, (s + m.foot) * storey, (s + m.foot + m.tall) * storey)
    const storeys = storeysOf(spec, storey, h)
    const { curtain } = spec
    const curtainPart = curtain && floorsLit(storeys, cladding.lit ?? 0, seed)
    const wall = curtain ? { out: { axis, sign } } : undefined
    const fits = (g: Box) => clear(g.lo, g.hi, wall)
    const build = (g: Box) => boxFaces(trianglesOf(out, g.part), g.lo, g.hi, back)
    for (let s = 0; s < storeys; s++) {
      for (let b = 0; b < bays; b++) {
        const mid = pitch * (b + 0.5)
        const u = draw() // one a bay, whether a pane or a door stands there, so that nothing left out moves the rest
        const tint = tintOf(u)
        const ground = s === 0 && b === middle
        if (ground && spec.open && bays % 2) continue
        const windows: Window[] = []
        if (ground && spec.door) windows.push({ boxes: [measured('door', spec.door.leaf, mid, 0), measured(tint, spec.door.pane, mid, 0)] })
        else if (curtain && curtainPart) {
          // Its spandrel and its line along the whole wall with the storey's first bay, in fewer boxes than a bay at a
          // time; each pane a window of its own.
          if (b === 0) windows.push({ boxes: [band('spandrel', curtain.spandrel, s), band('line', curtain.line, s)] })
          spec.panes.forEach((p, k) => windows.push({ boxes: [measured(curtainPart(u, k, s), p, mid, s)] }))
        } else
          for (const p of spec.panes) {
            const boxes = [measured(tint, p, mid, s)]
            const foot = (s + p.foot) * storey
            if (spec.sill) boxes.push(box('sill', mid + p.at * pitch, p.wide * pitch + 2 * SILL.over, foot - SILL.tall, foot))
            windows.push({ boxes, beside: (spec.shutters ?? []).map((t) => measured('shutter', t, mid, s)) })
          }
        for (const { boxes, beside = [] } of windows) if (boxes.every(fits)) [...boxes, ...beside.filter(fits)].forEach(build)
      }
    }
    // A curtain wall's mullions (#279): up the wall at each bay's inner edge and between each bay's panes, a box a run
    // of storeys clear of what else stands there, so that in fewer boxes than a storey at a time.
    if (!curtain) continue
    for (let k = 1; k < 2 * bays; k++) {
      const [m, mid] = k % 2 ? [curtain.mullions.middle, (pitch * k) / 2] : [curtain.mullions.edge, pitch * (k / 2 + 0.5)]
      let first = -1
      for (let s = 0; s <= storeys; s++) {
        const clearHere = s < storeys && fits(measured('mullion', m, mid, s))
        if (clearHere && first < 0) first = s
        if (!clearHere && first >= 0) build(measured('mullion', m, mid, first, s - 1))
        if (!clearHere) first = -1
      }
    }
  }
  return out
}

/** How `wrap` lays a pattern round a cylinder: its kind, in bays of about `bay` m round its foot and storeys of `storey` m, `lit` of a curtain wall's floors lit. */
interface Wrapping {
  kind: Pattern
  bay: number
  storey: number
  lit?: number
}

/**
 * The windows round a cylinder or a cone in its own frame, its foot at y = 0, as `wrap` lays its pattern round it (`
 * Wrapping`): `r` m in radius at its foot and `top` m at its top, `tall` m tall, in `segments` flat faces round. Each
 * box stands square to the face under it, leaning in as a cone does; its faces as triangles in that frame. Panes light
 * as `seed` has them; a window not `clear` is left out.
 */
export function wrapWindows(
  r: number,
  top: number,
  tall: number,
  segments: number,
  { kind, bay, storey, lit = 0 }: Wrapping,
  seed: number,
  clear: Clear,
) {
  const spec = PATTERN_WINDOWS[kind]
  const out = new Map<WindowPart, number[]>()
  if (!spec) return out
  const bays = Math.max(1, Math.round((2 * Math.PI * r) / bay))
  const draw = mulberry32(seed ^ SALT)
  const lean = Math.atan2(r - top, tall)
  const turn = new THREE.Matrix4()
  const corner = new THREE.Vector3()
  const back = new THREE.Vector3(0, 0, -1)
  /** Whether `g`, placed by its `m`, is clear: the box round its corners, in the cylinder's frame. */
  const fits = (g: Box) => {
    const [lo, hi] = [new THREE.Vector3(Infinity, Infinity, Infinity), new THREE.Vector3(-Infinity, -Infinity, -Infinity)]
    for (let k = 0; k < 8; k++) {
      corner.set(k & 1 ? g.hi.x : g.lo.x, k & 2 ? g.hi.y : g.lo.y, k & 4 ? g.hi.z : g.lo.z).applyMatrix4(g.m!)
      lo.min(corner)
      hi.max(corner)
    }
    return clear(lo, hi, { inside: g.inside })
  }
  /**
   * The box of `part` measured `p` in bay `b` from storey `s` to storey `to`'s top: square to the face under it, out
   * from the middle of the bay, in a frame whose foot is at the box's middle.
   */
  const measured = (part: WindowPart, p: Measure, b: number, s: number, to = s): Box => {
    const [y0, y1] = [(s + p.foot) * storey, (to + p.foot + p.tall) * storey]
    const mid = (y0 + y1) / 2
    const at = r + ((top - r) * mid) / tall // the radius there
    const wide = p.wide * ((2 * Math.PI * at) / bays)
    const theta = ((b + 0.5 + p.at) / bays) * 2 * Math.PI
    const sink = at * (1 - Math.cos(Math.PI / segments)) + IN // as deep as a flat face lies inside its corners
    const m = new THREE.Matrix4()
      .makeTranslation(0, mid, 0)
      .multiply(turn.makeRotationY(theta))
      .multiply(turn.makeTranslation(0, 0, at))
      .multiply(turn.makeRotationX(-lean))
    const [lo, hi] = [new THREE.Vector3(-wide / 2, y0 - mid, -sink), new THREE.Vector3(wide / 2, y1 - mid, outOf(part))]
    return { part, lo, hi, m, inside: (at - sink) * Math.cos(lean) }
  }
  const build = (g: Box) => boxFaces(trianglesOf(out, g.part), g.lo, g.hi, back, g.m)
  const storeys = storeysOf(spec, storey, tall)
  const { curtain } = spec
  const curtainPart = curtain && floorsLit(storeys, lit, seed)
  for (let s = 0; s < storeys; s++) {
    for (let b = 0; b < bays; b++) {
      const u = draw()
      const windows: Box[][] = []
      if (curtain && curtainPart)
        windows.push([
          ...spec.panes.map((p, k) => measured(curtainPart(u, k, s), p, b, s)),
          measured('spandrel', curtain.spandrel, b, s),
          measured('line', curtain.line, b, s),
        ])
      else
        for (const p of spec.panes) {
          const pane = measured(tintOf(u), p, b, s)
          const boxes = [pane]
          const { lo, hi, m } = pane
          if (spec.sill)
            boxes.push({
              part: 'sill',
              lo: new THREE.Vector3(lo.x - SILL.over, lo.y - SILL.tall, lo.z),
              hi: new THREE.Vector3(hi.x + SILL.over, lo.y, OUT.sill),
              m,
              inside: pane.inside,
            })
          windows.push(boxes)
        }
      for (const boxes of windows) if (boxes.every(fits)) boxes.forEach(build)
    }
  }
  // A round curtain wall's mullions (#279): one box up the whole wall at each bay's edge and between its panes, where
  // nothing else stands round a round tower's glass to break them.
  if (curtain)
    for (let b = 0; b < bays; b++)
      for (const m of [curtain.mullions.edge, curtain.mullions.middle]) {
        const g = measured('mullion', m, b, 0, storeys - 1)
        if (storeys && fits(g)) build(g)
      }
  return out
}

/** A box's faces: each one's axis and side, and its four corners (1 the far end of each axis) round counter-clockwise from outside. */
// prettier-ignore
const FACES: [number, number, number[][]][] = [
  [0, 1, [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
  [0, -1, [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
  [1, 1, [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
  [1, -1, [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
  [2, 1, [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
  [2, -1, [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
]

/**
 * Push the faces of the box `lo` to `hi` onto `to` as triangles, wound to face out, all but the one facing `back` (an
 * axis, signed), which lies against the wall: placed by `m` if given.
 */
function boxFaces(to: number[], lo: THREE.Vector3, hi: THREE.Vector3, back: THREE.Vector3, m?: THREE.Matrix4) {
  const v = new THREE.Vector3()
  const corner = ([x, y, z]: number[]) => {
    v.set(x ? hi.x : lo.x, y ? hi.y : lo.y, z ? hi.z : lo.z)
    if (m) v.applyMatrix4(m)
    return [v.x, v.y, v.z]
  }
  for (const [axis, side, quad] of FACES) {
    if (back.getComponent(axis) === side) continue
    const [a, b, c, e] = quad.map(corner)
    to.push(...a, ...b, ...c, ...a, ...c, ...e)
  }
}
