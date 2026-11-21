import { mulberry32 } from '../sim/demand'
import { around, polyline, sameBounds, type Bounds, type Polyline, type Vec } from '../sim/geometry'

/** A kind of Walker (#176), drawn with a model of its own: a shopper with a bag, a schoolchild, an office worker. */
export type Kind = 'shopper' | 'schoolchild' | 'worker'

/**
 * A person of the City: who they are, drawn once from their seed, and where on their pavement they walk.
 * ponytail: `home` is a phrase from a short list and names no door in the City, and with 24 names two Walkers can
 * share one. #288 gives a resident a door of their own; the lists grow as Storylets need them.
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
  /** m round `line`. */
  s: number
  /** m/s, either way round. */
  readonly speed: number
}

const SPACING = 85 // m of pavement per Walker
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

/** A Walker from their seed, `seed`, who laps `line` on `tile`. */
function walker(seed: number, tile: Bounds, line: Polyline): Walker {
  const draw = mulberry32(seed)
  const pick = <T>(a: readonly T[]) => a[Math.floor(draw() * a.length)]
  const kind = pick(DEAL)
  const name = pick(NAMES)
  const traits = [...new Set([pick(TRAITS), pick(TRAITS)])]
  const [home, job] = [pick(HOMES), pick(JOBS[kind])]
  const s = draw() * line.length
  const speed = (0.9 + draw() * 0.6) * (draw() < 0.5 ? 1 : -1) * (kind === 'schoolchild' ? 0.85 : 1)
  return { seed, name, kind, traits, home, job, tile, line, s, speed }
}

/**
 * The City's Walkers, each drawn once from the City's seed and the pavement they walk, so that the same City has the
 * same Walkers every time, and a placement, a Swap or an Undo of one Tile changes nobody on the others. Each laps the
 * centre line of one Block's pavement, so never crosses a Road. Nothing in the Sim reads them, and nothing here draws
 * them: `src/render/walkers` does.
 */
export class Walkers {
  private walkers: Walker[] = []

  /** `seed`: the City's. */
  constructor(private readonly seed: number) {}

  /** Every Walker, in the order their Tiles were added. */
  get all(): readonly Walker[] {
    return this.walkers
  }

  /** Walkers on `pavements`, the centre lines of the pavements of the Tile `tile`, each a loop of points round its Block. */
  add(tile: Bounds, pavements: Vec[][]) {
    for (const loop of pavements) {
      const seeds = mulberry32(pavementSeed(this.seed, loop))
      const line = polyline([...loop, loop[0]])
      for (let k = Math.max(2, Math.round(line.length / SPACING)); k > 0; k--) {
        this.walkers.push(walker((seeds() * 4294967296) >>> 0, tile, line))
      }
    }
  }

  /** Take the Walkers off `tiles`, which a Swap or an Undo is lifting. */
  takeOff(tiles: Bounds[]) {
    this.walkers = this.walkers.filter((w) => !tiles.some((t) => sameBounds(t, w.tile)))
  }

  /** Walk on `dt` seconds. */
  step(dt: number) {
    for (const w of this.walkers) w.s = (w.s + w.speed * dt + w.line.length) % w.line.length
  }
}
