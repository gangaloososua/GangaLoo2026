// Lightweight role-based i18n for the GangaLoo admin app.
//
// Language is decided by ROLE, not a manual toggle:
//   owner / admin        -> English ('en')
//   seller / distributor -> Spanish ('es')
//
// Usage (works in both server and client components — no server-only deps):
//   import { localeForRole, t, plural } from '@/lib/i18n/dictionary'
//   const locale = localeForRole(role)
//   t(locale, 'nav.Sales')                       // -> 'Ventas' for a seller
//   plural(locale, n, 'unit.one', 'unit.other')  // -> 'unidad' / 'unidades'
//
// Missing keys fall back to English, then to the key itself, so a
// forgotten translation degrades gracefully instead of breaking the UI.

import type { Role } from '@/lib/auth/roles'

export type Locale = 'en' | 'es'

export function localeForRole(role: Role): Locale {
  return role === 'seller' || role === 'distributor' ? 'es' : 'en'
}

type Messages = Record<string, string>

const en: Messages = {
  // Sidebar navigation. Key convention: 'nav.' + the navItems label.
  'nav.Dashboard': 'Dashboard',
  'nav.Sales': 'Sales',
  'nav.Online Orders': 'Online Orders',
  'nav.Products': 'Products',
  'nav.Inventory': 'Inventory',
  'nav.Categories': 'Categories',
  'nav.Warehouses': 'Warehouses',
  'nav.Transfers': 'Transfers',
  'nav.Purchases': 'Purchases',
  'nav.Courier Payments': 'Courier Payments',
  'nav.Money Accounts': 'Money Accounts',
  'nav.Commissions': 'Commissions',
  'nav.Seller Cash': 'Seller Cash',
  'nav.Accounting': 'Accounting',
  'nav.Reports': 'Reports',
  'nav.Discount Rules': 'Discount Rules',
  'nav.People': 'People',
  'nav.Users': 'Users',
  'nav.Customers': 'Customers',
  'nav.Distributors': 'Distributors',
  'nav.Settings': 'Settings',

  // Common chrome
  'common.signOut': 'Sign out',
  'common.previous': 'Previous',
  'common.next': 'Next',
  'common.page': 'Page',
  'common.of': 'of',

  // Order / sale status badges
  'status.draft': 'Draft',
  'status.paid': 'Paid',
  'status.partial': 'Partial',
  'status.partiallyPaid': 'Partially paid',
  'status.confirmed': 'Confirmed',
  'status.cancelled': 'Cancelled',
  'status.refunded': 'Refunded',

  // Plural word pairs (use via plural())
  'unit.one': 'unit',
  'unit.other': 'units',
  'product.one': 'product',
  'product.other': 'products',
  'order.one': 'order',
  'order.other': 'orders',
  'sale.one': 'sale',
  'sale.other': 'sales',

  // Seller dashboard
  'dash.greeting': 'Hi',
  'dash.myDashboard': 'My dashboard',
  'dash.subtitle': "Your commissions, your orders, what you owe the business, and what's in stock.",
  'dash.incomingTransfers': 'Incoming transfers',
  'dash.onTheWay': 'on the way',
  'dash.sent': 'sent',
  'dash.walkIn': 'Walk-in / no customer',
  'dash.owes': 'owes',
  'dash.commissionOwed': 'Commission owed to you',
  'dash.earned': 'earned',
  'dash.paid': 'paid',
  'dash.unpaidOnOrders': 'Unpaid on your orders',
  'dash.businessOwedThis': 'the business is owed this',
  'dash.cashHolding': "Cash you're holding",
  'dash.collectedNotHandedIn': 'collected, not yet handed in',
  'dash.openOrders': 'Open orders',
  'dash.stillOwing': 'still owing',
  'dash.noOpenOrders': 'No open orders — nothing owing right now.',
  'dash.recentOrders': 'Recent orders',
  'dash.total': 'total',
  'dash.noOrders': 'No orders yet.',
  'dash.notYetHandedIn': 'not yet handed in',
  'dash.availableStock': 'Available stock',
  'dash.nothingInStock': 'Nothing in stock.',

  // Sales list page
  'sales.title': 'Sales',
  'sales.subtitle': 'In-person POS sales. Online orders live in their own module.',
  'sales.receivePayment': 'Receive payment',
  'sales.newPosSale': 'New POS sale',
  'sales.noMatch': 'No sales match the current filters.',
  'sales.walkIn': 'Walk-in',

  // Sales table columns
  'sales.col.invoice': 'Invoice',
  'sales.col.date': 'Date',
  'sales.col.status': 'Status',
  'sales.col.customer': 'Customer',
  'sales.col.seller': 'Seller',
  'sales.col.warehouse': 'Warehouse',
  'sales.col.items': 'Items',
  'sales.col.total': 'Total',
  'sales.col.paid': 'Paid',

  // Filters
  'filter.anyStatus': 'Any status',
  'filter.anySeller': 'Any seller',
  'filter.anyWarehouse': 'Any warehouse',
  'filter.from': 'From',
  'filter.to': 'To',
  'filter.clear': 'Clear filters',
}

