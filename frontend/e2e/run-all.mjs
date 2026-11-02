// Runs every end-to-end suite against a running app (default http://localhost:5173).
//   npm run dev            # in another terminal (or BASE=https://your-deploy npm run e2e)
//   npm run e2e
// Backend mode: API_URL=http://localhost:8787/api BASE=http://localhost:5174 npm run e2e
//   (the app must be built/served with VITE_API_URL=API_URL; the data is reset before every suite)
import { spawnSync } from 'node:child_process'

const suites = [
  ['visitor', ['e2e/visitor.mjs', 'all']],
  ['admin (desktop)', ['e2e/admin.mjs', 'desktop']],
  ['admin (mobile)', ['e2e/admin.mjs', 'mobile']],
  ['wizard (desktop)', ['e2e/wizard.mjs', 'desktop']],
  ['wizard (mobile)', ['e2e/wizard.mjs', 'mobile']],
  ['staff', ['e2e/staff.mjs']],
  ['staff & admin P1', ['e2e/staff-admin-p1.mjs']],
  ...(process.env.API_URL ? [['offline scan (live)', ['e2e/offline.mjs']]] : []),
]
const results = []
for (const [name, args] of suites) {
  if (process.env.API_URL) {
    const r = await fetch(process.env.API_URL.replace(/\/$/, '') + '/demo/reset', { method: 'POST' })
    if (!r.ok) throw new Error(`reset failed: HTTP ${r.status}`)
  }
  const t0 = Date.now()
  const r = spawnSync(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: process.env })
  const out = (r.stdout || '') + (r.stderr || '')
  const ok = r.status === 0 && !/ERRORS:|Error:|TimeoutError/.test(out)
  results.push({ name, ok, secs: ((Date.now() - t0) / 1000).toFixed(1) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${results.at(-1).secs} s)`)
  if (!ok) console.log(out.split('\n').slice(-25).join('\n'))
}
const failed = results.filter((r) => !r.ok)
console.log(failed.length ? `\n${failed.length} suite(s) failed` : `\nAll ${results.length} suites passed. Screenshots: ${process.env.E2E_OUT || 'e2e/out'}/`)
process.exitCode = failed.length ? 1 : 0
