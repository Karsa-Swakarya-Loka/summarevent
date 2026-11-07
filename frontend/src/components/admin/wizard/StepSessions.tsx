import { CalendarPlus, Trash2 } from 'lucide-react'
import { Field, SectionCard } from '@/components/admin/AdminUi'
import { Button } from '@/components/ui/button'
import { fmtDate } from '@/lib/format'
import { TextInput, ToggleRow } from './inputs'
import { newSession, type SessionForm, type StepProps } from './model'

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
            title={`Sesi ${i + 1}${s.label.trim() ? ` · ${s.label.trim()}` : ''}`}
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
            <div className="mt-3">
              <ToggleRow
                id={id('demo')}
                checked={s.demoLive}
                onChange={(v) => set(s.key, { demoLive: v })}
                title="Sesi demo (selalu berlangsung)"
                description="Untuk uji coba scan kapan saja. Jam sesi otomatis mengikuti waktu sekarang."
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
