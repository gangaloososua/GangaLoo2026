'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { navItems } from '@/lib/nav'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { logout } from '@/app/actions'
import { LogOut, Menu, X } from 'lucide-react'
import type { Role } from '@/lib/auth/roles'
import { localeForRole, t } from '@/lib/i18n/dictionary'

function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname()
  const sp = useSearchParams()
  const locale = localeForRole(role)
  const visibleItems = navItems.filter((item) => item.roles.includes(role))
  function isActive(href: string): boolean {
    const [hrefPath, hrefQuery] = href.split('?')
    if (hrefPath !== pathname) {
      if (hrefPath === '/' && pathname !== '/') return false
      if (hrefPath !== '/' && !pathname.startsWith(hrefPath)) return false
      if (hrefPath === '/') return pathname === '/'
    }
    const currentRelevant = new Map<string, string>()
    const hrefParams = new URLSearchParams(hrefQuery ?? '')
    for (const [k, v] of hrefParams) currentRelevant.set(k, v)
    if (!hrefQuery) {
      if (hrefPath === '/people') {
        return !sp.get('role') && sp.get('distributor') !== '1'
      }
      return true
    }
    for (const [k, v] of currentRelevant) {
      if (sp.get(k) !== v) return false
    }
    return true
  }
  return (
    <>
      {visibleItems.map((item) => {
        const active = isActive(item.href)
        const Icon = item.icon
        // Round 37d: inline i18n label wins; otherwise use the shared dictionary.
        const label = item.i18n ? item.i18n[locale] : t(locale, 'nav.' + item.label)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
              active
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        )
      })}
    </>
  )
}

function SidebarContents({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const locale = localeForRole(role)
  return (
    <>
      <div className="flex h-16 items-center px-6">
        <Link href="/" onClick={onNavigate} className="text-lg font-semibold tracking-tight">
          Gangaloo Control
        </Link>
      </div>
      <Separator />
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <NavLinks role={role} onNavigate={onNavigate} />
      </nav>
      <Separator />
      <div className="p-3">
        <form>
          <Button
            formAction={logout}
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            {t(locale, 'common.signOut')}
          </Button>
        </form>
      </div>
    </>
  )
}

// Desktop: a fixed column. Hidden on phones (the MobileNav drawer takes over).
export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="hidden h-screen w-60 flex-col border-r bg-background md:flex">
      <SidebarContents role={role} />
    </aside>
  )
}

// Phones only: a hamburger button (sits in the top bar) that opens a slide-out
// drawer holding the same menu. Hidden on desktop.
export function MobileNav({ role }: { role: Role }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const locale = localeForRole(role)
  // Close the drawer whenever the route actually changes.
  useEffect(() => {
    setOpen(false)
  }, [pathname])
  const close = () => setOpen(false)
  return (
    <>
      <button
        type="button"
        aria-label={locale === 'es' ? 'Menú' : 'Menu'}
        onClick={() => setOpen(true)}
        className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-hidden="true"
            onClick={close}
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,.45)' }}
          />
          <aside className="absolute left-0 top-0 flex h-full w-[82%] max-w-[280px] flex-col border-r bg-background shadow-2xl">
            <button
              type="button"
              aria-label={locale === 'es' ? 'Cerrar' : 'Close'}
              onClick={close}
              className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContents role={role} onNavigate={close} />
          </aside>
        </div>
      )}
    </>
  )
}
