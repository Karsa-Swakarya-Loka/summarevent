// Loaded on demand by <Illustration>, so the sticker kit stays out of the main bundle.
import { useEffect, useRef } from 'react'
import { paint } from './fun'
import { Sticker } from './Sticker'
import { SUMMA, camera, coins, gift, kursi, mailbox, notes, padlock, search, tiket } from './icons'

const ART = { kursi, tiket, coins, gift, notes, padlock, mailbox, search, camera }
export type ArtName = keyof typeof ART

/**
 * How far each drawing sits from the middle of its 500-unit square, measured over its whole motion (every frame of
 * the loop, the resting frame included). The kit's own icons are drawn high, low or to one side, so each is moved
 * back by that much and sits in the middle of whatever holds it (kursi is placed in the middle in icons.ts itself).
 * Measure again when an icon in icons.ts changes.
 */
const OFF_CENTRE: Record<ArtName, [number, number]> = {
  kursi: [0, 0],
  tiket: [-8, 7],
  coins: [-14, 48],
  gift: [8, 24],
  notes: [-50, 32],
  padlock: [-17, 22],
  mailbox: [6, 29],
  search: [33, -19],
  camera: [-4, 13],
}

export default function Art({ name, loop, enter, still }: { name: ArtName; loop?: boolean; enter?: number; still?: boolean }) {
  const [x, y] = OFF_CENTRE[name]
  const style = { transform: `translate(${-x / 5}%, ${-y / 5}%)` }
  if (still) return <Still name={name} style={style} />
  return <Sticker icon={ART[name]} palette={SUMMA} loop={loop} enter={enter} style={style} />
}

/** The drawing at rest, painted once (and again when its box changes size): no motion at all. */
function Still({ name, style }: { name: ArtName; style: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const icon = ART[name]
    const go = () => paint(el, icon, icon.still ?? 0, 1, SUMMA)
    go()
    const ro = new ResizeObserver(go)
    ro.observe(el)
    return () => ro.disconnect()
  }, [name])
  return <canvas ref={ref} className="block aspect-square w-full" style={style} />
}
