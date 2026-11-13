/**
 * What search engines and link previews read from a single-page app: the page title per screen, and schema.org data for
 * an event page, so a search shows its date, place and price.
 */
import { useEffect } from 'react'
import type { EventDetail } from '@/api/contract'

const SITE = 'Summarevent'
const DEFAULT_TITLE = 'Summarevent · Tiket event Summarecon Mall Bandung'
const MALL = { name: 'Summarecon Mall Bandung', city: 'Bandung', region: 'Jawa Barat', country: 'ID' }

/** "Pentas Musikal · Summarevent" while the screen is open; the default title again when it closes. */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return
    document.title = `${title} · ${SITE}`
    return () => {
      document.title = DEFAULT_TITLE
    }
  }, [title])
}

/** schema.org Event, one per real session (the always-running test session is left out). */
export function eventJsonLd(d: EventDetail, origin: string): string {
  const url = `${origin}/app/e/${d.event.slug}`
  const offers = d.categories.map((c) => ({
    '@type': 'Offer',
    name: c.name,
    price: c.accessMethod === 'PAID' ? c.price : 0,
    priceCurrency: 'IDR',
    url,
    availability: 'https://schema.org/InStock',
    ...(c.accessMethod === 'RECEIPT' ? { description: 'Gratis dengan struk belanja di tenant SUMMABA' } : {}),
  }))
  const events = d.sessions
    .filter((s) => !s.demoLive)
    .map((s) => ({
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: s.label ? `${d.event.title} (${s.label})` : d.event.title,
      description: d.event.description,
      startDate: s.startAt,
      endDate: s.endAt,
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      url,
      location: {
        '@type': 'Place',
        name: `${d.venue.name}, ${MALL.name}`,
        address: { '@type': 'PostalAddress', addressLocality: MALL.city, addressRegion: MALL.region, addressCountry: MALL.country },
      },
      organizer: { '@type': 'Organization', name: MALL.name },
      offers,
    }))
  // "<" escaped, so a title can never close the script element
  return JSON.stringify(events).replace(/</g, '\\u003c')
}
