import { CalendarPlus, Trash2 } from 'lucide-react'
import { Field, SectionCard } from '@/components/admin/AdminUi'
import { Button } from '@/components/ui/button'
import { fmtDate, fmtDuration, fmtShortDate, fmtTime } from '@/lib/format'
import { TextInput, ToggleRow } from './inputs'
import { newSession, type SessionForm, type StepProps, type WizardForm } from './model'

const dtCls =
  'h-10 w-full min-w-0 rounded-lg border border-input bg-card px-2.5 text-sm pointer-coarse:h-11 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15'

export function StepSessions({ form, update, err }: StepProps) {
  const set = (k: string, patch: Partial<SessionForm>) => update((f) => ({ ...f, sessions: f.sessions.map((s) => (s.key === k ? { ...s, ...patch } : s)) }))
  return (
    <div className="flex flex-col gap-4">
      {err('sessions') && (
        <p role="alert" className="rounded-lg border border-status-invalid/30 bg-status-invalid/5 p-3 text-sm font-medium text-[#a11b1b]">
          {err('sessions')}
        </p>
      )}
      {form.sessions.map((s, i) => {
        const f = (x: string) => `ses.${s.key}.${x}`
        const id = (x: string) => `${s.key}-${x}`
        return (
          <SectionCard
            key={s.key}
            title={`Sesi ${i + 1}${s.label.trim() && s.label.trim() !== `Sesi ${i + 1}` ? ` · ${s.label.trim()}` : ''}`}
            description={s.date ? fmtDate(`${s.date}T12:00:00+07:00`) : undefined}
            actions={
              <Button type="button" variant="ghost" size="lg" className="text-muted-foreground hover:text-status-invalid" onClick={() => update((x) => ({ ...x, sessions: x.sessions.filter((y) => y.key !== s.key) }))} aria-label={`Hapus sesi ${i + 1}`}>
                <Trash2 /> Hapus
              </Button>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_11rem_8rem_8rem]">
              <Field id={id('label')} label="Nama sesi" optional className="sm:col-span-2 lg:col-span-1">
                <TextInput id={id('label')} value={s.label} placeholder={`Sesi ${i + 1}`} onChange={(e) => set(s.key, { label: e.target.value })} />
              </Field>
              <Field id={id('date')} label="Tanggal" error={err(f('date'))} className="sm:col-span-2 lg:col-span-1">
                <input id={id('date')} type="date" className={dtCls} value={s.date} aria-invalid={!!err(f('date')) || undefined} onChange={(e) => set(s.key, { date: e.target.value })} />
              </Field>
              <Field id={id('start')} label="Jam mulai" error={err(f('start'))}>
                <input id={id('start')} type="time" className={dtCls} value={s.start} aria-invalid={!!err(f('start')) || undefined} onChange={(e) => set(s.key, { start: e.target.value })} />
              </Field>
              <Field id={id('end')} label="Jam selesai" error={err(f('end'))}>
                <input id={id('end')} type="time" className={dtCls} value={s.end} aria-invalid={!!err(f('end')) || undefined} onChange={(e) => set(s.key, { end: e.target.value })} />
              </Field>
            </div>
            <SessionTimeline s={s} form={form} />
            <div className="mt-3">
              <ToggleRow
                id={id('demo')}
                checked={s.demoLive}
                onChange={(v) => set(s.key, { demoLive: v })}
                title="Sesi uji coba"
                description="Sesi ini selalu sedang berlangsung, jadi petugas bisa mencoba scan kapan saja. Jamnya ikut waktu sekarang."
              />
            </div>
          </SectionCard>
        )
      })}
      <Button type="button" variant="outline" size="lg" className="h-11 self-start border-dashed" onClick={() => update((f) => ({ ...f, sessions: [...f.sessions, newSession(f.sessions[f.sessions.length - 1])] }))}>
        <CalendarPlus /> Tambah sesi
      </Button>
    </div>
  )
}

