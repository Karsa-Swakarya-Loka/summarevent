/** First-run onboarding, one per role: shown once per device, replayable from the demo menu. */
export type IntroRole = 'visitor' | 'admin' | 'staff'

const KEY: Record<IntroRole, string> = {
  visitor: 'summarevent:onboarding',
  admin: 'summarevent:onboarding:admin',
  staff: 'summarevent:onboarding:staff',
}

export function onboardingDone(role: IntroRole = 'visitor'): boolean {
  try {
    return localStorage.getItem(KEY[role]) === 'done'
  } catch {
    return true // blocked storage: never trap anyone in a loop
  }
}

export function setOnboardingDone(done: boolean, role: IntroRole = 'visitor') {
  try {
    if (done) localStorage.setItem(KEY[role], 'done')
    else localStorage.removeItem(KEY[role])
  } catch {
    /* blocked storage: the onboarding simply shows again next time */
  }
}
