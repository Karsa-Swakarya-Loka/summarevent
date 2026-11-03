// Loaded on demand by <Illustration>, so the sticker kit stays out of the main bundle.
import { Sticker } from './Sticker'
import { SUMMA, camera, coins, gift, kursi, mailbox, notes, padlock, search, tiket } from './icons'

const ART = { kursi, tiket, coins, gift, notes, padlock, mailbox, search, camera }
export type ArtName = keyof typeof ART

export default function Art({ name, loop, enter }: { name: ArtName; loop?: boolean; enter?: number }) {
  return <Sticker icon={ART[name]} palette={SUMMA} loop={loop} enter={enter} />
}
