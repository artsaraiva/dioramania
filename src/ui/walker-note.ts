import type { View } from '../render/view'
import { homeOf, jobOf, type Walker } from '../walkers/walkers'
import { whenChanged } from './readings'
import './walker-note.css'

/** A Storylet as the screen lists it (#290): its title, `who` it happened to if given, and each line of it. */
export function storyletItem(title: string, lines: readonly string[], who?: string) {
  const item = document.createElement('li')
  const heading = item.appendChild(document.createElement('b'))
  heading.textContent = who ? `${title} · ${who}` : title
  for (const line of lines) {
    const p = item.appendChild(document.createElement('p'))
    p.className = 'handwritten'
    p.textContent = line
  }
  return item
}

/** The one line of a list of the screen's that has nothing in it, saying so. */
export function emptyItem(text: string) {
  const item = document.createElement('li')
  item.className = 'handwritten empty'
  item.textContent = text
  return item
}

/**
 * The note of the Walker the player Follows (#289): a paper note in the left slot (`./screen.css`), after the
 * Junction's, which a Walker followed never shares the slot with. It gives their name and what they do, who they are
 * with, their home and their traits (a door of their own among them, #291), what they are doing now (at a door, whose
 * it is), and their log (#290): the lines of their Storylets so
 * far, the newest first, scrolling. "Keep" Keeps them and the other of their two, so that their Storylets go on
 * unwatched, and "Let go" no longer does; "Stop following" lets go as `Esc` does. A click on a Walker follows them (`./tools`), and moving the
 * camera by hand lets go (`camera.hold`): the note follows the view.
 */
export function createWalkerNote(note: HTMLElement, view: View) {
  note.className = 'paper walker-note'
  note.style.setProperty('--tilt', '-0.6deg')
  note.setAttribute('aria-label', 'Walker followed')
  note.hidden = true
  note.innerHTML = `
    <span class="tape pink" style="--tilt: 2deg"></span>
    <header><span class="label following"></span></header>
    <div class="heading"><h2 class="name"></h2><span class="handwritten job"></span></div>
    <span class="rule across"></span>
    <dl>
      <dt class="handwritten">With</dt><dd class="with"></dd>
      <dt class="handwritten">Home</dt><dd class="home"></dd>
      <dt class="handwritten">Traits</dt><dd class="traits"></dd>
    </dl>
    <span class="rule across"></span>
    <span class="label">Now</span>
    <p class="handwritten now"></p>
    <span class="rule across"></span>
    <span class="label">Log</span>
    <ol class="log storylets"></ol>
    <div class="actions">
      <button class="button keep"></button>
      <button class="button primary stop">Stop following · Esc</button>
    </div>`
  const el = (s: string) => note.querySelector<HTMLElement>(s)!
  /** Writes the text of the element `s`, only when it changes. */
  const writes = (s: string) => whenChanged((v) => (el(s).textContent = v))
  const show = {
    following: writes('.following'),
    name: writes('.name'),
    job: writes('.job'),
    with: writes('.with'),
    home: writes('.home'),
    traits: writes('.traits'),
    now: writes('.now'),
    keep: writes('.keep'),
  }
  /** Whose log is shown, and how far it had got: rebuilt only when a Storylet begins or a line reaches it. */
  let logged = { walker: null as Walker | null, entries: 0, lines: 0 }
  /** Show `walker`'s log, the newest Storylet first. */
  const showLog = (walker: Walker) => {
    const { log } = walker
    const now = { walker, entries: log.length, lines: log.at(-1)?.lines.length ?? 0 }
    if (now.walker === logged.walker && now.entries === logged.entries && now.lines === logged.lines) return
    logged = now
    const items = log.map((entry) => storyletItem(entry.title, entry.lines)).reverse()
    el('.log').replaceChildren(...(items.length ? items : [emptyItem('Nothing yet. Keep watching.')]))
  }
  el('.stop').onclick = () => view.follow(null)
  el('.keep').onclick = () => view.followed && view.keep(view.followed, !view.followed.kept)

  return {
    /** Show the Walker followed as they are now, or hide the note while nobody is. Call it every frame. */
    update() {
      const walker = view.followed
      if (note.hidden !== !walker) note.hidden = !walker
      if (!walker) return
      show.following(walker.kept ? 'Following · Kept' : 'Following')
      show.name(walker.name)
      show.job(jobOf(walker))
      show.with(view.otherOfTwo(walker)?.name ?? 'on their own')
      show.home(homeOf(walker))
      show.traits(walker.traits.join(', '))
      show.now(view.doingNow(walker))
      show.keep(walker.kept ? 'Let go' : 'Keep')
      showLog(walker)
    },
  }
}