const es: Messages = {
  // Sidebar navigation
  'nav.Dashboard': 'Panel',
  'nav.Sales': 'Ventas',
  'nav.Online Orders': 'Pedidos en línea',
  'nav.Products': 'Productos',
  'nav.Inventory': 'Inventario',
  'nav.Categories': 'Categorías',
  'nav.Warehouses': 'Almacenes',
  'nav.Transfers': 'Transferencias',
  'nav.Purchases': 'Compras',
  'nav.Courier Payments': 'Pagos de mensajería',
  'nav.Money Accounts': 'Cuentas de dinero',
  'nav.Commissions': 'Comisiones',
  'nav.Seller Cash': 'Efectivo de vendedores',
  'nav.Accounting': 'Contabilidad',
  'nav.Reports': 'Reportes',
  'nav.Discount Rules': 'Reglas de descuento',
  'nav.People': 'Personas',
  'nav.Users': 'Usuarios',
  'nav.Customers': 'Clientes',
  'nav.Distributors': 'Distribuidores',
  'nav.Settings': 'Configuración',

  // Common chrome
  'common.signOut': 'Cerrar sesión',
  'common.previous': 'Anterior',
  'common.next': 'Siguiente',
  'common.page': 'Página',
  'common.of': 'de',

  // Order / sale status badges
  'status.draft': 'Borrador',
  'status.paid': 'Pagado',
  'status.partial': 'Parcial',
  'status.partiallyPaid': 'Pagado parcial',
  'status.confirmed': 'Confirmado',
  'status.cancelled': 'Cancelado',
  'status.refunded': 'Reembolsado',

  // Plural word pairs
  'unit.one': 'unidad',
  'unit.other': 'unidades',
  'product.one': 'producto',
  'product.other': 'productos',
  'order.one': 'pedido',
  'order.other': 'pedidos',
  'sale.one': 'venta',
  'sale.other': 'ventas',

  // Seller dashboard
  'dash.greeting': 'Hola',
  'dash.myDashboard': 'Mi panel',
  'dash.subtitle': 'Tus comisiones, tus pedidos, lo que le debes al negocio y lo que hay en stock.',
  'dash.incomingTransfers': 'Transferencias entrantes',
  'dash.onTheWay': 'en camino',
  'dash.sent': 'enviado',
  'dash.walkIn': 'Sin cliente / mostrador',
  'dash.owes': 'debe',
  'dash.commissionOwed': 'Comisión que se te debe',
  'dash.earned': 'ganado',
  'dash.paid': 'pagado',
  'dash.unpaidOnOrders': 'Sin pagar en tus pedidos',
  'dash.businessOwedThis': 'el negocio cobra esto',
  'dash.cashHolding': 'Efectivo que tienes',
  'dash.collectedNotHandedIn': 'cobrado, aún no entregado',
  'dash.openOrders': 'Pedidos abiertos',
  'dash.stillOwing': 'con saldo pendiente',
  'dash.noOpenOrders': 'No hay pedidos abiertos — nada pendiente ahora.',
  'dash.recentOrders': 'Pedidos recientes',
  'dash.total': 'en total',
  'dash.noOrders': 'Aún no hay pedidos.',
  'dash.notYetHandedIn': 'aún sin entregar',
  'dash.availableStock': 'Stock disponible',
  'dash.nothingInStock': 'Nada en stock.',

  // Sales list page
  'sales.title': 'Ventas',
  'sales.subtitle': 'Ventas POS en persona. Los pedidos en línea están en su propio módulo.',
  'sales.receivePayment': 'Recibir pago',
  'sales.newPosSale': 'Nueva venta POS',
  'sales.noMatch': 'Ninguna venta coincide con los filtros actuales.',
  'sales.walkIn': 'Mostrador',

  // Sales table columns
  'sales.col.invoice': 'Factura',
  'sales.col.date': 'Fecha',
  'sales.col.status': 'Estado',
  'sales.col.customer': 'Cliente',
  'sales.col.seller': 'Vendedor',
  'sales.col.warehouse': 'Almacén',
  'sales.col.items': 'Artículos',
  'sales.col.total': 'Total',
  'sales.col.paid': 'Pagado',

  // Filters
  'filter.anyStatus': 'Cualquier estado',
  'filter.anySeller': 'Cualquier vendedor',
  'filter.anyWarehouse': 'Cualquier almacén',
  'filter.from': 'Desde',
  'filter.to': 'Hasta',
  'filter.clear': 'Limpiar filtros',
}

const messages: Record<Locale, Messages> = { en, es }

export function t(locale: Locale, key: string): string {
  return messages[locale][key] ?? messages.en[key] ?? key
}

export function plural(
  locale: Locale,
  n: number,
  oneKey: string,
  otherKey: string,
): string {
  return t(locale, n === 1 ? oneKey : otherKey)
}
