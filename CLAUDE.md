## Agent skills

### Issue tracker

Tickets are GitHub Issues at `artsaraiva/dioramania`; specs and maps stay under `.scratch/<feature>/`. The repo is on the personal `artsaraiva` account: prefix `gh` with `GH_TOKEN=$(gh auth token -u artsaraiva)`, and read a ticket with `gh issue view <n> -R artsaraiva/dioramania --json title,body,comments`. See `docs/agents/issue-tracker.md`.

Each ticket gets its own branch off `main`, named `<n>-<slug>` (e.g. `1-split-sim`). Finish with a PR whose body comes from `/pr` and says `Closes #<n>`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.

### Zone tickets

Briefing, building or reviewing a visual-style Zone ticket: see `docs/agents/zone-ticket.md`.

## Testing

Most of this game is verified by playtesting. Tests cover the simulation, where playtesting misses regressions.

These test seams are pre-agreed with the user and form the complete list:

- **Simulation outcomes** (`src/sim`): a City jams as configured, a known Change clears the Jam, and a seed gives the same result every run. Changes carry over a placement, and a Swap resets the swapped Tile's. A vehicle driving before a placement is still driving after it, and one bound for a Gateway the placement closed gets a Gateway it can reach. A vehicle driving outside the swapped Tile before a Swap is still driving after it.
- **Placement rules** (`src/city`): a drop or a Swap is legal or refused.
- **Economy**: the Price of the n-th Tile, the loop rebate, the Income floor and the Undo refund. A save loads back the same City, Changes, yen and Record, and a save that will not load starts a new run that keeps the Record.
- **Stages** (`src/game`): a Tile whose Junction is served reaches its next Stage, and one whose Junction is in a Jam does not. A Swap keeps the Stage and progress, and Rezoning starts the Tile again at Stage 1. A save loads back each Tile's Stage and progress.
- **Walkers** (`src/walkers`): the same seed gives the same Walkers, and a Swap or an Undo of one Tile leaves the others' Walkers who they were. A Storylet begins only for a Walker Followed long enough or Kept, and only one that fits them; its beats run in order and end in the Walker's log. A Walker starts across a Road only in the Walk phase with time enough left. A save loads back the Walkers the player Keeps and their logs.

Assert outcomes only: jammed, cleared, legal, refused, a price, yen, a Stage, who a Walker is, a log. Verify everything else (`src/render`, `src/ui`, visuals, feel, tuning) by running the game.

PR evidence is text: test and `npm run check:scene` output, and for a visual-style PR the 1,000-car frame time from `npm run bench:visual -- <zones> --against origin/main` (usage heads the script). A PR carries no screenshots or before-and-after images, even where a ticket's acceptance criteria ask for them: the user does not read them, and shooting them costs more than they are worth. Shoot (`npm run shots`) only when the user asks to see something.

The rules of Finish that are facts about what was placed come from the scene check, `npm run check:scene -- <zones> --against origin/main`: a script outside `npm test`, whose usage heads `scripts/visual/check.mjs`. Sheets are for the look alone. The check also holds the Drives: every Block of a zoned Tile has exactly one, in the same place at every Stage, with nothing standing in it.

Zone work lives in `src/render/zones/<zone>.ts` (its look, fill, plans, scenes, buildings and the props only it lays) and `.scratch/visual-style/zones/<zone>.md` (its part of the visual-style spec); what every Zone shares stays in `src/render/zones/ground.ts`, `scenes.ts`, the kit and `.scratch/visual-style/spec.md`.

Write the test first when the rule is clear up front. When the behavior is still being explored, build it, playtest it, then lock it in with a test.
