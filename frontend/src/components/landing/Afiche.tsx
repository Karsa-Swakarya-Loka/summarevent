/**
 * Afiche: a fan of tall posters, adapted from «Afiche» by Moxen (moxen.cl/recursos, licence in
 * docs/lisensi/moxen-afiche.txt). The motion lives in fan.ts: a swipe (also from a poster's button), the round arrows
 * under the fan, the arrow keys and a sideways trackpad swipe each bring the next poster to the front.
 * Each poster has two actions, Masuk and Daftar, real buttons, so keyboard users press them directly; focusing one from
 * the keyboard brings its poster to the front.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { mountFan, type Fan } from './fan'
import './afiche.css'

export type PosterVariant = 'crema' | 'negro' | 'ambar'

export interface PosterSpec {
  key: string
  variant: PosterVariant
  /** The huge word (letters climb in when the poster opens). */
  word: string
  /** The role: the poster's heading and its button under the fan. */
  title: string
  /** A sticker or any art placed by the variant. */
  art?: ReactNode
  /** The main action first (filled), then the second (outlined). */
  actions: ReadonlyArray<{ label: ReactNode; onClick: () => void }>
}

export function Afiche({ posters, label, className, start }: { posters: PosterSpec[]; label: string; className?: string; start?: number }) {
  const scene = useRef<HTMLDivElement>(null)
  const fan = useRef<Fan | null>(null)
  // the fan starts on the poster asked for, else on its middle one (fan.ts)
  const first = start !== undefined && start >= 0 && start < posters.length ? start : Math.floor((posters.length - 1) / 2)
  const [centre, setCentre] = useState(first)
  const startRef = useRef(first)

  // a layout effect: the fan is mounted and sized before the browser paints, so coming back to this page never shows
  // the posters at the stylesheet's default size first
  useLayoutEffect(() => {
    const el = scene.current
    if (!el) return
    const f = mountFan(el, { onCentre: setCentre, start: startRef.current })
    fan.current = f
    return () => {
      f.destroy()
      fan.current = null
    }
  }, [posters.length])

  return (
    <div ref={scene} className={'af-escena' + (className ? ' ' + className : '')}>
      <div className="af-abanico" role="group" aria-label={label}>
        {posters.map((p) => (
          <article key={p.key} className={'af-cartel af-' + p.variant} aria-labelledby={'af-' + p.key}>
            {p.variant === 'crema' && <i className="af-sol" aria-hidden />}
            {p.variant === 'negro' && (
              <div className="af-arcos" aria-hidden>
                <i />
                <i />
                <i />
              </div>
            )}
            {p.variant === 'ambar' && (
              <div className="af-medios" aria-hidden>
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            )}
            {/* the actions name the role on screen; the heading names the poster for screen readers */}
            <h2 className="sr-only" id={'af-' + p.key}>
              {p.title}
            </h2>
            <p className="af-palabra" aria-hidden>
              {[...p.word].map((ch, k) => (
                <span key={k} style={{ '--i': k } as React.CSSProperties}>
                  {ch}
                </span>
              ))}
            </p>
            {p.art && <div className="af-stiker">{p.art}</div>}
            <div className="af-pie">
              {p.actions.map((a, i) => (
                <button key={i} type="button" className={i === 0 ? 'af-cta' : 'af-cta af-cta-2'} onClick={a.onClick}>
                  {a.label}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
      <div className="af-flechas">
        <button className="af-flecha" type="button" aria-label="Poster sebelumnya" onClick={() => fan.current?.move(-1)}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        {/* the role in front, named between the arrows; it fades over when the front poster changes */}
        <p key={centre} className="af-rol" aria-live="polite">
          {posters[centre]?.title}
        </p>
        <button className="af-flecha" type="button" aria-label="Poster berikutnya" onClick={() => fan.current?.move(1)}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
