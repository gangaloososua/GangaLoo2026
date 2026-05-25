'use client'
// Round 37g — reusable camera QR scanner. [v2: + continuous mode]
//
// <QrScanButton onScan={(text) => ...} /> opens a full-screen camera sheet.
//  - default (one-shot): decodes once, calls onScan, closes.
//  - continuous: stays open, calls onScan for each NEW read (a short cooldown
//    de-dupes the same code being read many times per second). Close with X.
// Uses html5-qrcode, imported lazily so it never runs on the server.
//
// NOTE: browsers only allow the camera on HTTPS (or localhost). On a phone
// hitting a plain-http dev address the camera will be blocked by the browser.

import { useEffect, useRef, useState } from 'react'
import { ScanLine, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Locale } from '@/lib/i18n/dictionary'

type Props = {
  onScan: (text: string) => void
  locale?: Locale
  label?: string
  variant?: 'default' | 'outline' | 'ghost' | 'secondary'
  className?: string
  continuous?: boolean
}

const COOLDOWN_MS = 1200

function s(locale: Locale, key: 'btn' | 'title' | 'hint' | 'hintCont' | 'camErr'): string {
  const en: Record<string, string> = {
    btn: 'Scan',
    title: 'Scan a QR code',
    hint: 'Point the camera at the code.',
    hintCont: 'Scanning… hold each code in view, then close when done.',
    camErr: 'Could not open the camera. On a phone the page must be HTTPS, and you must allow camera access.',
  }
  const es: Record<string, string> = {
    btn: 'Escanear',
    title: 'Escanea un código QR',
    hint: 'Apunta la cámara al código.',
    hintCont: 'Escaneando… mantén cada código a la vista y cierra al terminar.',
    camErr: 'No se pudo abrir la cámara. En el teléfono la página debe ser HTTPS y debes permitir el acceso a la cámara.',
  }
  return (locale === 'es' ? es : en)[key]
}

export function QrScanButton({
  onScan,
  locale = 'en',
  label,
  variant = 'outline',
  className,
  continuous = false,
}: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" variant={variant} className={className} onClick={() => setOpen(true)}>
        <ScanLine className="mr-1 h-4 w-4" />
        {label ?? s(locale, 'btn')}
      </Button>
      {open ? (
        <ScannerSheet
          locale={locale}
          continuous={continuous}
          onClose={() => setOpen(false)}
          onScan={(t) => {
            if (!continuous) setOpen(false)
            onScan(t)
          }}
        />
      ) : null}
    </>
  )
}

function ScannerSheet({
  locale,
  continuous,
  onClose,
  onScan,
}: {
  locale: Locale
  continuous: boolean
  onClose: () => void
  onScan: (text: string) => void
}) {
  const elId = 'qr-reader-region'
  const instanceRef = useRef<any>(null)
  const oneShotDoneRef = useRef(false)
  const lastAcceptRef = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    function handleDecoded(text: string) {
      if (continuous) {
        const now = Date.now()
        if (now - lastAcceptRef.current < COOLDOWN_MS) return
        lastAcceptRef.current = now
        setLast(text)
        onScan(text)
      } else {
        if (oneShotDoneRef.current) return
        oneShotDoneRef.current = true
        onScan(text)
      }
    }

    async function startCamera() {
      try {
        const mod: any = await import('html5-qrcode')
        const Html5Qrcode = mod.Html5Qrcode ?? mod.default?.Html5Qrcode
        if (cancelled || !Html5Qrcode) return
        const instance = new Html5Qrcode(elId)
        instanceRef.current = instance
        await instance.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => handleDecoded(decodedText),
          () => {
            /* per-frame decode miss: ignore */
          },
        )
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : s(locale, 'camErr'))
      }
    }

    startCamera()

    return () => {
      cancelled = true
      const inst = instanceRef.current
      if (inst) {
        inst
          .stop()
          .then(() => inst.clear())
          .catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center justify-between p-3 text-white">
        <span className="text-sm font-medium">{s(locale, 'title')}</span>
        <button type="button" onClick={onClose} aria-label="X" className="rounded p-1 hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
        <div id={elId} className="w-full max-w-sm overflow-hidden rounded-lg" />
        {error ? (
          <p className="max-w-sm text-center text-sm text-rose-300">{error}</p>
        ) : (
          <p className="text-center text-xs text-white/70">
            {continuous ? s(locale, 'hintCont') : s(locale, 'hint')}
          </p>
        )}
        {continuous && last ? (
          <p className="text-center text-xs text-emerald-300">✓ {last}</p>
        ) : null}
      </div>
      {continuous ? (
        <div className="p-3">
          <Button type="button" className="w-full" variant="secondary" onClick={onClose}>
            {locale === 'es' ? 'Listo' : 'Done'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
