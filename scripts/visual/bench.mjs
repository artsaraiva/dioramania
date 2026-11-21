// Frame time with 1,000 cars, draw calls and triangles, each Zone all over the 26-Tile City: the working tree against a
// git ref, or against itself without a dev parameter, interleaved round by round so that whatever else is drawing on the
// GPU lands on both alike.
//
// Usage: npm run bench:visual -- <zones | unzoned | all> [--against <git ref>] [--with <params>] [--stages 3]
//          [--views city] [--times noon] [--rounds 3] [--query <params>]
//
// Prints each bench as it runs, then a Markdown table of medians for the PR. Compare numbers only within one table: the
// same City reads up to a millisecond apart from one day to the next. --views takes city, City zoom, the whole City in
// frame, tile, Tile zoom, one Tile filling the screen (#173), and block, Block zoom, one Block; --times takes noon and
// night. --query adds dev parameters to the game's URL on both sides, such as `finish=none`. --with adds them to the
// working tree's side alone, and with no --against benches the working tree against itself without them: `--with
// look=lowpoly` is what the low-poly look costs (#280).
import { parseArgs } from 'node:util'
import { buildCity, DEFAULT_POINTS, frameAll, launch, lookAt, METRES, open, stageAll, zoneNames, zonesFrom } from './city.mjs'
import { closeAll, serve } from './serve.mjs'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    against: { type: 'string' },
    with: { type: 'string' },
    stages: { type: 'string', default: '3' },
    views: { type: 'string', default: 'city' },
    times: { type: 'string', default: 'noon' },
    rounds: { type: 'string', default: '3' },
    query: { type: 'string', default: '' },
  },
})
const stages = values.stages.split(',').map(Number)
const rounds = Number(values.rounds)
const views = values.views.split(',')
// Tile zoom, one Tile filling the screen, and Block zoom, one Block, where `npm run shots` frames them by default.
const ZOOMS = {
  tile: { ...DEFAULT_POINTS.tile[0], metres: METRES.tile },
  block: { ...DEFAULT_POINTS.block[0], metres: METRES.block },
}
if (views.some((v) => v !== 'city' && !(v in ZOOMS))) throw new Error('--views takes city, tile and block')
const DAY = { noon: 0.25, night: 0.75 }
const times = values.times.split(',')
if (times.some((t) => !(t in DAY))) throw new Error('--times takes noon and night')
const withQuery = (extra) =>
  [values.query, extra]
    .map((q) => q?.replace(/^[?&]/, ''))
    .filter(Boolean)
    .join('&')

/**
 * In the page, after the camera is placed: one frame's draw calls and triangles at the time of day `day`, then the ms per
 * frame with 1,000 cars, a third of them stuck.
 */
async function measure(day) {
  const c = window.dioramania
  c.view.holdDay(day)
  for (let i = 0; i < 2; i++) c.frame(0.1)
  // The view hands out no renderer. Catch it as three passes it to the scene, from the module the game imports three
  // from: patching `WebGLRenderer.prototype.render` does nothing, as three defines `render` on each instance.
  const src = await (await fetch('/src/render/view.ts')).text()
  const THREE = await import(src.match(/["']([^"']*\/three\.js\?v=\w+)["']/)[1])
  let renderer
  const was = THREE.Scene.prototype.onBeforeRender
  THREE.Scene.prototype.onBeforeRender = function (r) {
    if (renderer) return
    renderer = r
    r.info.autoReset = false
    r.info.reset()
  }
  c.view.render(0.016, 0.016)
  THREE.Scene.prototype.onBeforeRender = was
  const { calls, triangles } = renderer.info.render
  renderer.info.autoReset = true

  const vehicles = c.sim.vehicles
  const lanes = c.sim.net.lanes
  c.sim.vehicles = Array.from({ length: 1000 }, (_, i) => {
    const lane = lanes[i % lanes.length]
    return { id: i, lane, s: (lane.length * ((i * 7) % 10)) / 10, v: i % 3 === 0 ? 0 : 8, type: { length: 4.3 }, path: [] }
  })
  // Reading back one pixel waits for the GPU to finish the frame. The warm-up gives the stuck cars their anger marks
  // and steam; without the read after it, the first timed frame waits out a second of queued GPU work.
  const gl = document.querySelector('canvas').getContext('webgl2')
  const px = new Uint8Array(4)
  for (let i = 0; i < 400; i++) c.view.render(0.05, 0.05)
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
  const runs = []
  for (let k = 0; k < 3; k++) {
    const start = performance.now()
    for (let i = 0; i < 120; i++) {
      c.view.render(0.016, 0.016)
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    }
    runs.push((performance.now() - start) / 120)
  }
  c.sim.vehicles = vehicles
  return { ms: runs.sort((a, b) => a - b)[1], calls, triangles }
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const ms = (n) => `${n.toFixed(2)} ms`
const mega = (n) => (n / 1e6).toFixed(2)

const here = await serve()
const against = values.against && (await serve(values.against))
// Each side benched: a server, the dev parameters its pages open with, its name in the log and its column in the table.
const thisBranch = {
  server: here,
  query: withQuery(values.with),
  label: `${here.label}${values.with ? ` with ${values.with}` : ''}`,
  column: against ? `This branch${values.with ? `, \`${values.with}\`` : ''}` : `With \`${values.with}\``,
}
const reference = against
  ? { server: against, query: withQuery(), label: against.label, column: `\`${values.against}\`` }
  : values.with && { server: here, query: withQuery(), label: `${here.label} without ${values.with}`, column: 'Without' }
