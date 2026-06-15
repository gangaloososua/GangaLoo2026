import {
  LayoutDashboard,
  ShoppingCart,
  Globe,
  Package,
  PackagePlus,
  Receipt,
  Boxes,
  Tags,
  Tag,
  Warehouse,
  ArrowRightLeft,
  Wallet,
  HandCoins,
  BookOpen,
  FolderTree,
  LineChart,
  Users,
  Truck,
  UsersRound,
  UserCog,
  Settings,
  MapPin,
  Calculator,
  Search,
  QrCode,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/lib/auth/roles'
export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  roles: Role[]
  // Round 37d: optional inline translations (so new tabs don't require editing
  // the big lib/i18n/dictionary.ts). en = owner/admin, es = seller/distributor.
  i18n?: { en: string; es: string }
}
const ALL: Role[] = ['owner', 'admin', 'seller', 'distributor']
const OWNER_ONLY: Role[] = ['owner', 'admin']
const OWNER_AND_DISTRIBUTOR: Role[] = ['owner', 'admin', 'distributor']
export const navItems: NavItem[] = [
  { label: 'Dashboard',        href: '/panel',                icon: LayoutDashboard, roles: ALL },
  { label: 'Sales',            href: '/sales',                icon: ShoppingCart,    roles: ALL },
  { label: 'My Sales',         href: '/my-sales',             icon: Receipt,         roles: ALL,                  i18n: { en: 'My sales', es: 'Mis ventas' } },
  { label: 'Caja',             href: '/caja',                 icon: Calculator,      roles: ALL,                  i18n: { en: 'Register', es: 'Caja' } },
  { label: 'My Pay', href: '/mi-pago', icon: HandCoins, roles: ALL, i18n: { en: 'My pay', es: 'Mi pago' } },
  { label: 'Online Orders',    href: '/online-orders',        icon: Globe,           roles: OWNER_ONLY },
  { label: 'Service Orders',   href: '/service-orders',       icon: ShoppingBag,     roles: OWNER_ONLY,            i18n: { en: 'Service orders', es: 'Encargos' } },
  { label: 'US Orders',        href: '/us-orders',            icon: Globe,           roles: OWNER_ONLY,            i18n: { en: 'US orders', es: 'Pedidos US' } },
  { label: 'Products',         href: '/products',             icon: Package,         roles: OWNER_ONLY },
  { label: 'Inventory',        href: '/inventory',            icon: Boxes,           roles: ALL },
  { label: 'Locations',        href: '/locations',            icon: MapPin,          roles: OWNER_AND_DISTRIBUTOR, i18n: { en: 'Locations', es: 'Locaciones' } },
  { label: 'Find Stock',       href: '/buscar',               icon: Search,          roles: OWNER_AND_DISTRIBUTOR, i18n: { en: 'Find stock', es: 'Ã‚Â¿DÃƒÂ³nde estÃƒÂ¡?' } },
  { label: 'Labels',           href: '/etiquetas',            icon: QrCode,          roles: OWNER_AND_DISTRIBUTOR, i18n: { en: 'Labels', es: 'Etiquetas' } },
  { label: 'Categories',       href: '/categories',           icon: Tags,            roles: OWNER_ONLY },
  { label: 'Attributes',       href: '/attributes',           icon: Tag,             roles: OWNER_ONLY,            i18n: { en: 'Attributes', es: 'Atributos' } },
  { label: 'Warehouses',       href: '/warehouses',           icon: Warehouse,       roles: OWNER_ONLY },
  { label: 'Transfers',        href: '/transfers',            icon: ArrowRightLeft,  roles: OWNER_AND_DISTRIBUTOR },
  { label: 'Purchases',        href: '/purchases',            icon: PackagePlus,     roles: OWNER_ONLY },
  { label: 'Courier Payments', href: '/courier-payments',     icon: Receipt,         roles: OWNER_ONLY },
  { label: 'Money Accounts',   href: '/money-accounts',       icon: Wallet,          roles: OWNER_ONLY },
  { label: 'Commissions',      href: '/commissions',          icon: HandCoins,       roles: OWNER_ONLY },
  { label: 'Seller Cash',      href: '/seller-cash',          icon: HandCoins,       roles: OWNER_ONLY },
  { label: 'Accounting',       href: '/accounting',           icon: BookOpen,        roles: OWNER_ONLY },
  { label: 'Acct. Categories', href: '/accounting/categories', icon: FolderTree,      roles: OWNER_ONLY },
  { label: 'Reports',          href: '/reports',               icon: LineChart,       roles: OWNER_ONLY },
  { label: 'Discount Rules',   href: '/discount-rules',       icon: Receipt,         roles: OWNER_ONLY },
  { label: 'People',           href: '/people',               icon: UsersRound,      roles: OWNER_ONLY },
  { label: 'Users',            href: '/users',                icon: UserCog,         roles: OWNER_ONLY },
  { label: 'Customers',        href: '/people?role=customer', icon: Users,           roles: OWNER_ONLY },
  { label: 'Distributors',     href: '/people?distributor=1', icon: Truck,           roles: OWNER_ONLY },
  { label: 'Payroll', href: '/payroll', icon: HandCoins, roles: OWNER_ONLY, i18n: { en: 'Payroll', es: 'NÃƒÂ³mina' } },
  { label: 'Settings',         href: '/settings',             icon: Settings,        roles: OWNER_ONLY },
]
