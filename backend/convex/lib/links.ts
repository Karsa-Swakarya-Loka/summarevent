import { receiptPhotoSig } from './crypto'

/** Where http.ts is reachable from outside: the deployment's .convex.site URL, or PUBLIC_API_URL behind a proxy. */
export function apiBase(): string {
  return (process.env.PUBLIC_API_URL || `${process.env.CONVEX_SITE_URL ?? ''}/api`).replace(/\/$/, '')
}

/** A signed link to an uploaded receipt photo (GET /receipt-photos/:id?sig=). */
export async function receiptPhotoLink(receiptId: string): Promise<string> {
  return `${apiBase()}/receipt-photos/${receiptId}?sig=${await receiptPhotoSig(receiptId)}`
}
