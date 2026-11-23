import type { Kind, Own, Place } from './walkers'

/**
 * What a beat of a Storylet has its Walker do (#290): stop where they are on their pavement, go to a Place of the kind
 * (in at a door, onto a bench, up to a terrace), cross the Road at a Signal of their own Tile to the far pavement, or go
 * in at their own door (#291).
 */
export type Step = 'stop' | Place['kind'] | 'cross' | 'home'

/** A time of day a Storylet can begin at. */
export type TimeOfDay = 'morning' | 'day' | 'dusk' | 'night'

/**
 * A Storylet (#290): who it can happen to, and when; its beats, each a Step to do and the line it leaves in the log once
 * done; and `end`, the line that closes it. In a line, `A` is the Walker and `B` the other of their two.
 */
export interface Storylet {
  readonly title: string
  /** Only for Walkers of these kinds. */
  readonly kinds?: readonly Kind[]
  /** Only for a two, or only for one alone. */
  readonly pair?: boolean
  readonly when?: readonly TimeOfDay[]
  /** Only for Walkers with a door of their own that is this to them (#291), which a `home` beat goes to. */
  readonly needs?: Own
  readonly beats: readonly (readonly [Step, string])[]
  readonly end: string
}

/** The time of day `t`, 0–1 as the Sim's clock reads it (0 morning, 0.25 noon, 0.5 dusk, 0.75 night), as a Storylet fits it. */
export const timeOf = (t: number): TimeOfDay => (t < 0.18 || t > 0.92 ? 'morning' : t < 0.42 ? 'day' : t < 0.6 ? 'dusk' : 'night')

/**
 * Every Storylet: the prototype's, those that need only shops, benches, windows and a Signal to cross at and the four
 * that need a door of the Walker's own (#291); two that go up to a terrace (#293); and four of stops alone, two for one
 * alone and two for a two at any time of day, so that a Walker whose pavement reaches no Place has Storylets too, and
 * never only the one they had last. Adding one is adding data here.
 */
export const STORYLETS: readonly Storylet[] = [
  {
    title: 'Lost in thought',
    pair: false,
    beats: [
      ['stop', 'A stopped, sure they had forgotten something.'],
      ['stop', 'A stopped again, and remembered what it was.'],
    ],
    end: 'A walked on, lighter for it.',
  },
  {
    title: 'Watching the world',
    pair: false,
    beats: [
      ['stop', 'A stopped to watch the road go by.'],
      ['stop', 'A found a better spot and watched some more.'],
    ],
    end: 'A had seen enough for one day and walked on.',
  },
  {
    title: 'Catching up',
    pair: true,
    beats: [
      ['stop', 'A and B stopped to catch up.'],
      ['stop', 'A and B stopped again. There was more.'],
    ],
    end: 'A and B walked on, caught up at last.',
  },
  {
    title: 'Agreeing to differ',
    pair: true,
    beats: [
      ['stop', 'A and B stopped, not agreeing.'],
      ['stop', 'B gave in, and then so did A.'],
    ],
    end: 'A and B walked on, neither sure who had won.',
  },
  {
    title: 'Dinner, eventually',
    kinds: ['shopper', 'worker'],
    pair: false,
    when: ['dusk', 'night'],
    beats: [
      ['door', 'A went in to pick up dinner.'],
      ['bench', 'A sat a while with the bag, in no hurry.'],
    ],
    end: 'A headed home as the lamps came on.',
  },
  {
    title: 'Pocket money',
    kinds: ['schoolchild'],
    pair: false,
    beats: [
      ['stop', 'A counted coins at the window.'],
      ['door', 'A went in.'],
      ['bench', 'A came out with a sweet and sat down to eat it.'],
    ],
    end: 'A saved the wrapper and walked on.',
  },
  {
    title: 'Waiting for someone',
    pair: false,
    beats: [
      ['bench', 'A sat down and kept checking the road.'],
      ['stop', 'A got up, looked both ways, and checked again.'],
    ],
    end: 'Nobody came. A walked on, a little slower.',
  },
  {
    title: 'Only looking',
    kinds: ['shopper'],
    pair: false,
    beats: [
      ['stop', 'A stopped at a window. Only looking.'],
      ['stop', 'A stopped at the next window too.'],
      ['door', 'A gave in and went inside.'],
    ],
    end: 'A came out carrying more than planned.',
  },
  {
    title: 'Ten minutes out',
    kinds: ['worker'],
    pair: false,
    when: ['morning', 'day'],
    beats: [
      ['bench', 'A slipped out of the office for ten minutes.'],
      ['stop', 'A stood a moment before going back.'],
    ],
    end: 'A went back in. It had been fourteen minutes.',
  },
  {
    title: 'The long talk',
    pair: true,
    beats: [
      ['stop', 'A and B stopped to talk.'],
      ['bench', 'The talk needed a bench.'],
      ['door', 'A and B went in together, still talking.'],
    ],
    end: 'A and B walked on, not finished.',
  },
  {
    title: 'Showing the way',
    pair: true,
    beats: [
      ['stop', 'A pointed something out to B.'],
      ['door', 'A took B in to see it.'],
    ],
    end: 'B agreed it was worth the detour.',
  },
  {
    title: 'A slow evening',
    pair: true,
    when: ['dusk', 'night'],
    beats: [
      ['bench', 'A and B took the bench under the lamp.'],
      ['stop', 'A and B watched the windows light, one by one.'],
    ],
    end: 'A and B went home the long way.',
  },
  {
    title: 'The other side',
    pair: false,
    beats: [
      ['cross', 'A waited for the lights and crossed over.'],
      ['stop', 'A looked back at the side they had left.'],
    ],
    end: 'A decided this side was better.',
  },
  {
    title: 'Across the road',
    pair: true,
    beats: [
      ['cross', 'A and B crossed at the lights.'],
      ['door', 'A and B found the shop they were after.'],
    ],
    end: 'A and B came out agreeing it had been worth crossing for.',
  },
  {
    title: 'Forgot something',
    needs: 'home',
    pair: false,
    beats: [
      ['stop', 'A got to the corner and stopped.'],
      ['home', 'A went back in for it.'],
    ],
    end: 'A set off again, patting a pocket.',
  },
  {
    title: 'Home before dark',
    needs: 'home',
    when: ['dusk', 'night'],
    beats: [
      ['door', 'A picked something up on the way.'],
      ['home', 'A let themselves in and put the light on.'],
    ],
    end: 'A came back out for a last look at the road.',
  },
  {
    title: 'Minding the shop',
    needs: 'shop',
    beats: [
      ['home', 'A went in to mind the counter.'],
      ['stop', 'A stepped out to see how the window looked.'],
    ],
    end: 'A moved one thing in the window and was satisfied.',
  },
  {
    title: 'The shift',
    needs: 'plant',
    beats: [
      ['home', 'A clocked in.'],
      ['bench', 'A took the break outside.'],
      ['home', 'A went back in before the whistle.'],
    ],
    end: 'A clocked out and stood a moment in the air.',
  },
  {
    title: 'Up for the view',
    pair: false,
    beats: [
      ['terrace', 'A went up to look out over the roofs.'],
      ['stop', 'Back down, A looked up at where they had stood.'],
    ],
    end: 'A walked on, looking up now and then.',
  },
  {
    title: 'Somewhere to talk',
    pair: true,
    beats: [
      ['stop', 'A and B stopped, with too much to say on the pavement.'],
      ['terrace', 'A and B took it up to the terrace, out of the crowd.'],
    ],
    end: 'A and B came down with it settled.',
  },
]
