/**
 * Seed data – realistic but entirely fictional (brief: sample data only).
 * Main scenario (PRD §6): Pentas Musikal Keluarga "Sangkuriang", Atrium Ciunik, Sabtu 21 Nov 2026.
 * Venue names come from the team's PRD; capacities, tenants, people and receipts are made up.
 */
import { dummyReceiptSvg, randomReceiptNo } from '@/domain/dummyReceipt'
import { makeQrToken, sha256Hex } from '@/domain/qr'
import { buildSeats, randomCode, resolveSession, rowIndex, seatLabel, uid } from '@/domain/rules'
import { DEMO_PASSWORD, DEMO_SIGN_IN } from '@/lib/demoAccounts'
import { wibDate, wibTime } from '@/lib/format'
import type {
  AppNotification,
  EventItem,
  EventRules,
  Order,
  PaymentMethod,
  Receipt,
  ReceiptRules,
  Seat,
  SeatAssignment,
  SeatLayout,
  Session,
  Tenant,
  Ticket,
  TicketCategory,
  User,
} from '@/domain/types'
import type { Db } from './db'

/** WIB wall-clock → ISO (UTC). */
function wib(date: string, time: string): string {
  return new Date(`${date}T${time}:00+07:00`).toISOString()
}

const DEFAULT_RULES: EventRules = {
  maxSeatsPerOrder: 4,
  paymentHoldMin: 10,
  receiptHoldMin: 30,
  checkinOpenMin: 30,
  checkinCloseMin: 0,
  transferable: false,
  reentryAllowed: false,
}

function defaultReceiptRules(excludedTenantIds: string[]): ReceiptRules {
  return {
    minSpend: 300_000,
    allowMultiple: false,
    maxReceiptsCombined: 3,
    maxReceiptsPerTenantDay: 5,
    sameDayRequired: true,
    cutoffTime: '22:00',
    excludedTenantIds,
  }
}

const TENANTS: Tenant[] = [
  { id: 't_mainan', name: 'Toko Mainan Ceria', category: 'Mainan' },
  { id: 't_kopi', name: 'Kopi Gedebage', category: 'F&B' },
  { id: 't_batik', name: 'Batik Parahyangan', category: 'Fashion' },
  { id: 't_sepatu', name: 'Sepatu Langkah', category: 'Fashion' },
  { id: 't_segar', name: 'Segar Supermarket', category: 'Supermarket' },
  { id: 't_pustaka', name: 'Pustaka Ilmu', category: 'Buku' },
  { id: 't_optik', name: 'Optik Terang', category: 'Kesehatan' },
  { id: 't_rasa', name: 'Rasa Nusantara', category: 'F&B' },
  { id: 't_gawai', name: 'Gawai Pintar', category: 'Elektronik' },
  { id: 't_bazaar', name: 'Bazaar Atrium', category: 'Bazaar' },
]

export const DEMO_ADMIN_ID = 'u_admin'
export const DEMO_STAFF_ID = 'u_staff'
export const PERSONA_ID = 'u_rina'

interface Ctx {
  db: Db
  now: Date
}

function iso(d: Date) {
  return d.toISOString()
}

function minutesAgo(now: Date, m: number) {
  return new Date(now.getTime() - m * 60_000)
}

function assignRows(layoutSeats: Seat[], ranges: Array<{ categoryId: string; from: string; to: string }>): Record<string, SeatAssignment> {
  const out: Record<string, SeatAssignment> = {}
  for (const s of layoutSeats) {
    const r = rowIndex(s.row)
    const range = ranges.find((x) => r >= rowIndex(x.from) && r <= rowIndex(x.to))
    out[s.id] = { categoryId: range?.categoryId ?? null, blocked: false }
  }
  return out
}

function addSessionInventory(ctx: Ctx, event: EventItem, session: Session, seats: Seat[], categories: TicketCategory[]) {
  for (const s of seats) {
    const a = event.seatAssignments[s.id]
    ctx.db.sessionSeats.push({
      sessionId: session.id,
      seatId: s.id,
      categoryId: a?.categoryId ?? null,
      status: a?.blocked || !a?.categoryId ? 'BLOCKED' : 'AVAILABLE',
      orderId: null,
      holdExpiresAt: null,
    })
  }
  for (const c of categories) {
    if (c.quota != null) ctx.db.quotas.push({ sessionId: session.id, categoryId: c.id, quota: c.quota, filled: 0 })
  }
}

