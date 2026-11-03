import type { PosterTheme } from '@/domain/types'
import { POSTER_THEMES } from './posterThemes'
import { cn } from '@/lib/utils'

/**
 * Generated event posters (no external images needed). Each theme is a flat, brand-coloured composition with the
 * ticket-notch motif. `bare` draws the artwork alone, for cards that set the title and label themselves.
 */
export function Poster({ theme, title, className, compact = false, bare = false }: { theme: PosterTheme; title: string; className?: string; compact?: boolean; bare?: boolean }) {
  const t = POSTER_THEMES[theme]
  return (
    <div
      className={cn('relative isolate overflow-hidden', className)}
      style={{ background: t.bg, color: t.fg }}
      {...(bare ? { 'aria-hidden': true } : { role: 'img', 'aria-label': `Poster ${title}` })}
    >
      <svg className="absolute inset-0 -z-10 size-full" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" aria-hidden>
        {theme === 'stage' && (
          <>
            <path d="M0 0h400v36c-40 22-80 22-120 0-40 22-80 22-120 0-40 22-80 22-120 0-20 11-30 11-40 6Z" fill={t.accent} opacity=".9" />
            <path d="M0 0h70c-8 90-30 170-70 240Z M400 0h-70c8 90 30 170 70 240Z" fill="#004a1c" />
            <ellipse cx="200" cy="250" rx="170" ry="40" fill={t.accent} opacity=".25" />
            {Array.from({ length: 7 }, (_, i) => (
              <circle key={i} cx={90 + i * 37} cy={215} r="9" fill="#ffffff" opacity=".18" />
            ))}
          </>
        )}
        {theme === 'acoustic' && (
          <>
            <circle cx="320" cy="70" r="110" fill={t.accent} opacity=".2" />
            <circle cx="320" cy="70" r="70" fill={t.accent} opacity=".35" />
            {Array.from({ length: 6 }, (_, i) => (
              <path key={i} d={`M0 ${150 + i * 14} C100 ${120 + i * 14} 200 ${190 + i * 14} 400 ${140 + i * 14}`} stroke="#ffffff" strokeOpacity=".15" strokeWidth="2" fill="none" />
            ))}
          </>
        )}
        {theme === 'craft' && (
          <>
            <rect x="260" y="-30" width="180" height="180" rx="24" transform="rotate(18 350 60)" fill={t.accent} opacity=".85" />
            <circle cx="60" cy="210" r="70" fill="#ffffff" opacity=".18" />
            <path d="M190 40l18 36 40 6-29 28 7 40-36-19-36 19 7-40-29-28 40-6Z" fill="#ffffff" opacity=".25" />
          </>
        )}
        {theme === 'expo' && (
          <>
            {Array.from({ length: 5 }, (_, i) => (
              <rect key={i} x={230 + i * 34} y={40 + (i % 2) * 30} width="26" height="140" rx="13" fill={i % 2 ? t.accent : '#006426'} opacity=".8" />
            ))}
          </>
        )}
      </svg>
      {!bare && (
        <div className={cn('flex h-full flex-col justify-end', compact ? 'p-3' : 'p-5')}>
          <span className="mb-1 inline-flex w-fit rounded-full px-2 py-0.5 text-[0.65rem] font-bold tracking-wide uppercase" style={{ background: t.accent, color: '#231f20' }}>
            {t.label}
          </span>
          <span className={cn('font-extrabold leading-tight text-balance', compact ? 'text-sm' : 'text-xl')}>{title}</span>
        </div>
      )}
    </div>
  )
}
