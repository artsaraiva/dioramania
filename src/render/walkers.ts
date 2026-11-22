import * as THREE from 'three'
import type { Bounds, Vec } from '../sim/geometry'
import type { Network } from '../sim/network'
import { whereIs, Walkers, type Kind, type Place, type Walker } from '../walkers/walkers'
import { KERB } from './blocks'
import { inside, type Field } from './field'
import { LOW_POLY } from './look'
import { merged, part, takesPaint, tint } from './shapes'

const INSET = 1.6 // m in from the kerb: the pavement's centre line
// The cars' colours, a walker's paint: every walker wears one, on whatever of its model takes paint (`model`).
const SHIRTS = ['#db6982', '#009dcb', '#ffc52d', '#ffffff', '#64cb9f', '#bc9ef2', '#2f3440', '#ff9cbb'].map((c) => new THREE.Color(c))
// What a Walker wears, and where in its stride it is, from bits of its own seed: the same Walker looks the same every time.
const paintOf = (walker: Walker) => SHIRTS[walker.seed % SHIRTS.length]
const phaseOf = (walker: Walker) => ((walker.seed >>> 3) % 1000) / 100
// Whether a Walker talks with a hand when stopped with another, or sat beside them: most do.
const talks = (walker: Walker) => walker.seed % 5 < 3
const SEAT = 0.52 // m up from the pavement the top of a bench's seat is
const EASE = 5 // how quickly a walker sits, gets up, stops swinging and turns, per s
// The marker over the Walker followed (#289): the prototype's yellow gem, `size` m tall, at least `least` px tall on
// screen however far out, `over` its own height above the head, bobbing and turning, rimmed `rim` of its size in the
// kit's ink (src/ui/kit.css).
const MARKER = { colour: '#ffd35c', ink: '#2b2622', size: 0.84, least: 22, over: 0.9, rim: 0.16 }
// A click on a Walker: within `reach` m of the line from their feet to the top of their head, and by default `slack` px
// more, so that one is easy to hit far out.
const PICK = { reach: 0.3, slack: 4 }

const [BODY, LEFT_LEG, RIGHT_LEG, LEFT_ARM, RIGHT_ARM, HEAD] = [0, 1, 2, 3, 4, 5]
const SWING = 0.62 // how far a leg swings either way, in radians

/** Mark `g` as part of `limb`, which turns about the point `(px, py)` of the figure's side view (x ahead, y up); a head turns about the upright through `px`. */
const of = (g: THREE.BufferGeometry, limb: number, px = 0, py = 0) => {
  const joint = new Float32Array(g.attributes.position.count * 3)
  for (let i = 0; i < joint.length; i += 3) joint.set([limb, px, py], i)
  return g.setAttribute('joint', new THREE.BufferAttribute(joint, 3))
}
/** Two legs `hip` m long, each `apart` m off the middle. A figure faces +x, so its right is +z. */
const legs = (hip: number, colour: string, wide: number, apart: number, deep: number) => [
  of(part(wide, hip, deep, 0, 0, -apart, colour), LEFT_LEG, 0, hip),
  of(part(wide, hip, deep, 0, 0, apart, colour), RIGHT_LEG, 0, hip),
]
/** Two arms hanging `len` m from the `shoulder`, `out` m off the middle: a sleeve and a hand each. */
const arms = (shoulder: number, len: number, out: number, sleeve: string) =>
  [LEFT_ARM, RIGHT_ARM].flatMap((limb) => {
    const z = (limb === LEFT_ARM ? -1 : 1) * out
    return [
      of(part(0.17, len - 0.14, 0.14, 0, shoulder - len + 0.14, z, sleeve), limb, 0, shoulder - 0.06),
      of(part(0.15, 0.14, 0.12, 0, shoulder - len, z, SKIN_TONE), limb, 0, shoulder - 0.06),
    ]
  })

/**
 * The parts merged into one model, facing +x, its white parts taking its instance's paint.
 * ponytail: a part takes paint by being pure white, so the schoolchild's and the office worker's white shirts are
 * `#fbf8f2`, a shade off, to keep their own colour; a part that must show pure white would take its walker's paint.
 * Give each part its share with `painted` (`./shapes`), as the cars' parts have theirs, if one ever must.
 */
const model = (parts: THREE.BufferGeometry[]) => {
  const g = merged(parts)
  const colour = g.attributes.color
  const share = new Float32Array(colour.count)
  for (let i = 0; i < colour.count; i++) share[i] = colour.getX(i) + colour.getY(i) + colour.getZ(i) > 2.99 ? 1 : 0
  return g.setAttribute('painted', new THREE.BufferAttribute(share, 1))
}

