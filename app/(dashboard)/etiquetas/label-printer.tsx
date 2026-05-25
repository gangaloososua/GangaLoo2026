'use client'
// Round 37i — label printer (Etiquetas). [v2: image export for Niimbot B1]
//
// Niimbot printers print from their own app over Bluetooth, not as a system
// printer — so we DON'T use window.print(). Instead, each label is rendered to
// a PNG sized for a 50x30mm die-cut label (5:3), with a big QR (of the SKU) and
// a large bold product name filling the space. Download the PNG, then import it
// into the Niimbot app (label 50x30mm) and print. QR images via the `qrcode`
// package (loaded lazily).

import { useEffect, useRef, useState } from 'react'
import { Search, Plus, Trash2, Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { ProductSearchResult } from '@/lib/sales'
import type { Locale } from '@/lib/i18n/dictionary'
import { loadRegisterProducts } from '@/app/(dashboard)/caja/actions'

type LookupItem = { id: string; name: string }
type QueueItem = { sku: string; name: string; url: string }

const DEBOUNCE_MS = 250

// Canvas size for a 50x30mm label (5:3). High-res for crisp thermal output.
const W = 1000
const H = 600
const PAD = 40

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

async function generateLabel(sku: string, name: string): Promise<string> {
  const QRCode: any = (await import('qrcode')).default ?? (await import('qrcode'))
  const qrDataUrl: string = await QRCode.toDataURL(sku, {
    margin: 1,
    width: 520,
    color: { dark: '#000000', light: '#ffffff' },
  })
  const qrImg = await loadImage(qrDataUrl)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // QR on the left, as tall as the label allows.
  const qrSize = H - PAD * 2
  ctx.drawImage(qrImg, PAD, PAD, qrSize, qrSize)

  // Name fills the rest, large + bold, auto-sized to fit.
  const nameX = PAD + qrSize + 36
  const nameW = W - nameX - PAD
  const nameH = H - PAD * 2
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'

  let chosen = { fs: 28, lines: [name], lh: 32 }
  for (let fs = 88; fs >= 28; fs -= 4) {
    ctx.font = `bold ${fs}px Arial, sans-serif`
    const lines = wrapLines(ctx, name, nameW)
    const lh = fs * 1.15
    if (lines.length * lh <= nameH) {
      chosen = { fs, lines, lh }
      break
    }
    chosen = { fs, lines, lh } // keep smallest tried as fallback
  }

  ctx.font = `bold ${chosen.fs}px Arial, sans-serif`
  const totalH = chosen.lines.length * chosen.lh
  let y = PAD + Math.max(0, (nameH - totalH) / 2)
  for (const ln of chosen.lines) {
    ctx.fillText(ln, nameX, y)
    y += chosen.lh
  }

  return canvas.toDataURL('image/png')
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
function safeName(s: string): string {
  return s.replace(/[^\w.-]+/g, '_')
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export function LabelPrinter({
  warehouses,
  locale,
}: {
  warehouses: LookupItem[]
  locale: Locale
}) {
  const es = locale === 'es'
  const scopeWarehouseId = warehouses[0]?.id ?? ''
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const reqId = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    const myId = ++reqId.current
    setSearching(true)
    const tmr = setTimeout(async () => {
      const res = await loadRegisterProducts({ warehouseId: scopeWarehouseId, query: q })
      if (myId !== reqId.current) return
      setSearching(false)
      setResults(res.ok ? res.products : [])
    }, DEBOUNCE_MS)
    return () => clearTimeout(tmr)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  async function addProduct(p: ProductSearchResult) {
    setResults([])
    setQuery('')
    if (queue.some((q) => q.sku === p.sku)) return
    const url = await generateLabel(p.sku, p.name)
    setQueue((prev) => (prev.some((q) => q.sku === p.sku) ? prev : [...prev, { sku: p.sku, name: p.name, url }]))
  }
  function removeItem(sku: string) {
    setQueue((prev) => prev.filter((q) => q.sku !== sku))
  }
  async function downloadAll() {
    for (const it of queue) {
      triggerDownload(it.url, `${safeName(it.sku)}.png`)
      await sleep(350)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={es ? 'Buscar producto o SKU…' : 'Search product or SKU…'}
          className="pl-9"
          autoComplete="off"
        />
        {query.trim().length >= 2 && (results.length > 0 || searching) ? (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-80 overflow-y-auto rounded-md border bg-popover shadow-lg">
            {searching ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {es ? 'Buscando…' : 'Searching…'}
              </div>
            ) : (
              results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => addProduct(r)}
                  className="flex w-full items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/40"
                >
                  <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.sku}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      {queue.length === 0 ? (
        <Card>
          <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
            {es
              ? 'Busca productos para generar sus etiquetas.'
              : 'Search products to generate their labels.'}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-base">
              {es ? 'Etiquetas' : 'Labels'}{' '}
              <span className="text-sm font-normal text-muted-foreground">({queue.length})</span>
            </CardTitle>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setQueue([])}>
                {es ? 'Limpiar' : 'Clear'}
              </Button>
              <Button type="button" size="sm" onClick={downloadAll}>
                <Download className="mr-1 h-4 w-4" />
                {es ? 'Descargar todas' : 'Download all'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {queue.map((q) => (
              <div key={q.sku} className="flex items-center gap-3 rounded-md border p-2">
                {/* Preview at the real 5:3 label shape */}
                {q.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={q.url}
                    alt=""
                    className="h-[60px] w-[100px] shrink-0 rounded border bg-white object-contain"
                  />
                ) : (
                  <div className="h-[60px] w-[100px] shrink-0 rounded border bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{q.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{q.sku}</div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => triggerDownload(q.url, `${safeName(q.sku)}.png`)}
                >
                  <Download className="mr-1 h-4 w-4" />
                  {es ? 'Descargar' : 'Download'}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => removeItem(q.sku)}
                  aria-label={es ? 'Quitar' : 'Remove'}
                >
                  <Trash2 className="h-4 w-4 text-rose-600" />
                </Button>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              {es
                ? 'Guarda la imagen y ábrela en la app de Niimbot (etiqueta 50 × 30 mm).'
                : 'Save the image and open it in the Niimbot app (label 50 × 30 mm).'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
