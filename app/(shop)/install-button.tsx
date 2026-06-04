'use client'

import { useEffect, useState } from 'react'

const NAVY = '#0A2A66'
const MUTED = '#6b7280'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const STR = {
  es: {
    btn: 'Instalar app',
    ios: 'Añadir a inicio',
    iosHint: 'Pulsa el ícono Compartir abajo y elige “Añadir a pantalla de inicio”.',
  },
  en: {
    btn: 'Install app',
    ios: 'Add to Home Screen',
    iosHint: 'Tap the Share icon below, then choose “Add to Home Screen”.',
  },
} as const

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

// Inline "Instalar app" button for the /tienda landing page. Renders only when
// install is genuinely available: Android (after the browser offers it) or iOS
// Safari (where it reveals the manual Share -> Add to Home Screen hint). Hidden
// on desktop, in unsupported browsers, or once the app is already installed.
export function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [ios, setIos] = useState(false)
  const [available, setAvailable] = useState(false)
  const [iosHint, setIosHint] = useState(false)
  const [lang, setLang] = useState<'es' | 'en'>('es')

  useEffect(() => {
    if (isStandalone()) return

    const ua = navigator.userAgent || ''
    const isAndroid = /Android/i.test(ua)
    const isIos =
      /iPad|iPhone|iPod/i.test(ua) ||
      (navigator.platform === 'MacIntel' &&
        ((navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints ?? 0) > 1)

    setLang((navigator.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es')

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
  const t = STR[lang]

  return (
    <div style={{ marginTop: 16 }}>
      <button
        onClick={onClick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: '#fff',
          color: NAVY,
          border: `1px solid ${NAVY}`,
          borderRadius: 999,
          padding: '9px 16px',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
        {ios ? t.ios : t.btn}
      </button>
      {ios && iosHint && (
        <p style={{ marginTop: 8, fontSize: 13, lineHeight: 1.4, color: MUTED, maxWidth: 360 }}>
          {t.iosHint}
        </p>
      )}
    </div>
  )
}
