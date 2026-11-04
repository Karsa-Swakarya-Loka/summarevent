// Copies the frontend's pure domain code into convex/shared/, so the backend runs the exact same rules,
// labels and types as the mock (AGENTS.md: rules live in frontend/src/domain first, with unit tests).
//   node scripts/sync-domain.mjs          # copy
//   node scripts/sync-domain.mjs --check  # fail when convex/shared/ is behind the frontend (CI)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.resolve(root, '../frontend/src')
const out = path.join(root, 'convex/shared')

const FILES = {
  'domain/types.ts': 'types.ts',
  'domain/rules.ts': 'rules.ts',
  'domain/labels.ts': 'labels.ts',
  'domain/dummyReceipt.ts': 'dummyReceipt.ts',
  'lib/format.ts': 'format.ts',
  'lib/demoAccounts.ts': 'demoAccounts.ts',
  'api/contract.ts': 'contract.ts',
  // the sample data: the backend seeds exactly what the demo shows
  'api/mock/seed.ts': 'seed.ts',
}
const IMPORTS = {
  ...Object.fromEntries(Object.entries(FILES).map(([from, to]) => [`@/${from.replace(/\.ts$/, '')}`, `./${to.replace(/\.ts$/, '')}`])),
  // QR tokens and hashes are made with the server secret instead of the demo key
  '@/domain/qr': '../lib/crypto',
  // seed.ts only needs the Db type, cut out of mock/db.ts below
  './db': './db',
}

function render(rel) {
  let text = fs.readFileSync(path.join(src, rel), 'utf8')
  text = text.replace(/from '(@\/[^']+|\.\/db)'/g, (m, spec) => {
    if (!IMPORTS[spec]) throw new Error(`${rel}: import ${spec} is not synced; add it to FILES`)
    return `from '${IMPORTS[spec]}'`
  })
  return `// GENERATED from frontend/src/${rel} by scripts/sync-domain.mjs. Do not edit here; change the frontend file.\n${text}`
}

/** mock/db.ts holds the browser storage driver; the backend only needs its Db type. */
function renderDbTypes() {
  const text = fs.readFileSync(path.join(src, 'api/mock/db.ts'), 'utf8')
  const imports = text.match(/^import type \{[\s\S]*?\} from '@\/domain\/types'\n/m)
  const types = text.match(/^export interface OtpEntry \{[\s\S]*?^\}\n\n^export interface Db \{[\s\S]*?^\}\n/m)
  if (!imports || !types) throw new Error('mock/db.ts: could not find the Db type')
  return `// GENERATED from frontend/src/api/mock/db.ts (types only) by scripts/sync-domain.mjs. Do not edit here.\n${imports[0].replace("'@/domain/types'", "'./types'")}\n${types[0]}`
}

const check = process.argv.includes('--check')
fs.mkdirSync(out, { recursive: true })
let stale = []
const outputs = [...Object.entries(FILES).map(([rel, name]) => [name, render(rel)]), ['db.ts', renderDbTypes()]]
for (const [name, want] of outputs) {
  const file = path.join(out, name)
  const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
  if (have === want) continue
  if (check) stale.push(name)
  else fs.writeFileSync(file, want)
}
if (check && stale.length) {
  console.error(`convex/shared is out of date (${stale.join(', ')}). Run: npm run sync-domain`)
  process.exit(1)
}
console.log(check ? 'convex/shared is up to date' : `synced ${outputs.length} files into convex/shared`)
