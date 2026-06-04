'use client'

import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

// "Instalar app" button for the homepage hero. Reuses the landing page's
// gl-btn styling so it matches. Renders only when install is genuinely
// available: Android (after the browser offers it) or iOS Safari (where it
// reveals the manual Share -> Add to Home Screen hint). Hidden on desktop,
// in unsupported browsers, or once the app is already installed.
export function HomeInstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [ios, setIos] = useState(false)
  const [available, setAvailable] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    if (isStandalone()) return

    const ua = navigator.userAgent || ''
    const isAndroid = /Android/i.test(ua)
    const isIos =
      /iPad|iPhone|iPod/i.test(ua) ||
      (navigator.platform === 'MacIntel' &&
        ((navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints ?? 0) > 1)

    const onBIP = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      if (isAndroid) setAvailable(true)
    }
    window.addEventListener('beforeinstallprompt', onBIP)

    const onInstalled = () => {
      setAvailable(false)
      setIos(false)
    }
    window.addEventListener('appinstalled', onInstalled)

    if (isIos) {
      setIos(true)
      setAvailable(true)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function onClick() {
    if (ios) {
      setIosHint((v) => !v)
      return
    }
    if (!deferred) return
    try {
      await deferred.prompt()
      await deferred.userChoice
    } catch {
      /* ignore — e.g. prompt already used */
    }
    setDeferred(null)
    setAvailable(false)
  }

  if (!available) return null

  return (
    <>
      <button onClick={onClick} className="gl-btn gl-btn-ghost" type="button">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
        {ios ? 'Añadir a inicio' : 'Instalar app'}
      </button>
      {ios && iosHint && (
        <p style={{ flexBasis: '100%', fontSize: '.85rem', opacity: 0.8, marginTop: '.4rem', maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
          Pulsa el ícono Compartir y elige “Añadir a pantalla de inicio”.
        </p>
      )}
    </>
  )
}
