import * as THREE from 'three'
import { mulberry32 } from '../sim/demand'
import { PATTERN, type Cladding, type Pattern } from './pattern'

/**
 * Windows as objects (#277): in the low-poly look (`./look`), what the surface pattern drew on a wall is built as small
 * boxes standing out of it, in the same bays and storeys `clad` and `wrap` lay the pattern in. A pane in every bay of
 * every storey, a sill under it, shutters either side where the pattern drew them, a door in the middle bay of the
 * ground floor where it drew one, and two panes a bay high up a shed's wall. Every Zone's walls take them from here.
 */

/**
 * What a box is: a pane in the glass's tint `0`, `1` or `2` (the kit's `windows`), lit at night, or one left `dark`; a
 * sill; a shutter; or a door, in a deeper shade of its wall.
 */
export type WindowPart = 0 | 1 | 2 | 'dark' | 'sill' | 'shutter' | 'door'

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
}

/**
 * m each box stands out of its wall, and how far it reaches back into it, so that no gap shows where a cut corner
 * leaves the wall behind its plane. A sill, 7 cm deep and 8 cm wider than its pane each side, is set under the pane.
 */
const OUT: Record<WindowPart, number> = { 0: 0.14, 1: 0.14, 2: 0.14, dark: 0.14, sill: 0.26, shutter: 0.08, door: 0.1 }
const IN = 0.02
const SILL = { tall: 0.07, over: 0.08 }
/** The share of panes lit at night, as the pattern's are (its `LIT`); the lit ones take the glass's three tints in turn. */
const LIT = 0.7
/** What a wall's seed is mixed with to draw which panes light, so that the draws are not the pattern's tag. */
const SALT = 0x2779b0c5
/** m a storey's window may stand over the top of its wall, past rounding, and still be built. */
const SLACK = 0.01

/** Whether a box `lo` to `hi`, in its wall's frame, is clear of everything else its building put there. */
export type Clear = (lo: THREE.Vector3, hi: THREE.Vector3) => boolean
/** A box of a window, `lo` to `hi` in its wall's frame (round a cylinder, in the window's own frame). */
type Box = { part: WindowPart; lo: THREE.Vector3; hi: THREE.Vector3 }

/** Whether `cladding` puts windows on any wall. */
export const windowed = (cladding: Cladding) => [cladding.front, cladding.back, cladding.sides].some((k) => k && PATTERN_WINDOWS[k])
/** Whether a cylinder wearing `kind` (`wrap`) has windows round it. */
export const wrapsWindows = (kind: Pattern) => !!PATTERN_WINDOWS[kind]

/** How many storeys of `spec`'s windows stand on a wall `tall` m high in storeys of `storey` m. */
const storeysOf = (spec: PatternWindows, storey: number, tall: number) => {
  const top = Math.max(...spec.panes.map((p) => p.foot + p.tall))
  return Math.max(0, Math.floor((tall + SLACK) / storey - top) + 1)
}
/** A bay's pane, from its draw: lit in one of the glass's tints, or dark. */
const tintOf = (lit: number): WindowPart => (lit < LIT ? (Math.floor((lit / LIT) * 3) as 0 | 1 | 2) : 'dark')
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
      const [n0, n1] = sign > 0 ? [plane - IN, plane + OUT[part]] : [plane - OUT[part], plane + IN]
      const lo = axis === 2 ? new THREE.Vector3(u0, min.y + y0, n0) : new THREE.Vector3(n0, min.y + y0, u0)
      const hi = axis === 2 ? new THREE.Vector3(u1, min.y + y1, n1) : new THREE.Vector3(n1, min.y + y1, u1)
      return { part, lo, hi }
    }
    /** The box of `part` measured `m` in the bay whose middle is `mid` m along, in storey `s`. */
    const measured = (part: WindowPart, m: Measure, mid: number, s: number) =>
      box(part, mid + m.at * pitch, m.wide * pitch, (s + m.foot) * storey, (s + m.foot + m.tall) * storey)
    for (let s = 0; s < storeysOf(spec, storey, h); s++) {
      for (let b = 0; b < bays; b++) {
        const mid = pitch * (b + 0.5)
        const tint = tintOf(draw()) // one a bay, whether a pane or a door stands there, so that nothing left out moves the rest
        const ground = s === 0 && b === middle
        if (ground && spec.open && bays % 2) continue
        const windows: Box[][] = []
        if (ground && spec.door) windows.push([measured('door', spec.door.leaf, mid, 0), measured(tint, spec.door.pane, mid, 0)])
        else
          for (const p of spec.panes) {
            const boxes = [measured(tint, p, mid, s)]
            const foot = (s + p.foot) * storey
            if (spec.sill) boxes.push(box('sill', mid + p.at * pitch, p.wide * pitch + 2 * SILL.over, foot - SILL.tall, foot))
            for (const t of spec.shutters ?? []) boxes.push(measured('shutter', t, mid, s))
            windows.push(boxes)
          }
        for (const boxes of windows)
          if (boxes.every((g) => clear(g.lo, g.hi))) for (const g of boxes) boxFaces(trianglesOf(out, g.part), g.lo, g.hi, back)
      }
    }
  }
  return out
}

