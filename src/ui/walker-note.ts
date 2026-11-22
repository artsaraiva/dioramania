import type { View } from '../render/view'
import { doingNow } from '../walkers/walkers'
import { whenChanged } from './readings'
import './walker-note.css'

/**
 * The note of the Walker the player Follows (#289): a paper note in the left slot (`./screen.css`), after the
 * Junction's, which a Walker followed never shares the slot with. It gives their name and what they do, who they are
 * with, their home and their traits, and what they are doing now, and "Stop following", which lets go as `Esc` does. A
 * click on a Walker follows them (`./tools`), and moving the camera by hand lets go (`camera.hold`): the note follows
 * the view.
 */
export function createWalkerNote(note: HTMLElement, view: View) {
  note.className = 'paper walker-note'
  note.style.setProperty('--tilt', '-0.6deg')
  note.setAttribute('aria-label', 'Walker followed')
  note.hidden = true
  note.innerHTML = `
    <span class="tape pink" style="--tilt: 2deg"></span>
    <header><span class="label">Following</span></header>
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
    <div class="actions"><button class="button primary stop">Stop following · Esc</button></div>`
  const el = (s: string) => note.querySelector<HTMLElement>(s)!
  /** Writes the text of the element `s`, only when it changes. */
  const writes = (s: string) => whenChanged((v) => (el(s).textContent = v))
  const show = {
    name: writes('.name'),
    job: writes('.job'),
    with: writes('.with'),
    home: writes('.home'),
    traits: writes('.traits'),
    now: writes('.now'),
  }
  el('.stop').onclick = () => view.follow(null)

  return {
    /** Show the Walker followed as they are now, or hide the note while nobody is. Call it every frame. */
    update() {
      const walker = view.followed
      if (note.hidden !== !walker) note.hidden = !walker
      if (!walker) return
      show.name(walker.name)
      show.job(walker.job)
      show.with(view.otherOfTwo(walker)?.name ?? 'on their own')
      show.home(walker.home)
      show.traits(walker.traits.join(', '))
      show.now(doingNow(walker))
    },
  }
}
