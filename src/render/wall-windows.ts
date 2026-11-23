import * as THREE from 'three'
import { mulberry32 } from '../sim/demand'
import { PATTERN, type Cladding, type Pattern } from './pattern'

/**
 * Windows as objects (#277): in the low-poly look (`./look`), what the surface pattern drew on a wall is built as small
 * boxes standing out of it, in the same bays and storeys `clad` and `wrap` lay the pattern in. A pane in every bay of
 * every storey, a sill under it, shutters either side where the pattern drew them, a door in the middle bay of the
 * ground floor where it drew one, and two panes a bay high up a shed's wall; and on an office tower's curtain wall,
 * two panes a bay between mullions, over a spandrel and a line of trim at each floor (#279). Every Zone's walls take
 * them from here. About a third of the sills are flower boxes, and pots of leaves stand along the foot of the walls
 * (#278), where the kit finds room for them once the whole Block stands.
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

/** m two boxes may overlap every way and still only touch. */
const TOUCH = 0.005
/** Whether the boxes `alo` to `ahi` and `blo` to `bhi` overlap by more than a touch every way. */
export const boxesMeet = (alo: THREE.Vector3, ahi: THREE.Vector3, blo: THREE.Vector3, bhi: THREE.Vector3) =>
  Math.min(ahi.x, bhi.x) - Math.max(alo.x, blo.x) > TOUCH &&
  Math.min(ahi.y, bhi.y) - Math.max(alo.y, blo.y) > TOUCH &&
  Math.min(ahi.z, bhi.z) - Math.max(alo.z, blo.z) > TOUCH

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
 * the window stands: a shutter the pattern drew behind a door or a bracket is left out alone (#279); and the flower box
 * that stands for its sill, if it has one (#278).
 */
type Window = { boxes: Box[]; beside?: Box[]; planted?: Planting }

/**
 * The share of windows with a sill whose sill is a flower box (#278), and of a wall's bay boundaries, its ends among
 * them, with a pot of leaves at its foot: the spec's three in five, and for its third, a little over, since the kit
 * builds the plain sill for about one in six flower boxes it finds no room for, where the sill itself stands free
 * (shops and medium-density, seed 3). It leaves out a pot it finds no room for.
 */
const PLANTED = { boxes: 0.4, pots: 0.6 }
/** What a wall's seed is mixed with to draw its flower boxes and pots, each from where it stands on the wall. */
const PLANT_SALT = 0x2781b0c5
/**
 * A flower box, m: from `tall` under its window's pane to `lip` over its foot, and `out` from the wall, as wide as the
 * sill it stands for; its clumps of leaves, two or three, about `clump` m along each, rising `rise` m over the pane's
 * foot. Only on the lowest `storeys`, where they are seen from the Kerbside: up a tower they would cost its Zone a third more
 * triangles than its ceiling allows (high-density, 2.79 M of 2.3 M) for boxes hardly seen.
 */
const FLOWER_BOX = { tall: 0.2, lip: 0.03, out: 0.3, clump: 0.6, rise: 0.18, storeys: 2 }
/**
 * A pot plant of size 1 (#157), the kit's (`pot`) and a pot of leaves at a wall's foot (#278): its pot `pot` across and
 * `potTall` tall, under leaves `leaves` across and `leavesTall` tall whose middle is `lift` up.
 */
export const POT_PLANT = { pot: 0.84, potTall: 0.55, leaves: 1, leavesTall: 0.84, lift: 0.78 }
/** A pot of leaves at a wall's foot (#278): its size from `least` to `most`, standing `off` m out from the wall. */
const POT = { ...POT_PLANT, least: 0.5, most: 0.75, off: 0.06 }

/**
 * One shape of a flower box or a pot, filling the box `lo` to `hi` in its wall's frame: a box, a pot, or a ball of leaves
 * turned `turn` about the upright. What it is painted, and the draw (0 to 1) that picks the paint from its palette.
 */
export interface Solid {
  shape: 'box' | 'pot' | 'ball'
  paint: 'planter' | 'leaves' | 'bloom'
  pick: number
  turn: number
  lo: THREE.Vector3
  hi: THREE.Vector3
}
/**
 * A flower box under a window, or a pot of leaves at the foot of a wall (#278), in its wall's frame: its shapes, and the
 * box round them all, which the kit builds them in only if nothing else stands there. A flower box carries the sill it
 * stands for, its box and its faces as triangles, for the kit to build if it does not.
 */
export interface Planting {
  kind: 'box' | 'pot'
  solids: Solid[]
  lo: THREE.Vector3
  hi: THREE.Vector3
  sill?: { lo: THREE.Vector3; hi: THREE.Vector3; faces: number[] }
}
/** A wall's windows: each part's triangles, and its flower boxes and pots, which wait for the kit to find them room. */
export interface Windows {
  parts: Map<WindowPart, number[]>
  plantings: Planting[]
  /** The doors built (#288): the middle of each leaf's foot on its outer face, and the way out of the wall, in the wall's frame. */
  doors: { at: THREE.Vector3; out: THREE.Vector3 }[]
}

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
 * number), the wall's own, never the kit's stream. A window whose boxes are not `clear` is left out, whole. Its flower
 * boxes and the pots along the foot of its walls (#278) are drawn from `seed` too, each from where it stands, so that
 * none moves for another left out.
 */
export function wallWindows(min: THREE.Vector3, max: THREE.Vector3, cladding: Cladding, seed: number, clear: Clear): Windows {
  const [w, h, d] = [max.x - min.x, max.y - min.y, max.z - min.z]
  const { bay = 3, storey = h } = cladding
  const draw = mulberry32(seed ^ SALT)
  const out = new Map<WindowPart, number[]>()
  const plantings: Planting[] = []
  // The windows built, each one's boxes, the way its wall's back faces, and the flower box for its sill; and the pots.
  const built: { boxes: Box[]; back: THREE.Vector3; planted?: Planting }[] = []
  const potted: Planting[] = []
  const doors: Windows['doors'] = []
  /** The draws of what stands at bay `b` of storey `s` of wall `wall` (-1: at the foot), one stream each (#278). */
  const drawsAt = (wall: number, s: number, b: number) =>
    mulberry32((seed ^ PLANT_SALT ^ Math.imul(((wall * 64 + s + 1) << 10) + b + 1, 0x9e3779b1)) >>> 0)
  // Each wall as `clad` takes it: its pattern, the axis it faces along and which way, where it stands, and where its
  // bays start from and run along.
  const walls = [
    { kind: cladding.front, axis: 2, sign: -1, plane: min.z, from: min.x, across: w },
    { kind: cladding.back, axis: 2, sign: 1, plane: max.z, from: min.x, across: w },
    { kind: cladding.sides, axis: 0, sign: -1, plane: min.x, from: min.z, across: d },
    { kind: cladding.sides, axis: 0, sign: 1, plane: max.x, from: min.z, across: d },
  ] as const
  for (const [i, { kind, axis, sign, plane, from, across }] of walls.entries()) {
    const spec = kind && PATTERN_WINDOWS[kind]
    if (!spec) continue
    const bays = Math.max(1, Math.round(across / bay))
    const pitch = across / bays
    const middle = Math.floor(bays / 2)
    const back = new THREE.Vector3(axis === 0 ? -sign : 0, 0, axis === 2 ? -sign : 0)
    /** The box from `u0` to `u1` along the wall, `y0` to `y1` up it, and `o0` to `o1` out from it. */
    const span = (u0: number, u1: number, y0: number, y1: number, o0: number, o1: number) => {
      const [n0, n1] = sign > 0 ? [plane + o0, plane + o1] : [plane - o1, plane - o0]
      const lo = axis === 2 ? new THREE.Vector3(from + u0, min.y + y0, n0) : new THREE.Vector3(n0, min.y + y0, from + u0)
      const hi = axis === 2 ? new THREE.Vector3(from + u1, min.y + y1, n1) : new THREE.Vector3(n1, min.y + y1, from + u1)
      return { lo, hi }
    }
    /** The box of `part` `wide` across with its middle `along` the wall, from `y0` to `y1` up it. */
    const box = (part: WindowPart, along: number, wide: number, y0: number, y1: number): Box => ({
      part,
      ...span(along - wide / 2, along + wide / 2, y0, y1, -IN, outOf(part)),
    })
    /** A ball of leaves or blooms round `(along, y, out)`, `ru` m along, `rv` up and `rw` out from its middle. */
    const ball = (
      paint: Solid['paint'],
      pick: number,
      turn: number,
      along: number,
      y: number,
      out: number,
      ru: number,
      rv: number,
      rw: number,
    ): Solid => ({
      shape: 'ball',
      paint,
      pick,
      turn,
      ...span(along - ru, along + ru, y - rv, y + rv, out - rw, out + rw),
    })
    /**
     * A flower box for the sill `sill`, its middle `along` the wall and `wide` across, under a pane whose foot is `foot`
     * m up (#278): leaves along it in clumps, every other one in bloom, and its shapes' paints from `draw`.
     */
    const flowerBox = (sill: Box, along: number, wide: number, foot: number, draw: () => number): Planting => {
      const { tall, lip, out, clump, rise } = FLOWER_BOX
      const solids: Solid[] = [
        {
          shape: 'box',
          paint: 'planter',
          pick: draw(),
          turn: 0,
          ...span(along - wide / 2, along + wide / 2, foot - tall, foot + lip, -IN, out),
        },
      ]
      const n = Math.min(3, Math.max(2, Math.round(wide / clump)))
      const [bloom, first] = [draw(), draw() < 0.5 ? 0 : 1]
      const [top, bottom] = [foot + rise, foot + lip - 0.06] // its leaves sunk a little into the soil
      for (let k = 0; k < n; k++) {
        const u = along - wide / 2 + ((k + 0.5) * wide) / n
        const [paint, pick] = k % 2 === first ? (['bloom', bloom] as const) : (['leaves', draw()] as const)
        const turn = draw() * 2 * Math.PI
        solids.push(ball(paint, pick, turn, u, (top + bottom) / 2, out / 2 + 0.02, (0.62 * wide) / n, (top - bottom) / 2, out / 2 - 0.02))
      }
      const faces: number[] = []
      boxFaces(faces, sill.lo, sill.hi, back)
      return { kind: 'box', solids, ...around(solids), sill: { lo: sill.lo, hi: sill.hi, faces } }
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
          for (const [k, p] of spec.panes.entries()) {
            const boxes = [measured(tint, p, mid, s)]
            const foot = (s + p.foot) * storey
            const [along, wide] = [mid + p.at * pitch, p.wide * pitch + 2 * SILL.over]
            let planted: Planting | undefined
            if (spec.sill) {
              const sill = box('sill', along, wide, foot - SILL.tall, foot)
              boxes.push(sill)
              const draws = drawsAt(i, s, b * spec.panes.length + k)
              if (draws() < PLANTED.boxes && s < FLOWER_BOX.storeys) planted = flowerBox(sill, along, wide, foot, draws)
            }
            windows.push({ boxes, beside: (spec.shutters ?? []).map((t) => measured('shutter', t, mid, s)), planted })
          }
        for (const { boxes, beside = [], planted } of windows) {
          if (!boxes.every(fits)) continue
          const stands = [...boxes, ...beside.filter(fits)]
          // A flower box's sill waits, for the kit to build the one or the other.
          for (const g of stands) if (!planted || g.part !== 'sill') build(g)
          built.push({ boxes: stands, back, planted })
          const [leaf] = boxes
          if (leaf.part === 'door') {
            const face = axis === 2 ? (sign > 0 ? leaf.hi.z : leaf.lo.z) : sign > 0 ? leaf.hi.x : leaf.lo.x
            const at = new THREE.Vector3((leaf.lo.x + leaf.hi.x) / 2, leaf.lo.y, (leaf.lo.z + leaf.hi.z) / 2)
            at.setComponent(axis, face)
            doors.push({ at, out: back.clone().negate() })
          }
        }
      }
    }
    // A curtain wall's mullions (#279): up the wall at each bay's inner edge and between each bay's panes, a box a run
    // of storeys clear of what else stands there, so that in fewer boxes than a storey at a time.
    if (curtain)
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
    // Pots of leaves along the wall's foot (#278), at its bay boundaries and its ends, but not by a shed's wall. The kit
    // keeps those whose wall stands on the ground, where it finds room for them.
    if (!spec.sill) continue
    const pots: Planting[] = []
    for (let b = 0; b <= bays; b++) {
      const draws = drawsAt(i, -1, b)
      if (draws() >= PLANTED.pots) continue
      const size = POT.least + (POT.most - POT.least) * draws()
      const [pot, leaves] = [(POT.pot * size) / 2, (POT.leaves * size) / 2]
      const along = Math.min(across - leaves, Math.max(leaves, pitch * b))
      if (across < 2 * leaves) continue
      const out = POT.off + leaves
      const solids: Solid[] = [
        {
          shape: 'pot',
          paint: 'planter',
          pick: draws(),
          turn: 0,
          ...span(along - pot, along + pot, 0, POT.potTall * size, out - pot, out + pot),
        },
        ball('leaves', draws(), draws() * 2 * Math.PI, along, POT.lift * size, out, leaves, (POT.leavesTall * size) / 2, leaves),
      ]
      pots.push({ kind: 'pot', solids, ...around(solids) })
    }
    potted.push(...pots)
  }
  // Each flower box and pot kept clear of the windows built, but a flower box of its own window's: a flower box that
  // is not keeps its sill. The rest of the building and the Block are the kit's to keep clear of.
  const meetsWindows = (p: Planting, own?: Box[]) =>
    built.some((w) => w.boxes !== own && w.boxes.some((g) => boxesMeet(g.lo, g.hi, p.lo, p.hi)))
  for (const { boxes, back, planted } of built) {
    if (!planted) continue
    if (!meetsWindows(planted, boxes)) plantings.push(planted)
    else boxFaces(trianglesOf(out, 'sill'), planted.sill!.lo, planted.sill!.hi, back)
  }
  plantings.push(...potted.filter((p) => !meetsWindows(p)))
  return { parts: out, plantings, doors }
}

/** The box round `solids`. */
function around(solids: Solid[]) {
  const [lo, hi] = [new THREE.Vector3(Infinity, Infinity, Infinity), new THREE.Vector3(-Infinity, -Infinity, -Infinity)]
  for (const g of solids) (lo.min(g.lo), hi.max(g.hi))
  return { lo, hi }
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
): Windows {
  const spec = PATTERN_WINDOWS[kind]
  const out = new Map<WindowPart, number[]>()
  if (!spec) return { parts: out, plantings: [], doors: [] }
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
  // ponytail: no flower boxes or pots round a cylinder, so the coral tower's tiers keep plain sills and bare feet. Lay
  // them as its panes are, square to the face under each (`m`), if a Zone ever builds homes round a cylinder.
  return { parts: out, plantings: [], doors: [] }
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
/** How many vertices `boxFaces` lays for a box, all its faces but one in two triangles: each part's triangles are runs of it, a box a run. */
export const BOX_VERTICES = (FACES.length - 1) * 6

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
