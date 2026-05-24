import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Paths that do NOT require a logged-in user.
//   /login, /auth  → admin authentication
//   /tienda        → public customer storefront (browse, cart, checkout,
//                    and the customer account/login page at /tienda/.../cuenta)
const PUBLIC_PREFIXES = ['/login', '/auth', '/tienda']

// Where to send a logged-in CUSTOMER who strays toward an admin page.
// (Replace with the "choose your store" landing once it exists in Step 4.)
const CUSTOMER_HOME = '/tienda/maranatha'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: must run getUser() to refresh the session token.
  // This still runs for public paths so customer sessions stay fresh.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isPublic = PUBLIC_PREFIXES.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  )

  // Redirect unauthenticated users away from protected (admin) pages only.
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Outer door: a logged-in CUSTOMER belongs in the store, never the admin.
  // (Admin pages and admin RPCs also re-check the role — this is the first,
  // outermost line of defense.) Staff roles (owner/admin/seller/etc.) pass
  // through untouched. We only do the role lookup for a logged-in user who is
  // heading to a non-public (admin) path, so storefront traffic is unaffected.
  if (user && !isPublic) {
    const { data: prof } = await supabase.rpc('get_my_customer_profile')
    const role = (prof as { role?: string | null } | null)?.role
    if (role === 'customer') {
      const url = request.nextUrl.clone()
      url.pathname = CUSTOMER_HOME
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
