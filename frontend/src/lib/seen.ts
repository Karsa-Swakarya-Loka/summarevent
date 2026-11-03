/**
 * What this phone has already shown once: a ticket's issuing (the QR assembling) and its check-in tear, and the messages
 * opened in Pesan. Kept in the browser only; with storage cleared or blocked, things simply show again.
 */
const KEY = 'summarevent:seen'
type Kind = 'issued' | 'torn' | 'read'
export type Seen = Record<Kind, Set<string>>

export function readSeen(): Seen {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<Kind, string[]>>
    return { issued: new Set(v.issued), torn: new Set(v.torn), read: new Set(v.read) }
  } catch {
    return { issued: new Set(), torn: new Set(), read: new Set() }
  }
}

export function markSeen(kind: Kind, ids: string[]) {
  const all = readSeen()
  ids.forEach((id) => all[kind].add(id))
  try {
    localStorage.setItem(KEY, JSON.stringify({ issued: [...all.issued].slice(-200), torn: [...all.torn].slice(-200), read: [...all.read].slice(-200) }))
  } catch {
    /* blocked storage: shown again next time */
  }
}
