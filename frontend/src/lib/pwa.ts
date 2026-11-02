/**
 * PV-15: install prompt + device notifications.
 * `beforeinstallprompt` fires once, early, so it is captured here at start-up (imported by main.tsx).
 * Notifications are a Web Push simulation: they come from this page while it is open; real push
 * needs a push server on the backend.
 */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallEvent | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function canPromptInstall(): boolean {
  return !!deferred
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function isIos(): boolean {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const e = deferred
  deferred = null
  await e.prompt()
  const choice = await e.userChoice
  emit()
  return choice.outcome === 'accepted'
}

/* ---------- device notifications (simulated Web Push) ---------- */

const PREF_KEY = 'summarevent:notify'
const SEEN_KEY = 'summarevent:notify-seen'

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationsEnabled(): boolean {
  try {
    return notificationsSupported() && Notification.permission === 'granted' && localStorage.getItem(PREF_KEY) === 'on'
  } catch {
    return false
  }
}

export async function enableNotifications(): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported'
  const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  try {
    localStorage.setItem(PREF_KEY, result === 'granted' ? 'on' : 'off')
  } catch {
    /* storage blocked */
  }
  return result
}

export function disableNotifications() {
  try {
    localStorage.setItem(PREF_KEY, 'off')
  } catch {
    /* storage blocked */
  }
}

/** Message ids already shown for this account; null when this account was never seen on this device. */
export function seenNotificationIds(userId: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(`${SEEN_KEY}:${userId}`)
    return raw == null ? null : new Set(JSON.parse(raw) as string[])
  } catch {
    return null
  }
}

export function markNotificationsSeen(userId: string, ids: string[]) {
  try {
    localStorage.setItem(`${SEEN_KEY}:${userId}`, JSON.stringify(ids.slice(-200)))
  } catch {
    /* storage blocked */
  }
}

export async function showDeviceNotification(title: string, body: string, tag: string) {
  const options: NotificationOptions = { body, tag, icon: '/icon-192.png', badge: '/icon-192.png' }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) return void (await reg.showNotification(title, options))
  } catch {
    /* fall back below */
  }
  new Notification(title, options)
}
