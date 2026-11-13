import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@/lib/pwa'
import { apiMode, bootApi } from '@/api'
import { prefetchPath } from '@/components/visitor/prefetch'
import { endSplash } from '@/lib/splash'
import { preloadScreen } from '@/screens'
import App from './App'

// the first screen's chunk loads while the sample data boots; on the server version its data is asked for at once too,
// instead of after the screen's code has arrived
preloadScreen(location.pathname)
if (apiMode === 'live') prefetchPath(location.pathname)
void bootApi().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  requestAnimationFrame(() => endSplash())
})

// iOS Safari only shows :active press states once the page listens for touches
document.addEventListener('touchstart', () => undefined, { passive: true })

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
