import * as THREE from 'three'
import { pointAt, type Bounds } from '../sim/geometry'
import type { Network } from '../sim/network'
import { Walkers, type Kind, type Walker } from '../walkers/walkers'
import { KERB } from './blocks'
import { inside, type Field } from './field'
import { LOW_POLY } from './look'
import { shopper } from './movers'
import { merged, part, takesPaint, tint } from './shapes'

const INSET = 1.6 // m in from the kerb: the pavement's centre line
// The cars' colours, a walker's paint: every walker wears one, on whatever of its model takes paint (`model`).
const SHIRTS = ['#db6982', '#009dcb', '#ffc52d', '#ffffff', '#64cb9f', '#bc9ef2', '#2f3440', '#ff9cbb'].map((c) => new THREE.Color(c))
// What a Walker wears, and where in its hop it is, from bits of its own seed: the same Walker looks the same every time.
const paintOf = (walker: Walker) => SHIRTS[walker.seed % SHIRTS.length]
const phaseOf = (walker: Walker) => ((walker.seed >>> 3) % 1000) / 100

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

// Each kind's model (#176), drawn a little large as the walkers always were. A shopper is the shops' (#175), in a coat
// in its paint; a schoolchild in a white shirt and navy shorts under a yellow hat, a satchel on its back; an office
// worker in a dark suit with a white shirt and a briefcase.
const SKIN_TONE = '#f1d1b5'
const HAIR = '#3a3330'
const MODELS: Record<Kind, () => THREE.BufferGeometry> = {
  shopper: () => model([shopper()]),
  schoolchild: () =>
    model([
      part(0.22, 0.5, 0.34, 0, 0, 0, '#3a4252'), // legs and shorts
      part(0.3, 0.52, 0.48, 0, 0.5, 0, '#fbf8f2'), // the shirt
      part(0.26, 0.4, 0.42, -0.24, 0.56, 0, '#5a3f34'), // the satchel
      part(0.3, 0.3, 0.3, 0.02, 1.02, 0, SKIN_TONE),
      tint(new THREE.CylinderGeometry(0.24, 0.27, 0.16, 10).translate(0.02, 1.38, 0), '#f6d36a'), // the hat
      tint(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 10).translate(0.02, 1.31, 0), '#f6d36a'), // its brim
    ]),
  worker: () =>
    model([
      part(0.26, 0.84, 0.38, 0, 0, 0, '#3a4252'), // trousers
      part(0.36, 0.76, 0.6, 0, 0.82, 0, '#4a5262'), // the jacket
      part(0.05, 0.42, 0.16, 0.18, 1.14, 0, '#fbf8f2'), // the shirt at its front
      part(0.32, 0.32, 0.32, 0.02, 1.58, 0, SKIN_TONE),
      part(0.34, 0.1, 0.34, -0.01, 1.86, 0, HAIR),
      part(0.42, 0.3, 0.1, 0.02, 0.5, 0.38, '#5a3f34'), // the briefcase
    ]),
}
const ORDER = Object.keys(MODELS) as Kind[]

/**
 * The City's Walkers on the pavement, one instanced mesh per kind (#176), as `../walkers/walkers` has them: who each
 * is, and where they walk, comes from there, seeded `seed`, the City's. Each faces the way it walks, with a little hop
 * per step.
 */
export function createWalkers(seed: number) {
  const group = new THREE.Group()
  const models = new Map(ORDER.map((k) => [k, MODELS[k]()]))
  const clothes = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: LOW_POLY })
  clothes.onBeforeCompile = takesPaint
  const walkers = new Walkers(seed)
  let meshes = new Map<Kind, THREE.InstancedMesh>()
  const [m, q, at, up, one] = [
    new THREE.Matrix4(),
    new THREE.Quaternion(),
    new THREE.Vector3(),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(1, 1, 1),
  ]
  let t = 0

  /** New instanced meshes for the walkers there are now. */
  const remesh = () => {
    for (const mesh of meshes.values()) {
      group.remove(mesh)
      mesh.dispose()
    }
    meshes = new Map()
    for (const kind of ORDER) {
      const mine = walkers.all.filter((w) => w.kind === kind)
      const mesh = new THREE.InstancedMesh(models.get(kind)!, clothes, mine.length)
      mesh.name = `walker ${kind}`
      mesh.castShadow = true
      mesh.frustumCulled = false // instances move; the mesh's own bounds mean nothing
      mine.forEach((walker, i) => mesh.setColorAt(i, paintOf(walker)))
      meshes.set(kind, mesh)
      group.add(mesh)
    }
  }
  return {
    group,

    /** Walkers on the pavement of the pieces of slab `pieces`, laid in `field`. Nobody can reach a roundabout's island. */
    add(net: Network, field: Field, pieces: Bounds[]) {
      const islands = net.junctions.filter((j) => j.type === 'roundabout').map((j) => j.at)
      for (const piece of pieces) {
        walkers.add(
          piece,
          field.outlines(INSET, [piece]).filter((loop) => !islands.some((at) => inside(loop, at.x, at.y))),
        )
      }
      remesh()
    },

    /** Take the walkers off the pieces of slab `pieces`, which a Swap or an Undo is lifting. */
    remove(pieces: Bounds[]) {
      walkers.takeOff(pieces)
      remesh()
    },

    /** `dt` is the real seconds since the last frame, 0 while paused. */
    update(dt: number) {
      t += dt
      walkers.step(dt)
      const index = new Map<Kind, number>(ORDER.map((k) => [k, 0]))
      for (const walker of walkers.all) {
        const p = pointAt(walker.line, walker.s)
        at.set(p.x, KERB + Math.abs(Math.sin((t + phaseOf(walker)) * 9)) * 0.12, -p.y) // a little hop per step
        q.setFromAxisAngle(up, p.heading + (walker.speed < 0 ? Math.PI : 0)) // facing the way it walks
        const i = index.get(walker.kind)!
        index.set(walker.kind, i + 1)
        meshes.get(walker.kind)!.setMatrixAt(i, m.compose(at, q, one))
      }
      for (const mesh of meshes.values()) mesh.instanceMatrix.needsUpdate = true
    },
  }
}
