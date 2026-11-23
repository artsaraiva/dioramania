import type { View } from '../render/view'
import type { Ended, Walker } from '../walkers/walkers'
import { emptyItem, storyletItem } from './walker-note'
import './people.css'

/** People's sticker: a head over shoulders. */
const PEOPLE = `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 4a3.6 3.6 0 1 1 0 7.2A3.6 3.6 0 0 1 12 4zM5 20.5c0-4 3.1-6.6 7-6.6s7 2.6 7 6.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

/**
 * People (#290): a sticker after City notes' opens and closes a paper note in the left slot (`./screen.css`), ringed
 * in stamp red while it is open, that lists the Walkers the player Keeps, a two in one row, each with what they are
 * doing now, a click on one Following them; and the Storylets that ended lately, the newest first, each with who it happened to, which
 * outlast the Walkers they were about. Whether it is open is not saved.
 */
export function createPeople(corner: HTMLElement, slot: HTMLElement, view: View) {
  const button = corner.appendChild(document.createElement('button'))
  button.className = 'sticker'
  button.setAttribute('aria-label', 'People')
  button.title = 'People'
  button.innerHTML = PEOPLE

  const panel = slot.appendChild(document.createElement('section'))
  panel.className = 'paper people'
  panel.style.setProperty('--tilt', '0.7deg')
  panel.setAttribute('aria-label', 'People')
  panel.innerHTML = `
    <span class="tape yellow" style="--tilt: 3deg"></span>
    <header><h2>People</h2><button class="close" aria-label="Close People">×</button></header>
    <span class="label">Kept</span>
    <ul class="kept"></ul>
    <span class="rule across"></span>
    <span class="label">Lately</span>
    <ol class="storylets lately"></ol>`
  const el = (s: string) => panel.querySelector<HTMLElement>(s)!
  let open = false
  const toggle = () => {
    open = !open
    button.setAttribute('aria-pressed', String(open))
    panel.hidden = !open
  }
  button.onclick = toggle
  el('.close').onclick = toggle
  panel.hidden = true

  /** What the lists last showed, the newest Storylet ended by itself: rebuilt only when it changes. */
  let shown = { kept: null as string | null, lately: null as Ended | undefined | null }
  /** The Walkers listed as Kept, in the order of the list. */
  let listed: readonly Walker[] = []
  el('.kept').onclick = (e) => {
    const row = (e.target as HTMLElement).closest('button')
    const walker = row && listed[Number(row.dataset.at)]
    if (walker && view.kept.includes(walker)) view.follow(walker)
  }

  return {
    /** Whether the note is open. */
    get open() {
      return open
    },

    /** Show the Walkers Kept and the Storylets that ended, while the note is open. Call it every frame. */
    update() {
      if (!open) return
      const kept = view.kept
      const key = kept.map((w) => `${w.name}:${view.doingNow(w)}`).join('|')
      if (key !== shown.kept || kept.some((w, i) => w !== listed[i])) {
        listed = kept
        el('.kept').replaceChildren(
          ...(kept.length
            ? kept.map((walker, at) => {
                const item = document.createElement('li')
                const row = item.appendChild(document.createElement('button'))
                const other = view.otherOfTwo(walker)
                row.dataset.at = String(at)
                row.title = `Follow ${walker.name}`
                row.appendChild(document.createElement('b')).textContent = other ? `${walker.name} and ${other.name}` : walker.name
                const now = row.appendChild(document.createElement('span'))
                now.className = 'handwritten'
                now.textContent = view.doingNow(walker)
                return item
              })
            : [emptyItem('Nobody. Follow someone, then Keep them.')]),
        )
      }
      const { ended } = view
      if (ended[0] !== shown.lately) {
        el('.lately').replaceChildren(
          ...(ended.length ? ended.map((e) => storyletItem(e.title, e.lines, e.who)) : [emptyItem('No Storylet has ended yet.')]),
        )
      }
      shown = { kept: key, lately: ended[0] }
    },
  }
}
