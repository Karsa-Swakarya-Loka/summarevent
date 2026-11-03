import type { PosterTheme } from '@/domain/types'

/** Colours and the category label of each generated poster. */
export const POSTER_THEMES: Record<PosterTheme, { bg: string; fg: string; accent: string; label: string }> = {
  stage: { bg: '#006426', fg: '#ffffff', accent: '#f9a61b', label: 'Pertunjukan' },
  acoustic: { bg: '#231f20', fg: '#ffffff', accent: '#f26f22', label: 'Konser' },
  craft: { bg: '#f26f22', fg: '#231f20', accent: '#fedc01', label: 'Kelas' },
  expo: { bg: '#e6f2ea', fg: '#004a1c', accent: '#f26f22', label: 'Pameran' },
}
