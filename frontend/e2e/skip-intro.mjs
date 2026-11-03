/**
 * The splash and the first-run onboarding play once per visitor. Suites and screenshot scripts about something else
 * start past them; e2e/onboarding.mjs tests both on purpose.
 */
export const skipIntro = (ctx) =>
  ctx.addInitScript(() => {
    sessionStorage.setItem('summarevent:splash', '1')
    localStorage.setItem('summarevent:onboarding', 'done')
  })
