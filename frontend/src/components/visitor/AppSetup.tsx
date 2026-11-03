/** PV-15: install to the home screen + device notifications (simulated Web Push). */
import { useEffect, useState } from 'react'
import { BellRing, Check, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useLive } from '@/hooks/useLive'
import {
  canPromptInstall,
  disableNotifications,
  enableNotifications,
  isIos,
  isStandalone,
  markNotificationsSeen,
  notificationsEnabled,
  notificationsSupported,
  onInstallChange,
  promptInstall,
  seenNotificationIds,
  showDeviceNotification,
} from '@/lib/pwa'
import { useVisitor } from './hooks'

export function AppSetupCard() {
  const [, rerender] = useState(0)
  useEffect(() => onInstallChange(() => rerender((n) => n + 1)), [])
  const [notify, setNotify] = useState(() => notificationsEnabled())
  const installed = isStandalone()

  const install = async () => {
    const ok = await promptInstall()
    toast(ok ? 'Summarevent dipasang di layar utama.' : 'Pemasangan dibatalkan. Bisa dicoba lagi kapan saja.')
  }

  const toggleNotify = async (on: boolean) => {
    if (!on) {
      disableNotifications()
      setNotify(false)
      return
    }
    const r = await enableNotifications()
    setNotify(r === 'granted')
    if (r === 'granted') toast.success('Notifikasi aktif. Pesan baru (konfirmasi, hasil struk, daftar tunggu) muncul di HP.')
    else if (r === 'denied') toast.error('Izin notifikasi ditolak. Aktifkan lewat pengaturan situs di browser.')
    else if (r === 'unsupported') toast.error('Browser ini belum mendukung notifikasi.')
  }

  return (
    <section className="rounded-[1.4rem] bg-card p-4 shadow-xs" aria-label="Pasang di HP">
      <h2 className="flex items-center gap-2 font-bold">
        <Smartphone className="size-4" aria-hidden /> Pasang di HP
      </h2>
      {installed ? (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-[#0b6b35]">
          <Check className="size-4" aria-hidden /> Summarevent sudah terpasang di layar utama.
        </p>
      ) : canPromptInstall() ? (
        <>
          <Button className="mt-3 h-11 w-full" onClick={() => void install()}>
            Pasang di layar utama
          </Button>
        </>
      ) : isIos() ? (
        <p className="mt-1 text-sm text-muted-foreground">Safari: Bagikan, lalu Tambah ke Layar Utama.</p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Menu browser, lalu Pasang aplikasi.</p>
      )}
      {notificationsSupported() && (
        <label className="mt-4 flex items-start justify-between gap-3 border-t pt-3">
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <BellRing className="size-4" aria-hidden /> Notifikasi di HP
            </span>
            <span className="block text-xs text-muted-foreground">Selama app terbuka (simulasi)</span>
          </span>
          <Switch checked={notify} onCheckedChange={(v) => void toggleNotify(v)} aria-label="Notifikasi di HP" />
        </label>
      )}
    </section>
  )
}

/** Shows new inbox messages as device notifications (never replays old ones). Mounted once in the visitor layout. */
export function NotificationWatcher() {
  const { user } = useVisitor()
  const notes = useLive(() => (user ? api.myNotifications() : Promise.resolve([])), [user?.id])
  useEffect(() => {
    if (!user || !notes.data) return
    const ids = notes.data.map((n) => n.id)
    const seen = seenNotificationIds(user.id)
    if (seen && notificationsEnabled()) {
      const fresh = notes.data.filter((n) => !n.scheduledFor && !seen.has(n.id))
      for (const n of fresh.slice(0, 3)) void showDeviceNotification(n.title, n.body, n.id)
    }
    markNotificationsSeen(user.id, ids)
  }, [notes.data, user])
  return null
}
