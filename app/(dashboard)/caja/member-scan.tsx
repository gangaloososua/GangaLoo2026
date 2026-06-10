'use client'

// Round 68c — "Scan member card" control for the caja register.
//
// Two ways in: an NFC tap (Web NFC / NDEFReader — Android Chrome only, over
// HTTPS) and a typed/pasted serial that works everywhere (and right now,
// before physical cards exist). A found member shows as a chip with tier +
// points and an X to remove. The register owns the member state; this control
// just reports changes via onMember.

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CreditCard, X, Search, UserCheck, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { Locale } from '@/lib/i18n/dictionary'
import { findMemberByCardAction, type ScannedMember } from './member-scan-actions'

// Minimal shape of the Web NFC reader (not in the standard DOM lib types).
type NfcReader = {
  scan: () => Promise<void>
  onreading: ((ev: { serialNumber?: string }) => void) | null
  onreadingerror: (() => void) | null
}

function tierLabel(tier: string): string | null {
  if (!tier || tier === 'none') return null
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

export function MemberScan({
  member,
  onMember,
  locale,
}: {
  member: ScannedMember | null
  onMember: (m: ScannedMember | null) => void
  locale: Locale
}) {
  const es = locale === 'es'
  const [open, setOpen] = useState(false)
  const [serial, setSerial] = useState('')
  const [looking, setLooking] = useState(false)
  const [nfcActive, setNfcActive] = useState(false)
  const [nfcSupported, setNfcSupported] = useState(false)

  useEffect(() => {
    setNfcSupported(typeof window !== 'undefined' && 'NDEFReader' in window)
  }, [])

  async function lookup(raw: string) {
    const clean = raw.trim()
    if (!clean) {
      toast.error(es ? 'Escribe el número de la tarjeta.' : 'Enter the card serial.')
      return
    }
    setLooking(true)
    try {
      const res = await findMemberByCardAction(clean)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      if (res.member) {
        onMember(res.member)
        setOpen(false)
        setSerial('')
        toast.success(res.member.fullName)
      } else {
        toast.error(
          es ? 'Ninguna tarjeta coincide con ese número.' : 'No member found for that card.',
        )
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : es ? 'Búsqueda falló.' : 'Lookup failed.')
    } finally {
      setLooking(false)
    }
  }

  async function startTap() {
    const Ctor = (window as unknown as { NDEFReader?: new () => NfcReader }).NDEFReader
    if (!Ctor) {
      toast.error(
        es
          ? 'Este dispositivo no puede leer NFC. Escribe el número.'
          : 'This device can’t tap NFC. Type the serial instead.',
      )
      return
    }
    try {
      const reader = new Ctor()
      setNfcActive(true)
      await reader.scan()
      reader.onreadingerror = () => {
        toast.error(
          es ? 'No se pudo leer la tarjeta. Inténtalo otra vez.' : 'Could not read the card. Try again.',
        )
      }
      reader.onreading = (ev) => {
        setNfcActive(false)
        void lookup(ev.serialNumber ?? '')
      }
    } catch (err) {
      setNfcActive(false)
      toast.error(
        err instanceof Error
          ? err.message
          : es
            ? 'Escaneo NFC falló. Escribe el número.'
            : 'NFC scan failed. Type the serial instead.',
      )
    }
  }

  // Attached member — show a chip with tier + points and a remove button.
  if (member) {
    const tl = tierLabel(member.tier)
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <UserCheck className="h-4 w-4 shrink-0 text-emerald-700" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{member.fullName}</div>
            <div className="text-xs text-muted-foreground">
              {tl ? `${tl} · ` : ''}
              {member.points} {member.points === 1 ? (es ? 'punto' : 'point') : es ? 'puntos' : 'points'}
            </div>
          </div>
          {tl ? (
            <Badge className="ml-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{tl}</Badge>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => onMember(null)}
          aria-label={es ? 'Quitar miembro' : 'Remove member'}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  // No member yet — trigger + inline panel.
  if (!open) {
    return (
      <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <CreditCard className="mr-2 h-4 w-4" />
        {es ? 'Escanear tarjeta de socio' : 'Scan member card'}
      </Button>
    )
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {es ? 'Tarjeta de socio' : 'Member card'}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setOpen(false)}
          aria-label={es ? 'Cerrar' : 'Close'}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {nfcSupported ? (
        <Button type="button" className="w-full" onClick={() => void startTap()} disabled={nfcActive}>
          {nfcActive ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {es ? 'Acerca la tarjeta…' : 'Tap the card…'}
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              {es ? 'Tocar tarjeta (NFC)' : 'Tap card (NFC)'}
            </>
          )}
        </Button>
      ) : null}

      <div className="flex items-center gap-2">
        <Input
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void lookup(serial)
            }
          }}
          placeholder={es ? 'Número de la tarjeta' : 'Card serial number'}
          autoComplete="off"
        />
        <Button type="button" onClick={() => void lookup(serial)} disabled={looking} className="shrink-0">
          {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span className="ml-1">{es ? 'Buscar' : 'Find'}</span>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {es
          ? 'Toca la tarjeta o escribe su número. (NFC requiere Android + Chrome.)'
          : 'Tap a card or type its serial. (NFC needs Android + Chrome.)'}
      </p>
    </div>
  )
}
