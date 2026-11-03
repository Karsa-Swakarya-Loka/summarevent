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
import { SettingsRow } from './SettingsList'

/** The install and notification rows of the Akun settings list. */
export function AppSetupRows() {
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
    <>
      <SettingsRow
        icon={<Smartphone />}
        tint="bg-brand-soft text-[#0b6b35]"
        title="Pasang di HP"
        sub={installed ? 'Sudah terpasang di layar utama' : canPromptInstall() ? 'Buka langsung dari layar utama' : isIos() ? 'Safari: Bagikan, lalu Tambah ke Layar Utama' : 'Menu browser, lalu Pasang aplikasi'}
        right={
          installed ? (
            <Check className="size-5 shrink-0 text-[#0b6b35]" aria-label="Terpasang" />
          ) : canPromptInstall() ? (
            <Button className="h-11 shrink-0 px-4" onClick={() => void install()}>
              Pasang
            </Button>
          ) : null
        }
      />
      {notificationsSupported() && (
        <SettingsRow
          label
          icon={<BellRing />}
          tint="bg-[#e8eefa] text-[#2d4c8f]"
          title="Notifikasi di HP"
          sub="Selama app terbuka (simulasi)"
          right={<Switch checked={notify} onCheckedChange={(v) => void toggleNotify(v)} aria-label="Notifikasi di HP" />}
        />
      )}
    </>
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
