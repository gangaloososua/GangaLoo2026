import {
  LayoutDashboard,
  ShoppingCart,
  Globe,
  Package,
  PackagePlus,
  Receipt,
  Boxes,
  Tags,
  Warehouse,
  ArrowRightLeft,
  Wallet,
  HandCoins,
  BookOpen,
  LineChart,
  Users,
  Truck,
  UsersRound,
  UserCog,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/lib/auth/roles'
export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  roles: Role[]
}
const ALL: Role[] = ['owner', 'admin', 'seller', 'distributor']
const OWNER_ONLY: Role[] = ['owner', 'admin']
const OWNER_AND_DISTRIBUTOR: Role[] = ['owner', 'admin', 'distributor']
export const navItems: NavItem[] = [
  { label: 'Dashboard',        href: '/',                     icon: LayoutDashboard, roles: ALL },
  { label: 'Sales',            href: '/sales',                icon: ShoppingCart,    roles: ALL },
  { label: 'Online Orders',    href: '/online-orders',        icon: Globe,           roles: OWNER_ONLY },
  { label: 'Products',         href: '/products',             icon: Package,         roles: OWNER_ONLY },
  { label: 'Inventory',        href: '/inventory',            icon: Boxes,           roles: ALL },
  { label: 'Categories',       href: '/categories',           icon: Tags,            roles: OWNER_ONLY },
  { label: 'Warehouses',       href: '/warehouses',           icon: Warehouse,       roles: OWNER_ONLY },
  { label: 'Transfers',        href: '/transfers',            icon: ArrowRightLeft,  roles: OWNER_AND_DISTRIBUTOR },
  { label: 'Purchases',        href: '/purchases',            icon: PackagePlus,     roles: OWNER_ONLY },
  { label: 'Courier Payments', href: '/courier-payments',     icon: Receipt,         roles: OWNER_ONLY },
  { label: 'Money Accounts',   href: '/money-accounts',       icon: Wallet,          roles: OWNER_ONLY },
  { label: 'Commissions',      href: '/commissions',          icon: HandCoins,       roles: OWNER_ONLY },
  { label: 'Seller Cash',      href: '/seller-cash',          icon: HandCoins,       roles: OWNER_ONLY },
  { label: 'Accounting',       href: '/accounting',           icon: BookOpen,        roles: OWNER_ONLY },
  { label: 'Reports',          href: '/reports',               icon: LineChart,       roles: OWNER_ONLY },
  { label: 'Discount Rules',   href: '/discount-rules',       icon: Receipt,         roles: OWNER_ONLY },
  { label: 'People',           href: '/people',               icon: UsersRound,      roles: OWNER_ONLY },
  { label: 'Users',            href: '/users',                icon: UserCog,         roles: OWNER_ONLY },
  { label: 'Customers',        href: '/people?role=customer', icon: Users,           roles: OWNER_ONLY },
  { label: 'Distributors',     href: '/people?distributor=1', icon: Truck,           roles: OWNER_ONLY },
  { label: 'Settings',         href: '/settings',             icon: Settings,        roles: OWNER_ONLY },
]
