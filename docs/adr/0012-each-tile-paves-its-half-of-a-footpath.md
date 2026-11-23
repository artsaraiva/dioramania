# Each Tile paves its half of a Footpath

Each Tile's Blocks stopped 2 m short of the Tile's edge, so two neighbouring Tiles left 4 m of bare road plate between their Blocks, kerbed and lamp-lit on both sides: a Road with no lanes that went nowhere. Grilled on [#275](https://github.com/artsaraiva/dioramania/issues/275) (2026-11-23), the user decided that the strip becomes a Footpath: pavement level with the Blocks on both sides, with no kerb. Each Tile paves its own 2 m, whether or not a neighbour is there, and no Tile reads its neighbour.

A Tile is still drawn from itself alone. Its Blocks keep their outlines and the 2 m is added round them, so no building, Lot, lamp or Walker moves from where it stood. A finished Tile does not change when a neighbour lands, is swapped or is taken off; its half comes and goes with its own Blocks; and an open edge of the City is pavement to the brim of the plate. The rule is the same for every seam, whether a Road crosses it or not, and for every Zone: parks, green, farms and unzoned Tiles too.

## Considered Options

- **A strip the pair owns**, paved once both Tiles have landed. The open edge would keep its road plate. But the pavement would drop in on a finished Tile as its neighbour's Assembly ends and lift off on an Undo, and every change to a Tile would have a neighbour to redraw.
- **Merged Blocks:** the two Blocks planned again as one, so that a building can straddle the seam. It blends the most. A finished Tile's buildings would change each time a neighbour lands, is swapped or is undone, against [ADR 0009](0009-the-low-poly-look.md) (buildings are restyled, never redesigned), and its Walkers, who are seeded from where their pavement lies, would become other people.
- **A table of Zone pairs**, the seam dressed by which two Zones meet. That is 55 pairs to design, and a Rezoning would redraw its neighbours. Each Zone dresses its own side instead: homes beside industry differ from shops beside shops because the two sides do.
- **A planted strip, or the road plate dressed as an alley.** House, terrace and shop fronts already face the seam, so shrubs would stand before their doors and let Walkers across only at gaps. An alley still reads as a road nobody drives.

## Consequences

- Lamps stand in pairs across a Footpath, and four stand round the spot where four Tiles meet, because each Tile keeps its own. Thinning them takes a rule a Tile can follow alone, not a Tile that reads its neighbour. Whether they want thinning, and whether the plain pavement wants a paving of its own, is for the eye once it is built ([#364](https://github.com/artsaraiva/dioramania/issues/364)).
- What belongs to a kerb leaves a Block's Footpath side: kerbstones, drain grates and bollards. Lamps, benches and planters stay. Along a Road the kerb runs unbroken past a Footpath's mouth.
- The rules of Finish cover a Block's Footpath side. The scene check holds that the pavement reaches the Tile's edge, that nothing of a kerb stands there and that no 12 m of it stands empty ([#362](https://github.com/artsaraiva/dioramania/issues/362), which builds the Footpath).
- A Zone's side of a Footpath is that Zone's to finish ([#363](https://github.com/artsaraiva/dioramania/issues/363)), and a green Zone may lay a surface of its own on its half, level and walkable ([#365](https://github.com/artsaraiva/dioramania/issues/365)).
- The pavements of a City join into islands bounded by Roads. A Walker steps from one Tile to the next anywhere along a Footpath, and gets from one island to the next only at a Signal: any Signal they reach, where before it was their own Tile's alone ([#294](https://github.com/artsaraiva/dioramania/issues/294)).
