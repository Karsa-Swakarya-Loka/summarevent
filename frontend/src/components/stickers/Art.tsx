// Loaded on demand by <Illustration>, so the sticker kit stays out of the main bundle.
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

export default function Art({ name, loop, enter }: { name: ArtName; loop?: boolean; enter?: number }) {
  const [x, y] = OFF_CENTRE[name]
  return <Sticker icon={ART[name]} palette={SUMMA} loop={loop} enter={enter} style={{ transform: `translate(${-x / 5}%, ${-y / 5}%)` }} />
}
