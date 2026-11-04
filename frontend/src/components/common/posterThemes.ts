import { luminance, posterInk } from '@/domain/rules'
import type { PosterPalette, PosterTheme } from '@/domain/types'

export interface PosterColors {
  bg: string
  fg: string
  accent: string
  label: string
}

/** Colours and the category label of each generated poster. */
export const POSTER_THEMES: Record<PosterTheme, PosterColors> = {
  stage: { bg: '#006426', fg: '#ffffff', accent: '#f9a61b', label: 'Pertunjukan' },
  acoustic: { bg: '#231f20', fg: '#ffffff', accent: '#f26f22', label: 'Konser' },
  craft: { bg: '#f26f22', fg: '#231f20', accent: '#fedc01', label: 'Kelas' },
  expo: { bg: '#e6f2ea', fg: '#004a1c', accent: '#f26f22', label: 'Pameran' },
}

/** The poster's colours: the theme's, or the panitia's own over them, with the text colour that reads on that background. */
export function posterColors(theme: PosterTheme, palette?: PosterPalette | null): PosterColors {
  const t = POSTER_THEMES[theme]
  return palette ? { ...t, bg: palette.bg, accent: palette.accent, fg: posterInk(palette.bg) } : t
}

/** A darker (negative) or lighter step of a hex colour, for the artwork's second tone. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const step = (c: number) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => step(c).toString(16).padStart(2, '0')).join('')
}

/** The artwork's second tone: a darker step of a dark background, the text colour on a light one. */
export function posterTone(c: PosterColors): string {
  return luminance(c.bg) >= 0.21 ? c.fg : shade(c.bg, -0.28)
}

/** Swatches the wizard offers for a poster of the panitia's own colours: the brand's, and a few that pair with them. */
export const POSTER_SWATCHES: Array<{ hex: string; name: string }> = [
  { hex: '#006426', name: 'Hijau Summarecon' },
  { hex: '#231f20', name: 'Hitam tinta' },
  { hex: '#1c2f5e', name: 'Biru malam' },
  { hex: '#8b2c6a', name: 'Ungu beri' },
  { hex: '#0e7c7b', name: 'Toska' },
  { hex: '#f26f22', name: 'Oranye' },
  { hex: '#f9a61b', name: 'Amber' },
  { hex: '#fedc01', name: 'Kuning' },
  { hex: '#e6f2ea', name: 'Hijau pucat' },
  { hex: '#fbf3e4', name: 'Krem' },
]
