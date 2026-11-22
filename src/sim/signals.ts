import type { Junction, Lane, Network } from './network'

export type Light = 'green' | 'amber' | 'red'

/** A Junction's Signal as it stands: which of its two groups each Arm is in, and the Walk phase. */
export interface Signal {
  /** Per Arm, in the Junction's order: 0 for the two Arms most nearly facing each other, 1 for the rest. */
  groups: number[]
  /** Seconds into the cycle at time 0, so that Junctions run out of step with each other. */
  offset: number
  /** Seconds its Walk phase lasts: long enough to cross the Junction's widest Road. */
  walkFor: number
  /** What each group's lamps show. */
  shows: [Light, Light]
  /** Whether it is the Walk phase, and the seconds of it left. */
  walk: boolean
  walkLeft: number
}

/** m/s a Walker crosses a Road at, however they stroll: a brisk pace. */
export const WALKING_PACE = 1.5

// The cycle, in s (.scratch/living-city/spec.md, "Traffic lights"): a group's green, the amber and the red after it,
// the Walk phase, and the red after that. Group 0 goes, then group 1, then every Arm is red for the Walk phase. The
// Walk phase fits the Junction (#296): as long as crossing its widest Road at a Walker's pace takes, and `STEP_OFF`
// more, for the Junction to clear of what went on amber (about 2.5 s, at most 5 s on the game's Tiles) and for those
// at the kerb to reach it from their pavement and step off. About 31 s across the game's Roads, 28 m wide.
const [GO, CLEAR, AMBER, AFTER, STEP_OFF] = [12, 3.5, 2.5, 2, 12]
const cycleOf = (s: Signal) => 2 * (GO + CLEAR) + s.walkFor + AFTER

/** Whether the Junction can be run by a Signal: a Priority junction of three Arms or more. A Ring has none. */
export const takesSignal = (junction: Junction) => junction.type === 'priority' && junction.arms.length >= 3

/** A Signal for `junction`, its lamps not yet set. Its place in the cycle comes from the Junction's id, which never changes. */
export function newSignal(junction: Junction): Signal {
  const { arms } = junction
  let [best, pair] = [-Infinity, [0, 1]]
  for (let i = 0; i < arms.length; i++)
    for (let j = i + 1; j < arms.length; j++) {
      const facing = -Math.cos(arms[i].angle - arms[j].angle)
      if (facing > best) [best, pair] = [facing, [i, j]]
    }
  let hash = 0
  for (const ch of junction.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const signal: Signal = {
    groups: arms.map((_, i) => (pair.includes(i) ? 0 : 1)),
    offset: 0,
    walkFor: Math.ceil(Math.max(...arms.map((a) => a.width)) / WALKING_PACE) + STEP_OFF,
    shows: ['red', 'red'],
    walk: false,
    walkLeft: 0,
  }
  signal.offset = (hash % (cycleOf(signal) * 10)) / 10
  return signal
}

/**
 * The seconds Walkers have left to cross at `junction` (#296): the rest of its Walk phase, once no vehicle is in the
 * Junction, nor the tail of one that has left it, over a zebra; 0 till then, and outside the Walk phase. One that went
 * on amber, or turned across the stream as it stopped, can still be there as the Walk phase begins. Undefined where
 * it has no Signal.
 */
export function leftToCross(junction: Junction): number | undefined {
  const s = junction.signal
  if (!s) return undefined
  if (!s.walk) return 0
  // Less than its own length down an exit lane, a vehicle's tail is still in the Junction.
  const leaving = (lane: Lane) => lane.vehicles.some((v) => v.s < v.type.length)
  for (const arm of junction.arms) if (arm.connections.some((c) => c.lane.vehicles.length) || arm.exit.some(leaving)) return 0
  return s.walkLeft
}

/** Set every Signal's lamps, and the light of each of its Arms, for the Sim's `time`. An Arm with no Signal has no light. */
export function runSignals(net: Network, time: number) {
  for (const junction of net.junctions) {
    const s = junction.signal
    if (!s) {
      for (const arm of junction.arms) if (arm.light) arm.light = undefined
      continue
    }
    const t = (time + s.offset) % cycleOf(s)
    const second = GO + CLEAR
    const walkAt = 2 * second
    const show = (from: number): Light => (t < from ? 'red' : t < from + GO ? 'green' : t < from + GO + AMBER ? 'amber' : 'red')
    s.shows = [show(0), show(second)]
    s.walk = t >= walkAt && t < walkAt + s.walkFor
    s.walkLeft = s.walk ? walkAt + s.walkFor - t : 0
    junction.arms.forEach((arm, i) => (arm.light = s.shows[s.groups[i]]))
  }
}