interface OrderSpec {
  user: User
  event: EventItem
  session: Session
  category: TicketCategory
  seatLabels?: string[]
  qty?: number
  status: Order['status']
  method?: PaymentMethod
  createdMinAgo: number
  receipts?: Array<{ tenantId: string; amount: number; status?: Receipt['status'] }>
  usedCount?: number
  holdMin?: number
  simulated?: boolean
}

async function addOrder(ctx: Ctx, spec: OrderSpec): Promise<Order> {
  const { db, now } = ctx
  const createdAt = minutesAgo(now, spec.createdMinAgo)
  const seats = spec.seatLabels
    ? spec.seatLabels.map((l) => {
        const seat = db.seats.find((s) => s.layoutId === spec.event.layoutId && seatLabel(s) === l)
        if (!seat) throw new Error(`seed: seat ${l} not found`)
        return seat
      })
    : []
  const qty = seats.length || spec.qty || 1
  const orderId = uid('ord')
  const method: PaymentMethod | null =
    spec.method ?? (spec.category.accessMethod === 'RECEIPT' ? 'RECEIPT' : spec.category.accessMethod === 'FREE' ? 'FREE' : null)
  const holdMin = spec.holdMin ?? (spec.category.accessMethod === 'RECEIPT' ? spec.event.rules.receiptHoldMin : spec.event.rules.paymentHoldMin)
  const holdExpiresAt =
    spec.status === 'AWAITING_PAYMENT' || spec.status === 'AWAITING_VERIFICATION'
      ? new Date(now.getTime() + holdMin * 60_000)
      : new Date(createdAt.getTime() + holdMin * 60_000)

  const order: Order = {
    id: orderId,
    code: randomCode('SEV'),
    userId: spec.user.id,
    eventId: spec.event.id,
    sessionId: spec.session.id,
    categoryId: spec.category.id,
    qty,
    status: spec.status,
    totalAmount: spec.category.price * qty,
    paymentMethod: method,
    holdExpiresAt: iso(holdExpiresAt),
    createdAt: iso(createdAt),
    confirmedAt: spec.status === 'CONFIRMED' ? iso(new Date(createdAt.getTime() + 3 * 60_000)) : null,
    items: (seats.length ? seats : Array.from({ length: qty }, () => null)).map((seat, i) => ({
      id: uid('itm'),
      seatId: seat?.id ?? null,
      seatLabel: seat ? seatLabel(seat) : null,
      price: spec.category.price,
      attendeeName: i === 0 ? spec.user.name : null,
    })),
    buyerName: spec.user.name,
    buyerPhone: spec.user.phone,
    simulated: spec.simulated,
  }
  db.orders.push(order)

  // inventory
  for (const seat of seats) {
    const ss = db.sessionSeats.find((x) => x.sessionId === spec.session.id && x.seatId === seat.id)
    if (!ss) continue
    if (spec.status === 'CONFIRMED') Object.assign(ss, { status: 'SOLD', orderId, holdExpiresAt: null })
    else if (spec.status === 'AWAITING_PAYMENT' || spec.status === 'AWAITING_VERIFICATION')
      Object.assign(ss, { status: 'HELD', orderId, holdExpiresAt: order.holdExpiresAt })
  }

  // payment
  if (spec.status === 'CONFIRMED' && (method === 'SIM_QRIS' || method === 'SIM_VA')) {
    db.payments.push({
      id: uid('pay'),
      orderId,
      method,
      amount: order.totalAmount,
      status: 'SUCCESS',
      idempotencyKey: crypto.randomUUID(),
      simRef: randomCode('SIM', 8),
      paidAt: order.confirmedAt,
      createdAt: order.confirmedAt!,
    })
  }

  // receipts
  for (const r of spec.receipts ?? []) {
    const tenant = db.tenants.find((t) => t.id === r.tenantId)!
    const receiptNo = randomReceiptNo()
    // shopped ~25 min before ordering, but always a receipt the rules accept (same day, before the cutoff)
    const shopped = minutesAgo(createdAt, 25)
    const date = wibDate(createdAt)
    let time = wibDate(shopped) === date ? wibTime(shopped) : '00:05'
    const cutoff = spec.category.receiptRules?.cutoffTime
    if (cutoff && time > cutoff) {
      const [h, m] = cutoff.split(':').map(Number)
      time = `${String(Math.max(0, h - 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
    const photoUrl = dummyReceiptSvg({ tenantName: tenant.name, receiptNo, amount: r.amount, date, time }, tenant.category)
    const status = r.status ?? (spec.status === 'CONFIRMED' ? 'APPROVED' : 'PENDING')
    db.receipts.push({
      id: uid('rcp'),
      userId: spec.user.id,
      orderId,
      tenantId: tenant.id,
      receiptNo,
      amount: r.amount,
      receiptDate: date,
      receiptTime: time,
      photoUrl,
      photoHash: await sha256Hex(photoUrl),
      status,
      reason: null,
      reviewedBy: status === 'APPROVED' ? DEMO_ADMIN_ID : null,
      reviewedAt: status === 'APPROVED' ? order.confirmedAt : null,
      possibleDuplicate: false,
      createdAt: iso(createdAt),
    })
  }

  // tickets
  if (spec.status === 'CONFIRMED') {
    let used = spec.usedCount ?? 0
    const resolved = resolveSession(spec.session, now)
    for (const [i, item] of order.items.entries()) {
      const ticketId = uid('tkt')
      const isUsed = used > 0
      used -= 1
      // scanned a few minutes apart, in the session's first minutes and never later than a few minutes ago
      const usedAt = isUsed ? iso(new Date(Math.min(now.getTime() - 4 * 60_000, new Date(resolved.startAt).getTime() + (5 + i * 7) * 60_000))) : null
      const ticket: Ticket = {
        id: ticketId,
        code: randomCode('TKT'),
        orderId,
        orderItemId: item.id,
        userId: spec.user.id,
        eventId: spec.event.id,
        sessionId: spec.session.id,
        categoryId: spec.category.id,
        seatId: item.seatId,
        seatLabel: item.seatLabel,
        attendeeName: item.attendeeName,
        status: isUsed ? 'USED' : 'ACTIVE',
        qrVersion: 1,
        qrToken: await makeQrToken(ticketId, 1),
        createdAt: order.confirmedAt!,
        usedAt,
      }
      db.tickets.push(ticket)
      if (isUsed) {
        db.checkins.push({ id: uid('chk'), ticketId, sessionId: spec.session.id, staffId: DEMO_STAFF_ID, scannedAt: usedAt!, result: 'VALID' })
      }
    }
  }
  return order
}

function note(db: Db, n: Omit<AppNotification, 'id'>) {
  db.notifications.push({ id: uid('ntf'), ...n })
}

export async function buildSeed(now: Date = new Date()): Promise<Db> {
  const db: Db = {
    schema: 4,
    version: 1,
    seededAt: now.toISOString(),
    users: [],
    venues: [
      { id: 'v_ciunik', name: 'Atrium Ciunik', capacity: 200 },
      { id: 'v_sawarga', name: 'Sawarga Courtyard', capacity: 96 },
      { id: 'v_cileutik', name: 'Atrium Cileutik', capacity: 60 },
      { id: 'v_cibadak', name: 'Atrium Cibadak', capacity: 300 },
    ],
    tenants: TENANTS,
    layouts: [],
    seats: [],
    events: [],
    categories: [],
    sessions: [],
    sessionSeats: [],
    quotas: [],
    orders: [],
    payments: [],
    receipts: [],
    tickets: [],
    checkins: [],
    notifications: [],
    otps: [],
    waitlist: [],
    passwords: [],
    resetTokens: [],
  }
  const ctx: Ctx = { db, now }
  // the events went on sale a month ago, so the dashboard's daily charts have a month of orders to show
  const created = minutesAgo(now, 60 * 24 * 31).toISOString()
  const saleStart = minutesAgo(now, 60 * 24 * 30).toISOString()

  // panitia and petugas sign in with email + kata sandi (simulated, see lib/demoAccounts.ts)
  const emailOf = (id: string) => [...DEMO_SIGN_IN.ADMIN, ...DEMO_SIGN_IN.STAFF].find((a) => a.userId === id)?.email ?? null
  const person = (id: string, name: string, phone: string, role: User['role'] = 'VISITOR'): User => {
    const u: User = { id, role, name, phone, email: emailOf(id), createdAt: created }
    db.users.push(u)
    return u
  }
  person(DEMO_ADMIN_ID, 'Tim Event SUMMABA (demo)', '081100000001', 'ADMIN')
  person(DEMO_STAFF_ID, 'Petugas Desk Atrium (demo)', '081100000002', 'STAFF')
  person('u_staff_utara', 'Petugas Pintu Utara (demo)', '081100000003', 'STAFF')
  person('u_staff_cibadak', 'Petugas Atrium Cibadak (demo)', '081100000004', 'STAFF')
  // panitia and petugas sign in with email + kata sandi; the demo password is kept as its hash, as a server would
  const demoHash = await sha256Hex(`pw:${DEMO_PASSWORD}`)
  for (const u of db.users) if (u.role !== 'VISITOR') db.passwords.push({ userId: u.id, hash: demoHash, fails: [] })
  const rina = person(PERSONA_ID, 'Rina Kartika', '081234567890')
  const [dodi, sari, asep, nia, yudi, euis, galih, lestari, bayu, intan, rudi] = [
    ['u_dodi', 'Dodi Pratama'],
    ['u_sari', 'Sari Wulandari'],
    ['u_asep', 'Asep Hidayat'],
    ['u_nia', 'Nia Ramdhani'],
    ['u_yudi', 'Yudi Setiawan'],
    ['u_euis', 'Euis Sumarni'],
    ['u_galih', 'Galih Permana'],
    ['u_lestari', 'Lestari Ayu'],
    ['u_bayu', 'Bayu Saputra'],
    ['u_intan', 'Intan Maharani'],
    ['u_rudi', 'Rudi Hartono'],
  ].map(([id, name], i) => person(id, name, `08120000${String(11 + i).padStart(4, '0')}`))
  const otherBuyer = person('u_sim', 'Pembeli lain (simulasi)', '080000000000')

  const excluded = ['t_bazaar']

  /* ---------- Event 1: Sangkuriang ---------- */
  const l1: SeatLayout = { id: 'lay_ciunik', venueId: 'v_ciunik', name: 'Teater Atrium Ciunik 10×14', rows: 10, seatsPerRow: 14, aisleAfter: 7 }
  const seats1 = buildSeats(l1, ['J1', 'J14'])
  db.layouts.push(l1)
  db.seats.push(...seats1)
  const e1: EventItem = {
    id: 'evt_sangkuriang',
    slug: 'pentas-musikal-sangkuriang',
    title: 'Pentas Musikal Keluarga "Sangkuriang"',
    subtitle: 'Legenda Sunda dari Bandung, dibawakan ulang untuk keluarga',
    description:
      'Pertunjukan musikal 60 menit tentang Sangkuriang dan Dayang Sumbi, lengkap dengan lagu, tari, dan boneka raksasa. Cocok untuk anak 4 tahun ke atas. Pilih kursi langsung dari denah: bayar untuk VIP dan Reguler, tukar struk belanja untuk kategori Tukar Struk, atau daftar gratis di area Festival.',
    posterTheme: 'stage',
    venueId: 'v_ciunik',
    layoutId: l1.id,
    seatingMode: 'RESERVED',
    status: 'PUBLISHED',
    startAt: wib('2026-11-21', '13:00'),
    endAt: wib('2026-11-21', '17:00'),
    rules: { ...DEFAULT_RULES },
    seatAssignments: {},
    createdBy: DEMO_ADMIN_ID,
    createdAt: created,
  }
  const cat = (id: string, event: EventItem, partial: Partial<TicketCategory> & Pick<TicketCategory, 'name' | 'color' | 'accessMethod' | 'price'>): TicketCategory => {
    const c: TicketCategory = {
      id,
      eventId: event.id,
      quota: null,
      saleStart,
      saleCloseMinBeforeSession: 60,
      ...partial,
    }
    db.categories.push(c)
    return c
  }
  const vip = cat('cat_vip', e1, {
    name: 'VIP',
    color: '#8b2c6a',
    accessMethod: 'PAID',
    price: 150_000,
    description: 'Baris A–B, paling dekat panggung',
    bonusFirstN: 20,
    bonusDesc: 'Foto bareng pemeran Sangkuriang',
  })
  const struk = cat('cat_struk', e1, {
    name: 'Tukar Struk',
    color: '#f26f22',
    accessMethod: 'RECEIPT',
    price: 0,
    description: 'Baris C–F. Gratis dengan belanja min Rp300.000 di tenant SUMMABA',
    receiptRules: defaultReceiptRules(excluded),
  })
  const reg = cat('cat_reg', e1, { name: 'Reguler', color: '#0e7c7b', accessMethod: 'PAID', price: 50_000, description: 'Baris G–J' })
  const fest = cat('cat_fest', e1, { name: 'Festival', color: '#57534e', accessMethod: 'FREE', price: 0, quota: 60, description: 'Area berdiri di belakang, tanpa nomor kursi' })
  e1.seatAssignments = assignRows(seats1, [
    { categoryId: vip.id, from: 'A', to: 'B' },
    { categoryId: struk.id, from: 'C', to: 'F' },
    { categoryId: reg.id, from: 'G', to: 'J' },
  ])
  db.events.push(e1)
  const s1: Session = { id: 'ses_sk_13', eventId: e1.id, label: 'Sesi 1', startAt: wib('2026-11-21', '13:00'), endAt: wib('2026-11-21', '14:00') }
  const s2: Session = { id: 'ses_sk_16', eventId: e1.id, label: 'Sesi 2', startAt: wib('2026-11-21', '16:00'), endAt: wib('2026-11-21', '17:00') }
  const s3: Session = { id: 'ses_sk_demo', eventId: e1.id, label: 'Sesi Demo Juri', startAt: e1.startAt, endAt: e1.endAt, demoLive: true }
  db.sessions.push(s1, s2, s3)
  for (const s of [s1, s2, s3]) addSessionInventory(ctx, e1, s, seats1, [vip, struk, reg, fest])

  /* ---------- Event 2: Konser Akustik Sawarga ---------- */
  const l2: SeatLayout = { id: 'lay_sawarga', venueId: 'v_sawarga', name: 'Courtyard 8×12', rows: 8, seatsPerRow: 12, aisleAfter: 6 }
  const seats2 = buildSeats(l2, ['H1', 'H12'])
  db.layouts.push(l2)
  db.seats.push(...seats2)
  const e2: EventItem = {
    id: 'evt_akustik',
    slug: 'konser-akustik-sawarga',
    title: 'Konser Akustik Sawarga',
    subtitle: 'Malam akustik di bawah langit Courtyard',
    description: 'Dua jam musik akustik dari musisi Bandung. Semua kursi bernomor. Kategori Gold paling dekat panggung.',
    posterTheme: 'acoustic',
    posterPalette: { bg: '#1c2f5e', accent: '#f9a61b' },
    venueId: 'v_sawarga',
    layoutId: l2.id,
    seatingMode: 'RESERVED',
    status: 'PUBLISHED',
    startAt: wib('2026-11-28', '19:00'),
    endAt: wib('2026-11-28', '21:00'),
    rules: { ...DEFAULT_RULES },
    seatAssignments: {},
    createdBy: DEMO_ADMIN_ID,
    createdAt: created,
  }
  const gold = cat('cat_gold', e2, { name: 'Gold', color: '#8a5a2b', accessMethod: 'PAID', price: 200_000, description: 'Baris A–D' })
  const silver = cat('cat_silver', e2, { name: 'Silver', color: '#2d4c8f', accessMethod: 'PAID', price: 100_000, description: 'Baris E–H' })
  e2.seatAssignments = assignRows(seats2, [
    { categoryId: gold.id, from: 'A', to: 'D' },
    { categoryId: silver.id, from: 'E', to: 'H' },
  ])
  db.events.push(e2)
  const s4: Session = { id: 'ses_ak_19', eventId: e2.id, label: 'Malam', startAt: e2.startAt, endAt: e2.endAt }
  db.sessions.push(s4)
  addSessionInventory(ctx, e2, s4, seats2, [gold, silver])

  /* ---------- Event 3: Kids Holiday Craft Class (no seat numbers) ---------- */
  const e3: EventItem = {
    id: 'evt_craft',
    slug: 'kids-holiday-craft-class',
    title: 'Kids Holiday Craft Class',
    subtitle: 'Kelas prakarya liburan untuk anak',
    description: 'Kelas membuat wayang kertas selama 90 menit, bahan disediakan. Tanpa nomor kursi: cukup pilih sesi dan jumlah peserta. Tukar struk belanja min Rp300.000 di tenant SUMMABA.',
    posterTheme: 'craft',
    venueId: 'v_cileutik',
    layoutId: null,
    seatingMode: 'GENERAL',
    status: 'PUBLISHED',
    startAt: wib('2026-11-22', '13:00'),
    endAt: wib('2026-11-22', '18:30'),
    rules: { ...DEFAULT_RULES },
    seatAssignments: {},
    createdBy: DEMO_ADMIN_ID,
    createdAt: created,
  }
  const peserta = cat('cat_kelas', e3, {
    name: 'Peserta Kelas',
    color: '#f26f22',
    accessMethod: 'RECEIPT',
    price: 0,
    quota: 12,
    description: '12 anak per sesi, maks 4 per pesanan',
    receiptRules: defaultReceiptRules(excluded),
  })
  db.events.push(e3)
  const craftSessions = [
    ['13:00', '14:30'],
    ['15:00', '16:30'],
    ['17:00', '18:30'],
  ].map(([a, b], i): Session => ({ id: `ses_cr_${i + 1}`, eventId: e3.id, label: `Sesi ${i + 1}`, startAt: wib('2026-11-22', a), endAt: wib('2026-11-22', b) }))
  db.sessions.push(...craftSessions)
  for (const s of craftSessions) addSessionInventory(ctx, e3, s, [], [peserta])

  /* ---------- Event 4: free open expo (info only) ---------- */
  db.events.push({
    id: 'evt_pameran',
    slug: 'pameran-kriya-bandung',
    title: 'Pameran Kriya Bandung',
    subtitle: 'Masuk bebas, tanpa tiket',
    description: 'Pameran kerajinan tangan dari perajin Bandung Raya. Datang kapan saja selama jam buka mal, tidak perlu daftar.',
    posterTheme: 'expo',
    venueId: 'v_cibadak',
    layoutId: null,
    seatingMode: 'GENERAL',
    status: 'PUBLISHED',
    startAt: wib('2026-11-14', '10:00'),
    endAt: wib('2026-11-30', '22:00'),
    rules: { ...DEFAULT_RULES },
    seatAssignments: {},
    infoOnly: true,
    createdBy: DEMO_ADMIN_ID,
    createdAt: created,
  })

  /* ---------- Orders ---------- */
  const o = (spec: Omit<OrderSpec, 'event'> & { event?: EventItem }) => addOrder(ctx, { event: e1, ...spec } as OrderSpec)

  // Sesi 1 (13.00)
  await o({ user: dodi, session: s1, category: vip, seatLabels: ['A6', 'A7', 'A8', 'A9'], status: 'CONFIRMED', method: 'SIM_QRIS', createdMinAgo: 39180 })
  await o({ user: sari, session: s1, category: vip, seatLabels: ['B3', 'B4'], status: 'CONFIRMED', method: 'SIM_VA', createdMinAgo: 34680 })
  await o({ user: yudi, session: s1, category: vip, seatLabels: ['A1', 'A2'], status: 'CONFIRMED', method: 'SIM_QRIS', createdMinAgo: 30640 })
  await o({ user: asep, session: s1, category: struk, seatLabels: ['C7', 'C8', 'C9', 'C10'], status: 'CONFIRMED', createdMinAgo: 27420, receipts: [{ tenantId: 't_mainan', amount: 200_000 }, { tenantId: 't_kopi', amount: 150_000 }] })
  await o({ user: nia, session: s1, category: struk, seatLabels: ['D5', 'D6', 'D7'], status: 'CONFIRMED', createdMinAgo: 23540, receipts: [{ tenantId: 't_segar', amount: 320_000 }] })
  await o({ user: euis, session: s1, category: struk, seatLabels: ['E8', 'E9', 'E10', 'E11'], status: 'CONFIRMED', createdMinAgo: 20360, receipts: [{ tenantId: 't_batik', amount: 275_000 }, { tenantId: 't_rasa', amount: 98_000 }] })
  await o({ user: galih, session: s1, category: reg, seatLabels: ['G7', 'G8'], status: 'CONFIRMED', method: 'SIM_QRIS', createdMinAgo: 17920 })
  await o({ user: lestari, session: s1, category: reg, seatLabels: ['H1', 'H2', 'H3', 'H4'], status: 'CONFIRMED', method: 'SIM_VA', createdMinAgo: 13260 })
  await o({ user: bayu, session: s1, category: reg, seatLabels: ['G10', 'G11', 'G12'], status: 'CONFIRMED', method: 'SIM_QRIS', createdMinAgo: 9300 })
  await o({ user: intan, session: s1, category: reg, seatLabels: ['I5', 'I6'], status: 'CONFIRMED', method: 'SIM_QRIS', createdMinAgo: 7400 })
  await o({ user: rudi, session: s1, category: fest, qty: 3, status: 'CONFIRMED', method: 'FREE', createdMinAgo: 5860 })

  // Sesi 2 (16.00)
  await o({ user: intan, session: s2, category: vip, seatLabels: ['A7', 'A8'], status: 'CONFIRMED', method: 'SIM_QRIS', createdMinAgo: 4820 })
  const rinaReceipt = await o({ user: rina, session: s2, category: struk, seatLabels: ['C7', 'C8', 'C9', 'C10'], status: 'AWAITING_VERIFICATION', createdMinAgo: 6, receipts: [{ tenantId: 't_mainan', amount: 200_000 }, { tenantId: 't_kopi', amount: 150_000 }] })
  await o({ user: yudi, session: s2, category: struk, seatLabels: ['D3', 'D4'], status: 'AWAITING_VERIFICATION', createdMinAgo: 4, receipts: [{ tenantId: 't_batik', amount: 280_000 }] })
  await o({ user: sari, session: s2, category: reg, seatLabels: ['G5', 'G6'], status: 'CONFIRMED', method: 'SIM_VA', createdMinAgo: 3300 })
  await o({ user: dodi, session: s2, category: reg, seatLabels: ['H7', 'H8', 'H9', 'H10'], status: 'CONFIRMED', method: 'SIM_QRIS', createdMinAgo: 1820 })
  await o({ user: galih, session: s2, category: vip, seatLabels: ['B7', 'B8'], status: 'EXPIRED', createdMinAgo: 300 })
  await o({ user: euis, session: s2, category: reg, seatLabels: ['J5'], status: 'CANCELLED', createdMinAgo: 260 })
  await o({ user: otherBuyer, session: s2, category: reg, seatLabels: ['G9', 'G10'], status: 'AWAITING_PAYMENT', createdMinAgo: 2, holdMin: 7, simulated: true })
  // VA transfer waiting for a manual check, so judges can try "Tandai lunas" right away (longer hold keeps it alive during judging)
  await o({ user: bayu, session: s2, category: reg, seatLabels: ['I3', 'I4'], status: 'AWAITING_PAYMENT', method: 'SIM_VA', createdMinAgo: 3, holdMin: 120 })

  // Sesi Demo (always live) – tickets ready to scan
  const rinaDemo = await o({ user: rina, session: s3, category: reg, seatLabels: ['G5', 'G6'], status: 'CONFIRMED', method: 'SIM_QRIS', createdMinAgo: 90 })
  await o({ user: asep, session: s3, category: vip, seatLabels: ['A3', 'A4'], status: 'CONFIRMED', method: 'SIM_QRIS', createdMinAgo: 240, usedCount: 1 })
  await o({ user: nia, session: s3, category: struk, seatLabels: ['C1', 'C2', 'C3'], status: 'CONFIRMED', createdMinAgo: 200, receipts: [{ tenantId: 't_gawai', amount: 410_000 }], usedCount: 3 })
  await o({ user: bayu, session: s3, category: reg, seatLabels: ['H3', 'H4'], status: 'CONFIRMED', method: 'SIM_VA', createdMinAgo: 180 })
  await o({ user: lestari, session: s3, category: fest, qty: 2, status: 'CONFIRMED', method: 'FREE', createdMinAgo: 150, usedCount: 1 })
  await o({ user: otherBuyer, session: s3, category: vip, seatLabels: ['B5', 'B6'], status: 'AWAITING_PAYMENT', createdMinAgo: 1, holdMin: 8, simulated: true })

  // Konser akustik
  await o({ event: e2, user: dodi, session: s4, category: gold, seatLabels: ['A5', 'A6', 'A7', 'A8'], status: 'CONFIRMED', method: 'SIM_QRIS', createdMinAgo: 36900 })
  await o({ event: e2, user: sari, session: s4, category: silver, seatLabels: ['E3', 'E4'], status: 'CONFIRMED', method: 'SIM_VA', createdMinAgo: 16540 })
  await o({ event: e2, user: intan, session: s4, category: gold, seatLabels: ['B6'], status: 'CONFIRMED', method: 'SIM_QRIS', createdMinAgo: 8940 })

  // Craft class
  await o({ event: e3, user: asep, session: craftSessions[0], category: peserta, qty: 4, status: 'CONFIRMED', createdMinAgo: 1400, receipts: [{ tenantId: 't_pustaka', amount: 310_000 }] })
  // Sesi 1 sells out (12 of 12) so the waiting list can be demonstrated (PV-14)
  await o({ event: e3, user: galih, session: craftSessions[0], category: peserta, qty: 4, status: 'CONFIRMED', createdMinAgo: 1350, receipts: [{ tenantId: 't_mainan', amount: 330_000 }] })
  await o({ event: e3, user: lestari, session: craftSessions[0], category: peserta, qty: 4, status: 'CONFIRMED', createdMinAgo: 1250, receipts: [{ tenantId: 't_batik', amount: 360_000 }] })
  db.waitlist.push(
    { id: uid('wl'), userId: yudi.id, sessionId: craftSessions[0].id, categoryId: peserta.id, qty: 2, status: 'WAITING', createdAt: minutesAgo(now, 300).toISOString(), notifiedAt: null },
    { id: uid('wl'), userId: intan.id, sessionId: craftSessions[0].id, categoryId: peserta.id, qty: 1, status: 'WAITING', createdAt: minutesAgo(now, 120).toISOString(), notifiedAt: null },
  )
  await o({ event: e3, user: nia, session: craftSessions[1], category: peserta, qty: 2, status: 'CONFIRMED', createdMinAgo: 1200, receipts: [{ tenantId: 't_optik', amount: 450_000 }] })

  // AD-12: the first N tickets per session of a bonus category earned the bonus
  for (const c of db.categories.filter((x) => x.bonusFirstN && x.bonusDesc)) {
    for (const s of db.sessions.filter((x) => x.eventId === c.eventId)) {
      db.tickets
        .filter((t) => t.sessionId === s.id && t.categoryId === c.id && t.status !== 'CANCELLED')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, c.bonusFirstN!)
        .forEach((t) => (t.bonus = c.bonusDesc))
    }
  }

  // a few historical scan attempts for the demo session
  const firstUsed = db.tickets.find((t) => t.sessionId === s3.id && t.status === 'USED')
  if (firstUsed) {
    db.checkins.push({ id: uid('chk'), ticketId: firstUsed.id, sessionId: s3.id, staffId: DEMO_STAFF_ID, scannedAt: minutesAgo(now, 3).toISOString(), result: 'ALREADY_USED' })
  }
  db.checkins.push({ id: uid('chk'), ticketId: null, sessionId: s3.id, staffId: DEMO_STAFF_ID, scannedAt: minutesAgo(now, 2).toISOString(), result: 'INVALID' })

  // Rina's inbox
  const rinaSeats = rinaDemo.items.map((i) => i.seatLabel).join(', ')
  note(db, { userId: rina.id, channel: 'WA', kind: 'ORDER_CONFIRMED', orderId: rinaDemo.id, title: 'Pesanan terkonfirmasi', body: `Tiket ${e1.title} (${s3.label}) kursi ${rinaSeats} sudah aktif. Tunjukkan QR di Pass Saya saat masuk.`, createdAt: rinaDemo.confirmedAt!, scheduledFor: null })
  note(db, { userId: rina.id, channel: 'EMAIL', kind: 'ORDER_CONFIRMED', orderId: rinaDemo.id, title: `E-ticket ${rinaDemo.code}`, body: `Halo Rina, e-ticket untuk kursi ${rinaSeats} terlampir di Pass Saya. Sampai jumpa di SUMMABA!`, createdAt: rinaDemo.confirmedAt!, scheduledFor: null })
  note(db, { userId: rina.id, channel: 'WA', kind: 'RECEIPT_RESULT', orderId: rinaReceipt.id, title: 'Struk sedang diverifikasi', body: 'Struk kamu untuk kategori Tukar Struk (Sesi 2, kursi C7–C10) sedang dicek panitia. Kursi ditahan 30 menit.', createdAt: minutesAgo(now, 6).toISOString(), scheduledFor: null })

  return db
}