const sides = reference ? [reference, thisBranch] : [thisBranch]
const { browser, context } = await launch()
try {
  const zones = await zonesFrom(positionals, here)
  const names = await zoneNames(here)
  console.log(`Benching the ${sides.map((s) => s.label).join(' against the ')}, ${rounds} rounds.`)
  console.log("Close other browsers drawing on this GPU first (the desktop app's Browser pane, WebGL in Chrome).\n")
  // `${zone} ${stage} ${view} ${time}` → each side's ms per round, with its draw calls and triangles.
  const results = new Map()
  for (let round = 0; round < rounds; round++) {
    for (const zone of zones) {
      for (const side of round % 2 ? [...sides].reverse() : sides) {
        const page = await open(context, side.server.url, side.query)
        await buildCity(page, zone)
        for (const stage of stages) {
          await stageAll(page, stage)
          for (const view of views) {
            await (view === 'city' ? page.evaluate(frameAll) : page.evaluate(lookAt, ZOOMS[view]))
            for (const time of times) {
              const r = await page.evaluate(measure, DAY[time])
              const key = `${zone} ${stage} ${view} ${time}`
              const row = results.get(key) ?? new Map()
              results.set(key, row)
              if (!row.has(side)) row.set(side, { ms: [], calls: r.calls, triangles: r.triangles })
              row.get(side).ms.push(r.ms)
              console.log(
                `round ${round + 1}  ${zone} Stage ${stage} ${view} ${time}  ${side.label}: ${ms(r.ms)}, ${r.calls} calls, ` +
                  `${mega(r.triangles)} M triangles`,
              )
            }
          }
        }
        await page.close()
      }
    }
  }

  const table = reference
    ? [
        `| Zone | Stage | View | Time | ${reference.column} | ${thisBranch.column} | Change | Draw calls | Triangles |`,
        '| --- | ---: | --- | --- | ---: | ---: | ---: | --- | --- |',
      ]
    : ['| Zone | Stage | View | Time | Frame time | Draw calls | Triangles |', '| --- | ---: | --- | --- | ---: | ---: | ---: |']
  const noisy = []
  for (const [key, row] of results) {
    const [zone, stage, view, time] = key.split(' ')
    const [a, b] = sides.map((s) => row.get(s))
    for (const [side, r] of row) {
      const [lo, hi] = [Math.min(...r.ms), Math.max(...r.ms)]
      if (hi - lo > 0.25 * median(r.ms))
        noisy.push(`${names[zone]} at Stage ${stage}, ${view} at ${time}, on the ${side.label} read ${lo.toFixed(2)}–${ms(hi)}`)
    }
    const lead = `| ${names[zone]} | ${stage} | ${view} | ${time}`
    if (!b) {
      table.push(`${lead} | ${ms(median(a.ms))} | ${a.calls} | ${mega(a.triangles)} M |`)
      continue
    }
    const change = median(b.ms) - median(a.ms)
    table.push(
      `${lead} | ${ms(median(a.ms))} | ${ms(median(b.ms))} | ${change < 0 ? '−' : '+'}${ms(Math.abs(change))} | ` +
        `${a.calls} → ${b.calls} | ${mega(a.triangles)} → ${mega(b.triangles)} M |`,
    )
  }
  console.log(`\nMedians of ${rounds} rounds, 1,000 cars on the 26-Tile City:\n\n${table.join('\n')}`)
  if (noisy.length) console.log(`\nSomething else was drawing on the GPU, so rerun before trusting these:\n- ${noisy.join('\n- ')}`)
} finally {
  await browser.close()
  await closeAll()
}
