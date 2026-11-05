/** Drawn on a member's poster until their portrait arrives. */
export type TeamIcon = 'star' | 'heart' | 'moon' | 'smiley' | 'bolt'

export type TeamMember = {
  name: string
  role: string
  /** Poster ink. Never green: the poster sits on the green panel. */
  ink: string
  icon: TeamIcon
  /**
   * Cut-out portrait with a transparent background, in public/tim: head and shoulders, made with scripts/cutout.swift.
   * Without one the poster prints the icon.
   */
  photo?: string
}

export const TEAM: TeamMember[] = [
  {
    name: 'Haikal',
    role: 'frontend',
    ink: '#f26f22',
    icon: 'heart',
    photo: '/tim/haikal.webp',
  },
  {
    name: 'Bintang',
    role: 'backend',
    ink: '#fedc01',
    icon: 'star',
    photo: '/tim/bintang.webp',
  },
  {
    name: 'Shelvia',
    role: 'user testing & UX',
    ink: '#ff8fb3',
    icon: 'smiley',
    photo: '/tim/shelvia.webp',
  },
  {
    name: 'Awwal',
    role: 'product & pitch',
    ink: '#fbf3e4',
    icon: 'bolt',
    photo: '/tim/awwal.webp',
  },
  {
    name: 'Said',
    role: 'system QA',
    ink: '#8fd0f5',
    icon: 'moon',
    photo: '/tim/said.webp',
  },
]
