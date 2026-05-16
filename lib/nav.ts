import {
  LayoutDashboard,
  ShoppingCart,
  Globe,
  Package,
  Boxes,
  Tags,
  Warehouse,
  Users,
  Truck,
  UsersRound,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Sales', href: '/sales', icon: ShoppingCart },
  { label: 'Online Orders', href: '/orders', icon: Globe },
  { label: 'Products', href: '/products', icon: Package },
  { label: 'Inventory', href: '/inventory', icon: Boxes },
  { label: 'Categories', href: '/categories', icon: Tags },
  { label: 'Warehouses', href: '/warehouses', icon: Warehouse },
  { label: 'People', href: '/people', icon: UsersRound },
  { label: 'Customers', href: '/people?role=customer', icon: Users },
  { label: 'Distributors', href: '/people?distributor=1', icon: Truck },
  { label: 'Settings', href: '/settings', icon: Settings },
]
