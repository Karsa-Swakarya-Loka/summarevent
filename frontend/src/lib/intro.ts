/** The visitor's first-run onboarding: shown once per device, replayable from the demo menu. */
const KEY = 'summarevent:onboarding'

export function onboardingDone(): boolean {
  try {
    return localStorage.getItem(KEY) === 'done'
  } catch {
    return true // blocked storage: never trap the visitor in a loop
  }
}

export function setOnboardingDone(done: boolean) {
  try {
    if (done) localStorage.setItem(KEY, 'done')
    else localStorage.removeItem(KEY)
  } catch {
    /* blocked storage: the onboarding simply shows again next time */
  }
}
