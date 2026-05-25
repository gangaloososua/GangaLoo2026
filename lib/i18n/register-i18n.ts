// Round 37c — Caja (register) strings (en/es).
//
// Companion to lib/i18n/dictionary.ts (kept separate; language follows role).
// Mirrors lib/i18n/transfers-i18n.ts / locations-i18n.ts.

import type { Locale } from '@/lib/i18n/dictionary'

type Messages = Record<string, string>

const en: Messages = {
  'rg.title': 'Point of Sale',
  'rg.blurb': 'Tap products to ring up a sale.',
  'rg.warehouse': 'Warehouse',
  'rg.searchPh': 'Search product or SKU…',
  'rg.noProducts': 'No products found.',
  'rg.loading': 'Loading…',

  // Stock
  'rg.units': 'units',
  'rg.out': 'Out of stock',

  // Cart
  'rg.cart': 'Cart',
  'rg.cartEmpty': 'Tap products to add them to the cart.',
  'rg.remove': 'Remove',
  'rg.subtotal': 'Subtotal',
  'rg.discount': 'Discount',
  'rg.total': 'Total',

  // Buttons
  'rg.charge': 'Charge cash',
  'rg.charging': 'Charging…',
  'rg.reserve': 'Reserve',
  'rg.reserving': 'Reserving…',
  'rg.clear': 'Clear cart',

  // Toasts (composed: "Sale POS-123 charged.")
  'rg.saleWord': 'Sale',
  'rg.orderWord': 'Order',
  'rg.doneSale': 'charged.',
  'rg.doneOrder': 'reserved.',
  'rg.toast.empty': 'Cart is empty.',
  'rg.toast.noSeller': 'No seller set. Reload the page and try again.',
  'rg.toast.noCash': 'Create a cash money account first (Money Accounts).',
  'rg.toast.failed': 'Something went wrong. Please try again.',
  'rg.toast.loadFailed': 'Could not load products.',
}

const es: Messages = {
  'rg.title': 'Punto de Venta',
  'rg.blurb': 'Toca los productos para registrar una venta.',
  'rg.warehouse': 'Almacén',
  'rg.searchPh': 'Buscar producto o SKU…',
  'rg.noProducts': 'No se encontraron productos.',
  'rg.loading': 'Cargando…',

  // Stock
  'rg.units': 'uds',
  'rg.out': 'Agotado',

  // Cart
  'rg.cart': 'Carrito',
  'rg.cartEmpty': 'Toca los productos para agregarlos al carrito.',
  'rg.remove': 'Quitar',
  'rg.subtotal': 'Subtotal',
  'rg.discount': 'Descuento',
  'rg.total': 'Total',

  // Buttons
  'rg.charge': 'Cobrar Efectivo',
  'rg.charging': 'Cobrando…',
  'rg.reserve': 'Reservar',
  'rg.reserving': 'Reservando…',
  'rg.clear': 'Limpiar carrito',

  // Toasts (composed: "Venta POS-123 cobrada.")
  'rg.saleWord': 'Venta',
  'rg.orderWord': 'Reserva',
  'rg.doneSale': 'cobrada.',
  'rg.doneOrder': 'reservada.',
  'rg.toast.empty': 'El carrito está vacío.',
  'rg.toast.noSeller': 'No hay vendedor. Recarga la página e inténtalo de nuevo.',
  'rg.toast.noCash': 'Crea primero una cuenta de efectivo (Cuentas de dinero).',
  'rg.toast.failed': 'Algo salió mal. Inténtalo de nuevo.',
  'rg.toast.loadFailed': 'No se pudieron cargar los productos.',
}

const messages: Record<Locale, Messages> = { en, es }

export function tc(locale: Locale, key: string): string {
  return messages[locale][key] ?? messages.en[key] ?? key
}
