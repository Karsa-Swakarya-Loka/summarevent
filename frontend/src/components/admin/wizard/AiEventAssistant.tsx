import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { LoaderCircle, Send, Sparkles, WandSparkles } from 'lucide-react'
import { toast } from 'sonner'
import { AI_MAX_TEXT, askEventAssistant, type AiTurn } from '@/api/ai'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Venue } from '@/domain/types'
import { cn } from '@/lib/utils'
import { AI_FIELD_LABEL, changedAiFields, mergeAiFields, missingAiFields, sanitizeAiFields, type AiEventFields } from './aiFill'

/** The server takes 16 turns; the last one has to be the panitia's. */
const MAX_TURNS = 15

/**
 * AD-01 with AI: the panitia tells the assistant about the event in their own words, it asks for what is still missing,
 * and once everything is there the wizard fills itself. The panitia can fill it earlier, and can change anything after.
 */
export function AiEventAssistant({ venues, onFill }: { venues: Venue[]; onFill: (fields: AiEventFields) => void }) {
  const inputId = useId()
  const [turns, setTurns] = useState<AiTurn[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [fields, setFields] = useState<AiEventFields>({})
  /** What the form got last time: a later fill only brings what changed since. */
  const [applied, setApplied] = useState<AiEventFields>({})
  const box = useRef<HTMLTextAreaElement>(null)

  const found = (Object.keys(fields) as Array<keyof AiEventFields>).map((k) => AI_FIELD_LABEL[k])
  const full = turns.length >= MAX_TURNS

  const fill = (f: AiEventFields) => {
    const fresh = changedAiFields(applied, f)
    if (!Object.keys(fresh).length) return
    onFill(fresh)
    setApplied(f)
    toast.success('Form terisi dari jawaban AI. Cek lagi sebelum lanjut.')
  }

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    const message = text.trim()
    if (!message || busy || full) return
    const next: AiTurn[] = [...turns, { role: 'user', text: message }]
    setTurns(next)
    setText('')
    setBusy(true)
    setProblem(null)
    try {
      const answer = await askEventAssistant(next, venues.map((v) => v.name))
      const merged = mergeAiFields(fields, sanitizeAiFields(answer.fields, venues))
      setTurns([...next, { role: 'ai', text: answer.reply }])
      setFields(merged)
      if (!missingAiFields(merged).length) fill(merged)
    } catch (err) {
      // the message stays in the box, so nothing typed is lost
      setTurns(turns)
      setText(message)
      setProblem(err instanceof Error ? err.message : 'Asisten AI tidak bisa menjawab sekarang. Isi form manual dulu.')
    } finally {
      setBusy(false)
      box.current?.focus()
    }
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // keyCode 229: Safari still composing (IME)
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) void send(e)
  }

  return (
    <section aria-label="Isi cepat dengan AI" className="mb-4 rounded-2xl border border-brand/30 bg-brand-soft/40 p-4">
      <h2 className="flex items-center gap-1.5 text-base font-bold">
        <Sparkles className="size-4 text-brand" aria-hidden /> Isi cepat dengan AI
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Ceritakan acaranya. AI menanyakan yang kurang, lalu mengisi form. Semuanya tetap bisa diubah.</p>

      {turns.length > 0 && (
        <ol role="log" aria-live="polite" aria-label="Percakapan dengan AI" className="mt-3 flex flex-col gap-2">
          {turns.map((t, i) => (
            <li key={i} className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line', t.role === 'user' ? 'self-end bg-brand text-white' : 'self-start bg-card shadow-[0_1px_2px_rgb(35_31_32/0.06)]')}>
              <span className="sr-only">{t.role === 'user' ? 'Kamu: ' : 'AI: '}</span>
              {t.text}
            </li>
          ))}
          {busy && (
            <li className="flex items-center gap-2 self-start text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden /> AI sedang menulis…
            </li>
          )}
        </ol>
      )}

      {found.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Sudah ditangkap: {found.join(', ')}.</p>}

      <form onSubmit={(e) => void send(e)} className="mt-3 flex flex-col gap-2">
        <Label htmlFor={inputId} className="sr-only">
          Pesan untuk AI
        </Label>
        <Textarea
          id={inputId}
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          maxLength={AI_MAX_TEXT}
          readOnly={busy}
          disabled={full}
          aria-busy={busy}
          aria-describedby={problem ? `${inputId}-error` : undefined}
          placeholder={turns.length ? 'Jawab pertanyaan AI…' : 'Contoh: Mau bikin acara Bandung Kids Fest di Atrium Ciunik, pengunjungnya 100–200 orang, tiket Rp50.000.'}
          className="bg-card"
        />
        {problem && (
          <p id={`${inputId}-error`} role="alert" className="text-xs font-medium text-status-invalid">
            {problem}
          </p>
        )}
        {full && <p className="text-xs text-muted-foreground">Percakapan sudah panjang. Isi form sekarang, lalu lengkapi sisanya manual.</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" className="h-11 sm:w-auto" disabled={busy || full || !text.trim()}>
            {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />} Kirim
          </Button>
          <Button type="button" variant="outline" className="h-11 sm:w-auto" disabled={busy || !Object.keys(changedAiFields(applied, fields)).length} onClick={() => fill(fields)}>
            <WandSparkles aria-hidden /> Isi form sekarang
          </Button>
        </div>
      </form>
    </section>
  )
}