// Each kind's jointed figure (#176, #287), drawn a little large as the walkers always were, and its leg's length, `hip`.
// A shopper in a coat in its paint with a bag in its left hand; a schoolchild in a white shirt and navy shorts under a
// yellow hat, a satchel on its back; an office worker in a dark suit with a white shirt and a briefcase in its right hand.
const SKIN_TONE = '#f1d1b5'
const HAIR = '#3a3330'
const NAVY = '#3a4252'
const FIGURES: Record<Kind, { hip: number; parts: (hip: number) => THREE.BufferGeometry[] }> = {
  shopper: {
    hip: 0.7,
    parts: (hip) => [
      ...legs(hip, NAVY, 0.22, 0.1, 0.16),
      of(part(0.34, 0.86, 0.5, 0, 0.56, 0, '#ffffff'), BODY),
      ...arms(1.4, 0.7, 0.32, '#ffffff'),
      of(part(0.26, 0.32, 0.12, 0.02, 0.4, -0.32, '#f6d36a'), LEFT_ARM, 0, 1.34), // the bag
      of(part(0.3, 0.3, 0.3, 0.02, 1.44, 0, SKIN_TONE), HEAD, 0.02),
      of(part(0.33, 0.12, 0.33, -0.01, 1.7, 0, HAIR), HEAD, 0.02),
    ],
  },
  schoolchild: {
    hip: 0.5,
    parts: (hip) => [
      ...legs(hip, NAVY, 0.2, 0.09, 0.15),
      of(part(0.3, 0.52, 0.46, 0, 0.5, 0, '#fbf8f2'), BODY), // the shirt
      of(part(0.26, 0.4, 0.42, -0.24, 0.56, 0, '#5a3f34'), BODY), // the satchel
      ...arms(1.0, 0.46, 0.29, '#fbf8f2'),
      of(part(0.3, 0.3, 0.3, 0.02, 1.02, 0, SKIN_TONE), HEAD, 0.02),
      of(tint(new THREE.CylinderGeometry(0.24, 0.27, 0.16, 10).translate(0.02, 1.38, 0), '#f6d36a'), HEAD, 0.02), // the hat
      of(tint(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 10).translate(0.02, 1.31, 0), '#f6d36a'), HEAD, 0.02), // its brim
    ],
  },
  worker: {
    hip: 0.84,
    parts: (hip) => [
      ...legs(hip, NAVY, 0.24, 0.1, 0.17),
      of(part(0.36, 0.76, 0.52, 0, 0.82, 0, '#4a5262'), BODY), // the jacket
      of(part(0.05, 0.42, 0.16, 0.18, 1.14, 0, '#fbf8f2'), BODY), // the shirt at its front
      ...arms(1.56, 0.74, 0.33, '#4a5262'),
      of(part(0.42, 0.3, 0.1, 0.02, 0.52, 0.33, '#5a3f34'), RIGHT_ARM, 0, 1.5), // the briefcase
      of(part(0.32, 0.32, 0.32, 0.02, 1.58, 0, SKIN_TONE), HEAD, 0.02),
      of(part(0.34, 0.1, 0.34, -0.01, 1.86, 0, HAIR), HEAD, 0.02),
    ],
  },
}
const ORDER = Object.keys(FIGURES) as Kind[]
// The ground a kind covers in one whole stride, both steps, so that its feet do not slide.
const strideOf = (kind: Kind) => 4 * FIGURES[kind].hip * Math.sin(SWING)

/**
 * Have a material move each vertex as its limb and its instance's `pose` say: `pose.x` is where in its stride it is
 * (radians), `pose.y` how far it swings (0 standing, 1 walking; below 0, how far it is sat down), `pose.z` how far its
 * right arm is raised (radians) and `pose.w` how far its head is turned (radians).
 */
