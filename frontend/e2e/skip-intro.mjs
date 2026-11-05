/**
 * The splash plays once per session for the web and for each role, and every role has a first-run onboarding. Suites
 * and screenshot scripts about something else start past them; e2e/onboarding.mjs tests them on purpose.
 */
export const skipIntro = (ctx) =>
  ctx.addInitScript(() => {
    for (const scope of ['', ':app', ':admin', ':staff']) sessionStorage.setItem(`summarevent:splash${scope}`, '1')
    for (const role of ['', ':admin', ':staff']) localStorage.setItem(`summarevent:onboarding${role}`, 'done')
  })

/**
 * Panitia and petugas sign in before their pages open: through the sign-in screen with its demo account, so the same
 * step works against the mock and against a backend.
 */
export async function signIn(page, role, base = process.env.BASE || 'http://localhost:5173') {
  const area = role === 'ADMIN' ? 'admin' : 'staff'
  await page.goto(`${base}/${area}/masuk`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Isi otomatis' }).click()
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await page.waitForURL((url) => url.pathname.startsWith(`/${area}`) && !url.pathname.endsWith('/masuk'))
}

/**
 * The role picker is a fan of posters: only the one in the centre is fully in front, so a suite brings the poster it
 * wants to the centre (by the legend's title) before pressing the action printed on it.
 */
export async function toPoster(page, title) {
  const legend = page.locator('.af-datos b')
  for (let i = 0; i < 6; i++) {
    if ((await legend.innerText()).trim().toLowerCase() === title.toLowerCase()) break
    await page.getByRole('button', { name: 'Poster berikutnya' }).click()
    await page.waitForTimeout(350)
  }
  // the springs settle before the poster is pressed
  await page.waitForTimeout(900)
}
