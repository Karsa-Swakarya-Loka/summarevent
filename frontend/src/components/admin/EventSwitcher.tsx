/**
 * The event in view, and the way to change it: a card at the foot of the sidebar and a pill in the dashboard's header,
 * both opening the same tree of events and their sessions. Picking an event switches every admin screen to it;
 * picking a session opens its live seat map. The tree follows the WAI-ARIA tree pattern: arrows move, Right opens a
 * branch, Left closes it, Enter picks, and the search box above narrows the events.
 */
import { finePointer } from '@/lib/pointer'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { CalendarPlus, Check, ChevronDown, ChevronRight, ChevronsUpDown, Play, Rows3, Search } from 'lucide-react'
import type { EventSummary } from '@/api/contract'
import { Poster } from '@/components/common/Poster'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { eventDateLabel, eventDisplayStatus, EVENT_STATUS_LABEL, sessionLabel, sessionSold, type AdminOutlet } from './lib'

export function EventSwitcher({ ctx, variant, className }: { ctx: AdminOutlet; variant: 'card' | 'pill'; className?: string }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const current = ctx.summary
  const title = current?.event.title ?? (ctx.events ? 'Belum ada event' : 'Memuat event…')
  const thumb = current ? <Poster theme={current.event.posterTheme} palette={current.event.posterPalette} title={current.event.title} bare className={variant === 'card' ? 'h-10 w-10 shrink-0 rounded-lg' : 'h-6 w-8 shrink-0 rounded-md'} /> : <span className={cn('shrink-0 rounded-lg bg-track', variant === 'card' ? 'size-10' : 'h-6 w-8')} aria-hidden />

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === 'card' ? (
          <button type="button" disabled={!ctx.events} className={cn('flex w-full items-center gap-3 rounded-xl bg-panel px-3 py-2.5 text-left transition hover:bg-muted disabled:opacity-70', className)}>
            {thumb}
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold">{title}</span>
              <span className="block truncate text-xs text-muted-foreground">{current ? eventDateLabel(current.event) : 'Event yang dipantau'}</span>
            </span>
            <span className="sr-only">, ganti event</span>
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-card ring-1 ring-foreground/10" aria-hidden>
              <ChevronDown className="size-4 text-muted-foreground" />
            </span>
          </button>
        ) : (
          <button type="button" disabled={!ctx.events} className={cn('flex h-10 min-w-0 items-center gap-2 rounded-xl bg-card pr-2.5 pl-2 text-left ring-1 ring-foreground/10 transition pointer-coarse:h-11 hover:bg-muted disabled:opacity-70', className)}>
            {thumb}
            <span className="min-w-0 flex-1 truncate text-sm font-semibold sm:max-w-[16rem]">{title}</span>
            <span className="sr-only">, ganti event</span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align={variant === 'card' ? 'start' : 'end'} side={variant === 'card' ? 'top' : 'bottom'} className="w-[min(92vw,22rem)] p-0">
        {open && (
          <EventTree
            list={ctx.list}
            eventId={ctx.eventId}
            onPick={(id) => {
              setOpen(false)
              ctx.setEventId(id)
            }}
            onSession={(eventId, sessionId) => {
              setOpen(false)
              navigate(`/admin/live?event=${eventId}&session=${sessionId}`)
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}

type Node = { kind: 'event'; id: string } | { kind: 'session'; id: string; eventId: string }

function EventTree({ list, eventId, onPick, onSession }: { list: EventSummary[]; eventId: string; onPick: (id: string) => void; onSession: (eventId: string, sessionId: string) => void }) {
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([eventId]))
  const needle = q.trim().toLowerCase()
  const shown = useMemo(() => list.filter((e) => !needle || `${e.event.title} ${e.venue.name}`.toLowerCase().includes(needle)), [list, needle])
  // the visible rows, in reading order, for the arrow keys
  const rows = useMemo<Node[]>(() => shown.flatMap((e) => [{ kind: 'event', id: e.event.id } as Node, ...(expanded.has(e.event.id) ? e.sessions.map((s): Node => ({ kind: 'session', id: s.id, eventId: e.event.id })) : [])]), [shown, expanded])
  const [focus, setFocus] = useState(() => Math.max(0, list.findIndex((e) => e.event.id === eventId)))
  const refs = useRef(new Map<string, HTMLLIElement>())
  const search = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // on a phone the keyboard would cover the tree the person opened this to tap
    if (!finePointer()) return
    const t = setTimeout(() => search.current?.focus(), 40)
    return () => clearTimeout(t)
  }, [])

  const focusRow = (i: number) => {
    const n = rows[Math.max(0, Math.min(rows.length - 1, i))]
    if (!n) return
    setFocus(rows.indexOf(n))
    refs.current.get(n.id)?.focus()
  }
  const toggle = (id: string, open?: boolean) =>
    setExpanded((s) => {
      const n = new Set(s)
      if (open ?? !n.has(id)) n.add(id)
      else n.delete(id)
      return n
    })

  const onKey = (e: KeyboardEvent, i: number, node: Node) => {
    const has = node.kind === 'event' && !!shown.find((x) => x.event.id === node.id)?.sessions.length
    switch (e.key) {
      case 'ArrowDown':
        focusRow(i + 1)
        break
      case 'ArrowUp':
        if (i === 0) search.current?.focus()
        else focusRow(i - 1)
        break
      case 'ArrowRight':
        if (node.kind === 'event' && has) {
          if (expanded.has(node.id)) focusRow(i + 1)
          else toggle(node.id, true)
        }
        break
      case 'ArrowLeft':
        if (node.kind === 'event' && expanded.has(node.id)) toggle(node.id, false)
        else if (node.kind === 'session') focusRow(rows.findIndex((r) => r.kind === 'event' && r.id === node.eventId))
        break
      case 'Home':
        focusRow(0)
        break
      case 'End':
        focusRow(rows.length - 1)
        break
      case 'Enter':
      case ' ':
        if (node.kind === 'event') onPick(node.id)
        else onSession(node.eventId, node.id)
        break
      default:
        return
    }
    e.preventDefault()
  }

  return (
    <div className="flex max-h-[min(70vh,30rem)] flex-col">
      <div className="p-2 pb-1">
        <label className="flex h-10 items-center gap-2 rounded-xl bg-panel px-3 text-sm pointer-coarse:h-11 focus-within:ring-3 focus-within:ring-ring/50">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                focusRow(0)
              }
            }}
            placeholder="Cari event…"
            aria-label="Cari event"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>
      <ul role="tree" aria-label="Pilih event" className="min-h-0 flex-1 overflow-y-auto px-2 pb-1">
        {shown.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted-foreground">Tidak ada event yang cocok.</li>}
        {shown.map((e) => {
          const id = e.event.id
          const open = expanded.has(id)
          const i = rows.findIndex((r) => r.kind === 'event' && r.id === id)
          const st = eventDisplayStatus(e.event)
          const selected = id === eventId
          return (
            <li
              key={id}
              role="treeitem"
              aria-level={1}
              aria-expanded={e.sessions.length ? open : undefined}
              aria-selected={selected}
              tabIndex={i === focus ? 0 : -1}
              ref={(el) => {
                if (el) refs.current.set(id, el)
                else refs.current.delete(id)
              }}
              onFocus={() => setFocus(i)}
              onKeyDown={(ev) => onKey(ev, i, { kind: 'event', id })}
              className="outline-none [&:focus-visible>div]:ring-2 [&:focus-visible>div]:ring-ring/50 [&:focus-visible>div]:ring-inset"
            >
              <div onClick={() => onPick(id)} className={cn('flex min-h-12 cursor-pointer items-center gap-2 rounded-xl pr-2.5 pl-1 transition hover:bg-panel', selected && 'bg-panel')}>
                <span
                  role="presentation"
                  onClick={(ev) => {
                    ev.stopPropagation()
                    if (e.sessions.length) toggle(id)
                  }}
                  className={cn('grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition', e.sessions.length ? 'hover:bg-card hover:text-foreground' : 'opacity-0')}
                >
                  <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} aria-hidden />
                </span>
                <Poster theme={e.event.posterTheme} palette={e.event.posterPalette} title={e.event.title} bare className="h-7 w-10 shrink-0 rounded-md" />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-sm font-semibold">{e.event.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {eventDateLabel(e.event)} · {e.venue.name}
                  </span>
                </span>
                {selected ? (
                  <Check className="size-4 shrink-0 text-brand" aria-hidden />
                ) : (
                  <span className={cn('shrink-0 text-xs tabular-nums', st === 'PUBLISHED' ? 'text-muted-foreground' : 'rounded-md bg-card px-1.5 py-0.5 font-semibold text-muted-foreground ring-1 ring-foreground/10')}>{st === 'PUBLISHED' ? `${e.sessions.length} sesi` : EVENT_STATUS_LABEL[st]}</span>
                )}
              </div>
              {open && e.sessions.length > 0 && (
                <ul role="group" className="my-0.5 ml-[1.1rem] border-l border-foreground/10 pl-2">
                  {e.sessions.map((s) => {
                    const j = rows.findIndex((r) => r.kind === 'session' && r.id === s.id)
                    const n = sessionSold(s)
                    return (
                      <li
                        key={s.id}
                        role="treeitem"
                        aria-level={2}
                        aria-selected={false}
                        tabIndex={j === focus ? 0 : -1}
                        ref={(el) => {
                          if (el) refs.current.set(s.id, el)
                          else refs.current.delete(s.id)
                        }}
                        onFocus={() => setFocus(j)}
                        onKeyDown={(ev) => onKey(ev, j, { kind: 'session', id: s.id, eventId: id })}
                        onClick={() => onSession(id, s.id)}
                        className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm outline-none transition hover:bg-panel focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                      >
                        {s.demoLive ? <Play className="size-3.5 shrink-0 text-brand" aria-hidden /> : <Rows3 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                        <span className="min-w-0 flex-1 truncate">{sessionLabel(s)}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {n.sold}/{n.total}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      <div className="flex items-center justify-between gap-2 border-t border-foreground/[0.07] p-2">
        <Link to="/admin/events" className="flex min-h-11 items-center rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition hover:bg-panel hover:text-foreground">
          Semua event
        </Link>
        <Link to="/admin/events/new" className="flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold transition hover:bg-panel">
          <CalendarPlus className="size-4" aria-hidden /> Buat event
        </Link>
      </div>
    </div>
  )
}