const jointed = (shader: THREE.WebGLProgramParametersWithUniforms) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 joint;\nattribute vec4 pose;')
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
{
  float limb = joint.x;
  float walk = max(0.0, pose.y);
  float sat = max(0.0, -pose.y);
  float swing = sin(pose.x) * walk * ${SWING.toFixed(2)};
  float raised = min(1.0, pose.z);
  float turn = 0.0;
  if (abs(limb - ${LEFT_LEG}.0) < 0.5) turn = swing + sat * 1.45;
  else if (abs(limb - ${RIGHT_LEG}.0) < 0.5) turn = -swing + sat * 1.45;
  else if (abs(limb - ${LEFT_ARM}.0) < 0.5) turn = -swing * 0.8 + sat * 0.45;
  else if (abs(limb - ${RIGHT_ARM}.0) < 0.5) turn = (swing * 0.8 + sat * 0.45) * (1.0 - raised) + pose.z;
  if (abs(limb - ${BODY}.0) > 0.5 && abs(limb - ${HEAD}.0) > 0.5) {
    vec2 p = transformed.xy - joint.yz;
    float c = cos(turn), s = sin(turn);
    transformed.xy = joint.yz + vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  } else if (abs(limb - ${HEAD}.0) < 0.5) {
    vec2 p = vec2(transformed.x - joint.y, transformed.z);
    float c = cos(pose.w), s = sin(pose.w);
    transformed.x = joint.y + c * p.x + s * p.y;
    transformed.z = c * p.y - s * p.x;
  }
  // A walker leans into its stride, and sinks a little as its legs spread, so that its feet stay on the ground.
  transformed.x += (transformed.y - 0.4) * 0.07 * walk;
  transformed.y += (abs(cos(pose.x)) - 1.0) * 0.05 * walk;
}`,
    )
}

/** How far the point `(px, py)` is from the segment `(ax, ay)`–`(bx, by)`. */
function toSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const [dx, dy] = [bx - ax, by - ay]
  const t = dx || dy ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0
  return Math.hypot(px - ax - dx * t, py - ay - dy * t)
}

/**
 * The City's Walkers on the pavement, one instanced mesh per kind (#176), as `../walkers/walkers` has them: who each
 * is, where they walk and what they do comes from there, seeded `seed`, the City's. Each faces the way it walks, its
 * legs and arms swinging in step with the ground it covers (#287), and stops swinging as it stops (#288): it goes out
 * of sight in at a door, sits down on a bench, turns its head about, and stopped, or sat beside the other of a two, talks with a hand;
 * its shadow moves with it. The one the player Follows (#289) wears a marker over their head, in `marker`, a screen
 * piece drawn over the blend: indoors, it waits over the door.
 */
export function createWalkers(seed: number) {
  const group = new THREE.Group()
  const models = new Map(ORDER.map((k) => [k, model(FIGURES[k].parts(FIGURES[k].hip))]))
  // How tall each kind stands, to the top of its head.
  const tall = new Map(
    ORDER.map((k) => {
      const g = models.get(k)!
      g.computeBoundingBox()
      return [k, g.boundingBox!.max.y]
    }),
  )
  const clothes = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: LOW_POLY })
  clothes.onBeforeCompile = (shader) => {
    takesPaint(shader)
    jointed(shader)
  }
  const shadow = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  shadow.onBeforeCompile = jointed
  const walkers = new Walkers(seed)
  let meshes = new Map<Kind, THREE.InstancedMesh>()
  const [m, q, at, up, scale] = [
    new THREE.Matrix4(),
    new THREE.Quaternion(),
    new THREE.Vector3(),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(),
  ]
  let t = 0
  /**
   * How each walker is shown, eased frame by frame: where in its stride, how far it swings, sits and shows, and where
   * it is, how high the ground under it is (`h`, a terrace's or the pavement's) and which way it faces.
   */
  const shown = new WeakMap<
    Walker,
    { stride: number; swing: number; sit: number; size: number; arm: number; x: number; y: number; h: number; heading: number }
  >()
  /** How high the soles of `walker`'s feet are, shown as `look`: lower as they sit. */
  const footOf = (walker: Walker, look: { sit: number; h: number }) => look.h - look.sit * (FIGURES[walker.kind].hip - SEAT)

  /** The Walker the player Follows, and the marker over them. */
  let followed: Walker | null = null
  // Unlit, so it reads the same by night, each face a tone of its own, its top faces lighter: it glints as it turns.
  const facets = new THREE.OctahedronGeometry(0.5).scale(MARKER.size * 0.67, MARKER.size, MARKER.size * 0.67)
  const tones = new Float32Array(facets.attributes.position.count * 3)
  const yellow = new THREE.Color(MARKER.colour)
  for (let face = 0; face < tones.length / 9; face++) {
    const y = [0, 1, 2].reduce((sum, k) => sum + facets.attributes.position.getY(face * 3 + k), 0)
    const [up, round] = [y > 0 ? 1 : 0.72, 0.88 + 0.12 * Math.cos(face * 2.1)]
    const tone = yellow.clone().multiplyScalar(up * round)
    for (let k = 0; k < 3; k++) tones.set([tone.r, tone.g, tone.b], face * 9 + k * 3)
  }
  facets.setAttribute('color', new THREE.BufferAttribute(tones, 3))
  // Drawn with what is see-through, in its render order, so nothing see-through drawn after it covers it.
  const unlit = { transparent: true, depthTest: false, depthWrite: false, toneMapped: false }
  const gem = new THREE.Mesh(facets, new THREE.MeshBasicMaterial({ ...unlit, vertexColors: true }))
  const rim = new THREE.Mesh(facets, new THREE.MeshBasicMaterial({ ...unlit, color: MARKER.ink, side: THREE.BackSide }))
  rim.scale.setScalar(1 + MARKER.rim)
  // Over the Jam marks' bubbles and the tools' marks, under the hand; the gem over its rim.
  ;[rim.renderOrder, gem.renderOrder] = [15, 16]
  const marker = new THREE.Group().add(rim, gem)
  marker.name = 'walker marker'
  marker.visible = false

  /** New instanced meshes for the walkers there are now. */
  const remesh = () => {
    for (const mesh of meshes.values()) {
      group.remove(mesh)
      mesh.dispose()
      mesh.geometry.dispose()
    }
    meshes = new Map()
    for (const kind of ORDER) {
      const mine = walkers.all.filter((w) => w.kind === kind)
      // Its own copy of the model, carrying each walker's pose.
      const pose = new THREE.InstancedBufferAttribute(new Float32Array(4 * Math.max(1, mine.length)), 4)
      const mesh = new THREE.InstancedMesh(models.get(kind)!.clone().setAttribute('pose', pose), clothes, mine.length)
      mesh.name = `walker ${kind}`
      mesh.castShadow = true
      mesh.customDepthMaterial = shadow
      mesh.frustumCulled = false // instances move; the mesh's own bounds mean nothing
      mine.forEach((walker, i) => mesh.setColorAt(i, paintOf(walker)))
      meshes.set(kind, mesh)
      group.add(mesh)
    }
  }
  return {
    group,
    marker,

    /** The Walker the player Follows, if any: a Swap or an Undo that takes them off lets go of them. */
    get followed() {
      return followed
    },

    /** Follow `walker`, or nobody. */
    follow(walker: Walker | null) {
      followed = walker
    },

    /** The other of `walker`'s two, if they walk in one. */
    otherOfTwo: (walker: Walker) => walkers.otherOfTwo(walker),

    /**
     * The Walker drawn nearest the canvas pixel (`px`, `py`), if the pixel is on their figure or within `slack` px of
     * it, where `onScreen` puts a point `up` m over the map on the canvas and a pixel spans `perPixel` m: nobody out of
     * sight indoors.
     * ponytail: every Walker's figure is put on the canvas, on each move of the pointer too, about 35 µs on the 26-Tile
     * City (M4 Pro); keep the Walkers by Tile and look only under the pointer if a larger City shows it.
     */
    at(px: number, py: number, onScreen: (at: Vec, up: number) => [number, number], perPixel: number, slack = PICK.slack): Walker | null {
      let [best, found] = [PICK.reach / perPixel + slack, null as Walker | null]
      for (const walker of walkers.all) {
        const look = shown.get(walker)
        if (!look || look.size < 0.5) continue
        const foot = footOf(walker, look)
        const [fx, fy] = onScreen(look, foot)
        const [hx, hy] = onScreen(look, foot + tall.get(walker.kind)! * look.size)
        const d = toSegment(px, py, fx, fy, hx, hy)
        if (d < best) [best, found] = [d, walker]
      }
      return found
    },

    /**
     * Walkers on the pavement of the pieces of slab `pieces`, laid in `field`, and their ways to `places`, round
     * `obstacles` (see `Walkers.add`). Nobody can reach a roundabout's island.
     * ponytail: the ways cost up to 18 ms a Tile (about 10 ms on average, M4 Pro), as does `refit`'s at a Stage-up, a
     * dropped frame; work them out over frames if it shows.
     */
    add(net: Network, field: Field, pieces: Bounds[], places: readonly Place[] = [], obstacles: readonly Vec[][] = []) {
      const islands = net.junctions.filter((j) => j.type === 'roundabout').map((j) => j.at)
      for (const piece of pieces) {
        walkers.add(
          piece,
          field.outlines(INSET, [piece]).filter((loop) => !islands.some((at) => inside(loop, at.x, at.y))),
          places,
          obstacles,
        )
      }
      remesh()
    },

    /** The `places` and `obstacles` of the pieces of slab `pieces` as they stand after a Stage-up or a Rezoning. */
    refit(pieces: Bounds[], places: readonly Place[], obstacles: readonly Vec[][]) {
      for (const piece of pieces) walkers.refit(piece, places, obstacles)
    },

    /** Take the walkers off the pieces of slab `pieces`, which a Swap or an Undo is lifting. */
    remove(pieces: Bounds[]) {
      walkers.takeOff(pieces)
      if (followed && !walkers.all.includes(followed)) followed = null
      remesh()
    },

    /** `dt` is the real seconds since the last frame, 0 while paused; `perPixel`, the m of ground a CSS pixel spans. */
    update(dt: number, perPixel: number) {
      t += dt
      walkers.step(dt)
      const index = new Map<Kind, number>(ORDER.map((k) => [k, 0]))
      const ease = Math.min(1, dt * EASE)
      for (const walker of walkers.all) {
        const p = whereIs(walker)
        const look = shown.get(walker) ?? { stride: phaseOf(walker), swing: 1, sit: 0, size: 1, arm: 0, h: KERB, ...p }
        shown.set(walker, look)
        const moving = walker.doing === 'stroll' || walker.doing === 'go' || walker.doing === 'back'
        const place = walker.way?.place
        const act = walker.doing === 'act' ? place?.kind : undefined
        // Indoors at a door, or on the way up to a terrace or down from it (#293); sat on a bench, or on a terrace's seat.
        const indoors = (act !== undefined && act !== 'bench') || walker.doing === 'down'
        const sat = act === 'bench' || (walker.doing === 'up' && place?.kind === 'terrace' && place.up.sit)
        // Sat or up on a terrace beside the other of a two.
        const together = walker.side !== 0 && (sat || walker.doing === 'up')
        // One whole stride is 2π, of the ground it has covered.
        look.stride = (look.stride + (Math.hypot(p.x - look.x, p.y - look.y) * Math.PI * 2) / strideOf(walker.kind)) % (Math.PI * 2)
        look.swing += ((moving ? 1 : 0) - look.swing) * ease
        look.sit += ((sat ? 1 : 0) - look.sit) * ease
        look.size += ((indoors ? 0 : 1) - look.size) * ease
        const talking = (walker.doing === 'stop' || together) && talks(walker) && look.size > 0.9
        look.arm += ((talking ? 1.25 + Math.sin(t * 5 + phaseOf(walker)) * 0.3 : 0) - look.arm) * ease
        look.heading += Math.atan2(Math.sin(p.heading - look.heading), Math.cos(p.heading - look.heading)) * ease
        ;[look.x, look.y, look.h] = [p.x, p.y, p.h ?? KERB]
        // Sat or up on a terrace beside the other of a two, it turns to them; stopped, it looks about; walking, a little.
        const phase = phaseOf(walker)
        const head = together
          ? walker.side * 1.2 + Math.sin(t * 0.9 + phase) * 0.2
          : moving
            ? Math.sin(t * 0.5 + phase) * 0.18
            : Math.sin(t * 0.9 + phase) * 0.5
        at.set(look.x, footOf(walker, look), -look.y)
        q.setFromAxisAngle(up, look.heading)
        const i = index.get(walker.kind)!
        index.set(walker.kind, i + 1)
        const mesh = meshes.get(walker.kind)!
        mesh.setMatrixAt(i, m.compose(at, q, scale.setScalar(look.size)))
        const pose = mesh.geometry.attributes.pose as THREE.InstancedBufferAttribute
        pose.setXYZW(i, look.stride, look.sit > 0.05 ? -look.sit : look.swing, look.arm, head)
      }
      for (const mesh of meshes.values()) {
        mesh.instanceMatrix.needsUpdate = true
        mesh.geometry.attributes.pose.needsUpdate = true
      }
      const look = followed && shown.get(followed)
      marker.visible = !!look
      if (!followed || !look) return
      // As tall as it is, or as the least it shows on screen, and its height again over the head, as they stand indoors.
      const size = Math.max(1, (MARKER.least * perPixel) / MARKER.size)
      const top = footOf(followed, look) + tall.get(followed.kind)!
      marker.position.set(look.x, top + MARKER.size * size * (MARKER.over + Math.sin(t * 3) * 0.12), -look.y)
      marker.scale.setScalar(size)
      gem.rotation.y = rim.rotation.y = t * 1.5
    },
  }
}