const at = (iso: string) => `${fmtShortDate(iso)} ${fmtTime(iso)}`
const wib = (date: string, time: string) => (date && time ? new Date(`${date}T${time}:00+07:00`) : null)

/**
 * What the session's times mean, worked out from the dates and the other steps' settings, so the panitia sees real
 * clock times instead of "60 menit sebelum sesi": when each category is on sale, when check-in is open, how long the
 * session lasts.
 */
function SessionTimeline({ s, form }: { s: SessionForm; form: WizardForm }) {
  if (s.demoLive) {
    return <p className="mt-3 rounded-xl bg-muted/60 px-3.5 py-2.5 text-sm text-muted-foreground">Sesi uji coba: jamnya ikut waktu sekarang, jadi check-in selalu terbuka.</p>
  }
  const start = wib(s.date, s.start)
  const end = wib(s.date, s.end)
  if (!start || !end || Number.isNaN(start.getTime()) || end <= start) return null
  const iso = (d: Date) => d.toISOString()
  const { checkinOpenMin, checkinCloseMin } = form.rules
  const rows: Array<{ key: string; dots: string[]; title: string; sub?: string; when: string; note?: string; warn?: boolean }> = []
  // categories on sale over the same stretch share one line
  const windows = new Map<string, { dots: string[]; names: string[]; bad: boolean }>()
  for (const c of form.categories) {
    const open = c.saleStart ? new Date(`${c.saleStart}:00+07:00`) : null
    const close = new Date(start.getTime() - (Number.isFinite(c.saleCloseMin) ? c.saleCloseMin : 0) * 60_000)
    const known = open !== null && !Number.isNaN(open.getTime())
    const when = known ? `${at(iso(open))} – ${at(iso(close))}` : `sampai ${at(iso(close))}`
    const w = windows.get(when) ?? { dots: [], names: [], bad: false }
    w.dots.push(c.color)
    w.names.push(c.name.trim() || 'Tanpa nama')
    w.bad ||= known && open >= close
    windows.set(when, w)
  }
  for (const [when, w] of windows) {
    rows.push({
      key: 'tiket-' + when,
      dots: w.dots,
      title: 'Tiket dibuka',
      sub: w.names.join(', '),
      when,
      note: w.bad ? 'Tutup sebelum dibuka. Majukan tanggal buka penjualan di langkah Kategori.' : undefined,
      warn: w.bad,
    })
  }
  const cin = new Date(start.getTime() - checkinOpenMin * 60_000)
  const cout = new Date(end.getTime() - checkinCloseMin * 60_000)
  rows.push({ key: 'checkin', dots: ['#231f20'], title: 'Check-in di pintu', when: `${fmtTime(iso(cin))} – ${fmtTime(iso(cout))}` })
  rows.push({ key: 'sesi', dots: ['#006426'], title: 'Sesi berlangsung', when: `${fmtTime(iso(start))} – ${fmtTime(iso(end))}`, note: fmtDuration(end.getTime() - start.getTime()) })
  return (
    <div className="mt-3 rounded-xl border bg-card px-3.5 py-3">
      <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Jadwal sesi ini (WIB)</p>
      <ol className="relative mt-2.5 grid gap-2.5 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-px before:bg-border">
        {rows.map((r) => (
          <li key={r.key} className="relative grid gap-x-3 pl-9 text-sm sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <span className="absolute top-1 left-0 flex -space-x-1" aria-hidden>
              {r.dots.slice(0, 4).map((d, k) => (
                <span key={k} className="size-[11px] rounded-full ring-2 ring-card" style={{ background: d }} />
              ))}
            </span>
            <span className="font-semibold">
              {r.title}
              {r.sub && <span className="block text-xs font-normal text-muted-foreground">{r.sub}</span>}
            </span>
            <span className={r.warn ? 'font-semibold text-[#a11b1b]' : 'tabular-nums text-muted-foreground'}>
              {r.when}
              {r.note && <span className={r.warn ? 'block' : ''}>{r.warn ? r.note : ` · ${r.note}`}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
