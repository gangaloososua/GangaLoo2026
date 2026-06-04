'use client'

import { useEffect, useState } from 'react'

const NAVY = '#0A2A66'
const RED = '#CE1126'

// The browser fires this event on Android/Chrome when the site is installable.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const STR = {
  es: {
    title: 'Instala GangaLoo en tu teléfono',
    sub: 'Tu tienda, a un toque en la pantalla de inicio.',
    android: 'Instalar app',
    ios: 'Añadir a inicio',
    iosHint: 'Pulsa el ícono Compartir abajo y elige “Añadir a pantalla de inicio”.',
    close: 'Cerrar',
  },
  en: {
    title: 'Install GangaLoo on your phone',
    sub: 'Your store, one tap away on your home screen.',
    android: 'Install app',
    ios: 'Add to Home Screen',
    iosHint: 'Tap the Share icon below, then choose “Add to Home Screen”.',
    close: 'Dismiss',
  },
} as const

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function InstallPrompt() {
  const [show, setShow] = useState(false)
  const [platform, setPlatform] = useState<'android' | 'ios'>('android')
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosHint, setIosHint] = useState(false)
  const [lang, setLang] = useState<'es' | 'en'>('es')

  useEffect(() => {
    // Already installed? Don't nag.
    if (isStandalone()) return
    try {
      if (localStorage.getItem('gl_install_prompt') === 'dismissed') return
    } catch {
      /* ignore */
    }

    const ua = navigator.userAgent || ''
    const isAndroid = /Android/i.test(ua)
    const isIos =
      /iPad|iPhone|iPod/i.test(ua) ||
      (navigator.platform === 'MacIntel' &&
        ((navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints ?? 0) > 1)

    setLang((navigator.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es')

    // Android/Chrome: capture the install event and show our button (mobile only).
    const onBIP = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      if (isAndroid) {
        setPlatform('android')
        setShow(true)
      }
    }
    window.addEventListener('beforeinstallprompt', onBIP)

    const onInstalled = () => {
      setShow(false)
      try {
        localStorage.setItem('gl_install_prompt', 'dismissed')
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('appinstalled', onInstalled)

    // iOS Safari has no install event — show the manual hint bar instead.
    if (isIos) {
      setPlatform('ios')
      setShow(true)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  function dismiss() {
    setShow(false)
    setIosHint(false)
    try {
      localStorage.setItem('gl_install_prompt', 'dismissed')
    } catch {
      /* ignore */
    }
  }

  async function onInstallClick() {
    if (platform === 'ios') {
      setIosHint((v) => !v)
      return
    }
    if (!deferred) return
    await deferred.prompt()
    try {
      await deferred.userChoice
    } catch {
      /* ignore */
    }
    setDeferred(null)
    setShow(false)
    try {
      localStorage.setItem('gl_install_prompt', 'dismissed')
    } catch {
      /* ignore */
    }
  }

  if (!show) return null
  const t = STR[lang]

  return (
    <div
      role="dialog"
      aria-label={t.title}
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        display: 'flex',
        justifyContent: 'center',
        padding: '0 12px calc(12px + env(safe-area-inset-bottom))',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          width: '100%',
          maxWidth: 520,
          background: NAVY,
          color: '#fff',
          borderRadius: 16,
          boxShadow: '0 10px 30px rgba(0,0,0,.25)',
          padding: '12px 14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-512.png" alt="" width={40} height={40} style={{ borderRadius: 10, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>{t.title}</p>
            <p style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.3, marginTop: 2 }}>{t.sub}</p>
          </div>
          <button
            onClick={onInstallClick}
            style={{
              flexShrink: 0,
              background: RED,
              color: '#fff',
              border: 'none',
              borderRadius: 999,
              padding: '9px 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {platform === 'ios' ? t.ios : t.android}
          </button>
          <button
            onClick={dismiss}
            aria-label={t.close}
            style={{
              flexShrink: 0,
              background: 'transparent',
              color: 'rgba(255,255,255,.7)',
              border: 'none',
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              padding: '0 2px',
            }}
          >
            ×
          </button>
        </div>
        {platform === 'ios' && iosHint && (
          <p
            style={{
              marginTop: 10,
              fontSize: 13,
              lineHeight: 1.4,
              background: 'rgba(255,255,255,.1)',
              borderRadius: 10,
              padding: '8px 10px',
            }}
          >
            {t.iosHint}
          </p>
        )}
      </div>
    </div>
  )
}
