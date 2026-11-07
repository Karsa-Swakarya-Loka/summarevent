import { receiptPhotoSig } from './crypto'

/** Where http.ts is reachable from outside: the deployment's .convex.site URL, or PUBLIC_API_URL behind a proxy. */
export function apiBase(): string {
  return (process.env.PUBLIC_API_URL || `${process.env.CONVEX_SITE_URL ?? ''}/api`).replace(/\/$/, '')
}

/** How long a receipt photo link works: long enough to review the receipt and settle a dispute, not forever. */
const PHOTO_LINK_DAYS = 30

/** A signed link to an uploaded receipt photo (GET /receipt-photos/:id?exp=&sig=). */
export async function receiptPhotoLink(receiptId: string): Promise<string> {
  const exp = Date.now() + PHOTO_LINK_DAYS * 86_400_000
  return `${apiBase()}/receipt-photos/${receiptId}?exp=${exp}&sig=${await receiptPhotoSig(receiptId, exp)}`
}
