import { useEffect, useState, type ComponentType } from 'react'
import { TEAM } from './team'

/** How long the panel takes to slide over (.ssf-slides' transition). */
const SLIDE_MS = 650

/**
 * The Tim slide. The crumpling posters need three and gsap, too heavy for a landing page only some visitors look past,
 * so they load the first time this slide opens. They mount once the panel has finished sliding, because printing the
 * first poster holds the main thread for a moment. Without a connection the team is still there, as a plain list.
 */
export function TeamSlide({ open }: { open: boolean }) {
  const [Posters, setPosters] = useState<ComponentType | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open || Posters) return
    let gone = false
    const slid = new Promise((done) => setTimeout(done, SLIDE_MS))
    Promise.all([import('./CrumpleTeam'), slid]).then(
      ([module]) => {
        if (!gone) setPosters(() => module.default)
      },
      () => {
        if (!gone) setFailed(true)
      },
    )
    return () => {
      gone = true
    }
  }, [open, Posters])

  if (Posters) return <Posters />
  if (!failed) return <p role="status" className="grid h-full place-items-center text-sm text-[#fbf3e4]">{open ? 'Memuat poster tim…' : ''}</p>
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col justify-center px-6 text-[#fbf3e4]">
      <h2 className="font-poster text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.95] uppercase">Lima orang, satu pass</h2>
      <ul className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {TEAM.map((m) => (
          <li key={m.name} className="flex items-baseline justify-between gap-4 border-b border-white/15 pb-2">
            <span className="text-lg font-bold">{m.name}</span>
            <span className="text-sm opacity-80">{m.role}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
