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
  UserCog,
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
  { label: 'Customers', href: '/customers', icon: Users },
  { label: 'Distributors', href: '/distributors', icon: Truck },
  { label: 'Users', href: '/users', icon: UserCog },
]