import { formatDOP } from '@/lib/format'

// ---------------------------------------------------------------------------
// WhatsApp "click to chat" link builder for invoices.
// ---------------------------------------------------------------------------
// WhatsApp's wa.me links open a chat to a number with a pre-filled message;
// they cannot attach a file (that needs the WhatsApp Business API). So the
// flow is: open the chat with a ready-written message, the operator attaches
// the invoice PDF (from /sales/[id]/print) themselves, and sends.
//
// Phone numbers in `profiles.phone` come in two shapes:
//   "+1 (849) 847-6518"  -> already has the +1 country code
//   "8294011228"          -> bare 10-digit DR local number (809/829/849)
// wa.me wants pure digits WITH the country code and no symbols. We strip all
// non-digits, then prepend "1" to bare 10-digit numbers.
// ---------------------------------------------------------------------------

export function normalizeDoPhone(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 0) return null
  // Bare 10-digit DR local number -> add the NANP country code.
  if (digits.length === 10) return `1${digits}`
  // Already has the leading 1 (e.g. from "+1 (849)...").
  if (digits.length === 11 && digits.startsWith('1')) return digits
  // Anything else (already international / unusual): use the digits as-is.
  return digits
}

export function buildInvoiceWhatsAppLink(opts: {
  phone: string | null
  customerName: string | null
  invoiceNumber: string | null
  totalCents: number
}): string | null {
  const phone = normalizeDoPhone(opts.phone)
  if (!phone) return null

  const greeting = opts.customerName ? `Hola ${opts.customerName}` : 'Hola'
  const inv = opts.invoiceNumber ? ` ${opts.invoiceNumber}` : ''
  const text =
    `${greeting}, aquí está su factura${inv} por ` +
    `${formatDOP(opts.totalCents)}. ¡Gracias por su compra en GangaLoo!`

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
}
