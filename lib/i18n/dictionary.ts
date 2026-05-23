// Lightweight role-based i18n for the GangaLoo admin app.
//
// Language is decided by ROLE, not a manual toggle:
//   owner / admin        -> English ('en')
//   seller / distributor -> Spanish ('es')
//
// Usage (works in both server and client components — no server-only deps):
//   import { localeForRole, t } from '@/lib/i18n/dictionary'
//   const locale = localeForRole(role)
//   t(locale, 'nav.Sales')   // -> 'Ventas' for a seller, 'Sales' for owner
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
}

const messages: Record<Locale, Messages> = { en, es }

export function t(locale: Locale, key: string): string {
  return messages[locale][key] ?? messages.en[key] ?? key
}
