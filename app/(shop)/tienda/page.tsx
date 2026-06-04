// Landing / "choose your store" page at /tienda.
// Server component: fetches active stores with their live deals (safe views),
// reads whether the visitor is signed in (to show the sign-up banner), then
// renders the interactive bilingual view.
import { listStoreWarehousesWithDeals } from '@/lib/store/catalog'
import { createClient } from '@/lib/supabase/server'
import { StoreLandingView } from './landing-view'

export const dynamic = 'force-dynamic'

export default async function StoreLandingPage() {
  const stores = await listStoreWarehousesWithDeals()

  // Is the visitor signed in? The sign-up banner only shows to those who aren't.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return <StoreLandingView stores={stores} isLoggedIn={!!user} />
}