/**
 * The windows round a cylinder or a cone in its own frame, its foot at y = 0, as `wrap` lays `kind` round it: `r` m in
 * radius at its foot and `top` m at its top, `tall` m tall, in `segments` flat faces round, in bays of about `bay` m
 * round its foot and storeys of `storey` m. Each box stands square to the face under it, leaning in as a cone does; its
 * faces as triangles in that frame. Panes light as `seed` has them; a window not `clear` is left out.
 */
export function wrapWindows(
  r: number,
  top: number,
  tall: number,
  segments: number,
  bay: number,
  storey: number,
  kind: Pattern,
  seed: number,
  clear: Clear,
) {
  const spec = PATTERN_WINDOWS[kind]
  const out = new Map<WindowPart, number[]>()
  if (!spec) return out
  const bays = Math.max(1, Math.round((2 * Math.PI * r) / bay))
  const draw = mulberry32(seed ^ SALT)
  const lean = Math.atan2(r - top, tall)
  const [m, turn, lift] = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()]
  const corner = new THREE.Vector3()
  const back = new THREE.Vector3(0, 0, -1)
  /** Whether `g`, placed by `m`, is clear: the box round its corners, in the cylinder's frame. */
  const fits = (g: Box) => {
    const [lo, hi] = [new THREE.Vector3(Infinity, Infinity, Infinity), new THREE.Vector3(-Infinity, -Infinity, -Infinity)]
    for (let k = 0; k < 8; k++) {
      corner.set(k & 1 ? g.hi.x : g.lo.x, k & 2 ? g.hi.y : g.lo.y, k & 4 ? g.hi.z : g.lo.z).applyMatrix4(m)
      lo.min(corner)
      hi.max(corner)
    }
    return clear(lo, hi)
  }
  for (let s = 0; s < storeysOf(spec, storey, tall); s++) {
    for (let b = 0; b < bays; b++) {
      const tint = tintOf(draw())
      for (const p of spec.panes) {
        const [y0, y1] = [(s + p.foot) * storey, (s + p.foot + p.tall) * storey]
        const mid = (y0 + y1) / 2
        const at = r + ((top - r) * mid) / tall // the radius there
        const wide = p.wide * ((2 * Math.PI * at) / bays)
        // Square to the face under it, out from the middle of the bay, its foot at the window's middle.
        const theta = ((b + 0.5 + p.at) / bays) * 2 * Math.PI
        const sink = at * (1 - Math.cos(Math.PI / segments)) + IN // as deep as a flat face lies inside its corners
        m.makeTranslation(0, mid, 0)
          .multiply(turn.makeRotationY(theta))
          .multiply(lift.makeTranslation(0, 0, at))
          .multiply(turn.makeRotationX(-lean))
        const boxes: Box[] = [
          { part: tint, lo: new THREE.Vector3(-wide / 2, y0 - mid, -sink), hi: new THREE.Vector3(wide / 2, y1 - mid, OUT[tint]) },
        ]
        if (spec.sill)
          boxes.push({
            part: 'sill',
            lo: new THREE.Vector3(-wide / 2 - SILL.over, y0 - mid - SILL.tall, -sink),
            hi: new THREE.Vector3(wide / 2 + SILL.over, y0 - mid, OUT.sill),
          })
        if (boxes.every(fits)) for (const g of boxes) boxFaces(trianglesOf(out, g.part), g.lo, g.hi, back, m)
      }
    }
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
