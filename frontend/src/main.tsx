import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@/lib/pwa'
import { bootApi } from '@/api'
import { endSplash } from '@/lib/splash'
import { preloadScreen } from '@/screens'
import App from './App'

// the first screen's chunk loads while the sample data boots
preloadScreen(location.pathname)
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
