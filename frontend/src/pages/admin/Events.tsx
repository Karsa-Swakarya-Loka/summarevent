/** AD-01 / AD-06 / AD-11: event list with publish, edit, live view and link + QR poster. */
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { CalendarPlus, Eye, Pencil, QrCode, Rocket, Rows3 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { EventSummary } from '@/api/contract'
import { ListSkeleton, LoadError, PageHeader } from '@/components/admin/AdminUi'
import { eventDateLabel, eventDisplayStatus, EVENT_STATUS_LABEL, EVENT_STATUS_TONE } from '@/components/admin/lib'
import { ShareEventDialog } from '@/components/admin/ShareEvent'
import { EmptyState, StatusBadge } from '@/components/common/bits'
import { Poster } from '@/components/common/Poster'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { EventItem } from '@/domain/types'
import { errorMessage, useLive } from '@/hooks/useLive'

function totals(e: EventSummary) {
  const sold = e.sessions.reduce((a, s) => a + s.availability.reduce((x, y) => x + y.sold, 0), 0)
  const total = e.sessions.reduce((a, s) => a + s.total, 0)
  return { sold, total, pct: total ? Math.round((sold / total) * 100) : 0 }
}

function SoldCell({ e }: { e: EventSummary }) {
  if (e.event.infoOnly) return <span className="text-xs text-muted-foreground">Info saja, tanpa tiket</span>
  const t = totals(e)
  return (
    <div className="flex min-w-28 flex-col gap-1">
      <span className="text-sm font-semibold tabular-nums">
        {t.sold} <span className="font-normal text-muted-foreground">/ {t.total}</span>
      </span>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-brand" style={{ width: `${t.pct}%` }} />
      </div>
    </div>
  )
}

function IconAction({ label, to, onClick, children, disabled }: { label: string; to?: string; onClick?: () => void; children: ReactNode; disabled?: boolean }) {
  const btn = to ? (
    <Button variant="outline" size="icon-lg" asChild aria-label={label}>
      <Link to={to}>{children}</Link>
    </Button>
  ) : (
    <Button variant="outline" size="icon-lg" onClick={onClick} aria-label={label} disabled={disabled}>
      {children}
    </Button>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export default function Events() {
  const navigate = useNavigate()
  const events = useLive(() => api.admin.listEvents(), [])
  const [share, setShare] = useState<EventItem | null>(null)
  const [publishing, setPublishing] = useState<string | null>(null)

  const publish = async (e: EventItem) => {
    setPublishing(e.id)
    try {
      const ev = await api.admin.publishEvent(e.id)
      toast.success(`"${ev.title}" sudah dipublikasikan. Bagikan link & QR-nya.`)
      setShare(ev)
      events.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setPublishing(null)
    }
  }

  const actions = (e: EventSummary, compact = false) => {
    const ev = e.event
    const canLive = !ev.infoOnly && e.sessions.length > 0
    return (
      // table rows keep their icon buttons on one line; the phone cards may wrap
      <div className={compact ? 'flex flex-wrap items-center gap-2' : 'flex items-center justify-end gap-2'}>
        {ev.status === 'DRAFT' && (
          <Button size="lg" onClick={() => void publish(ev)} disabled={publishing === ev.id}>
            <Rocket /> Publish
          </Button>
        )}
        {compact ? (
          <>
            <Button variant="outline" size="lg" asChild>
              <Link to={`/admin/events/${ev.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
            {canLive && (
              <Button variant="outline" size="lg" asChild>
                <Link to={`/admin/live?event=${ev.id}`}>
                  <Rows3 /> Lihat live
                </Link>
              </Button>
            )}
            <Button variant="outline" size="lg" onClick={() => setShare(ev)}>
              <QrCode /> Link & QR
            </Button>
          </>
        ) : (
          <>
            <IconAction label="Edit event" to={`/admin/events/${ev.id}/edit`}>
              <Pencil />
            </IconAction>
            <IconAction label={canLive ? 'Lihat peta kursi live' : 'Belum ada sesi untuk dipantau'} to={canLive ? `/admin/live?event=${ev.id}` : undefined} disabled={!canLive}>
              <Rows3 />
            </IconAction>
            <IconAction label="Link & QR poster" onClick={() => setShare(ev)}>
              <QrCode />
            </IconAction>
            {ev.status !== 'DRAFT' && (
              <IconAction label="Lihat sebagai pengunjung" onClick={() => window.open(`/app/e/${ev.slug}`, '_blank', 'noopener')}>
                <Eye />
              </IconAction>
            )}
          </>
        )}
      </div>
    )
  }

  const list = events.data ?? []

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Event"
        description="Kategori, denah, dan sesi tiap event. Draft belum terlihat pengunjung."
        actions={
          <Button size="lg" className="h-11 px-4 text-base" onClick={() => navigate('/admin/events/new')}>
            <CalendarPlus /> Buat event
          </Button>
        }
      />

      {events.error ? <LoadError error={events.error} onRetry={events.reload} className="mb-4" /> : null}

      {!events.data && !events.error ? (
        <ListSkeleton rows={4} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus />}
          title="Belum ada event"
          action={
            <Button size="lg" onClick={() => navigate('/admin/events/new')}>
              Buat event pertama
            </Button>
          }
        >
          Mulai dari judul, kategori tiket, denah, lalu sesi. Kurang dari 5 menit.
        </EmptyState>
      ) : (
        <>
          {/* desktop / tablet table */}
          <div className="hidden overflow-hidden rounded-[1.25rem] bg-card ring-1 ring-foreground/[0.07] md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-panel hover:bg-panel">
                  <TableHead className="pl-4">Event</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead className="text-center">Sesi</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Terjual / total</TableHead>
                  <TableHead className="pr-4 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((e) => {
                  const st = eventDisplayStatus(e.event)
                  return (
                    <TableRow key={e.event.id}>
                      <TableCell className="py-3 pl-4">
                        <div className="flex items-center gap-3">
                          <Poster theme={e.event.posterTheme} palette={e.event.posterPalette} title="" compact className="hidden h-12 w-16 shrink-0 rounded-lg lg:block [&_span]:hidden" />
                          <div className="min-w-0 max-w-[18rem] whitespace-normal">
                            <Link to={`/admin/events/${e.event.id}/edit`} className="line-clamp-2 font-semibold hover:underline">
                              {e.event.title}
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              {e.event.seatingMode === 'RESERVED' ? 'Kursi bernomor' : 'Tanpa nomor kursi'} · {e.categories.length} kategori
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">{e.venue.name}</TableCell>
                      <TableCell className="whitespace-normal">{eventDateLabel(e.event)}</TableCell>
                      <TableCell className="text-center tabular-nums">{e.sessions.length || '–'}</TableCell>
                      <TableCell>
                        <StatusBadge tone={EVENT_STATUS_TONE[st]}>{EVENT_STATUS_LABEL[st]}</StatusBadge>
                      </TableCell>
                      <TableCell>
                        <SoldCell e={e} />
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex justify-end">{actions(e)}</div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* mobile cards */}
          <ul className="flex flex-col gap-3 md:hidden">
            {list.map((e) => {
              const st = eventDisplayStatus(e.event)
              return (
                <li key={e.event.id} className="overflow-hidden rounded-[1.25rem] bg-panel">
                  <Poster theme={e.event.posterTheme} palette={e.event.posterPalette} title={e.event.title} compact className="h-24" />
                  <div className="flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={EVENT_STATUS_TONE[st]}>{EVENT_STATUS_LABEL[st]}</StatusBadge>
                      <span className="text-xs text-muted-foreground">{e.event.seatingMode === 'RESERVED' ? 'Kursi bernomor' : 'Tanpa nomor kursi'}</span>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">Venue</dt>
                        <dd className="font-medium">{e.venue.name}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Tanggal</dt>
                        <dd className="font-medium">{eventDateLabel(e.event)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Sesi</dt>
                        <dd className="font-medium">{e.sessions.length || '–'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Terjual / total</dt>
                        <dd>
                          <SoldCell e={e} />
                        </dd>
                      </div>
                    </dl>
                    {actions(e, true)}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <ShareEventDialog event={share} open={!!share} onOpenChange={(v) => !v && setShare(null)} />
    </div>
  )
}
