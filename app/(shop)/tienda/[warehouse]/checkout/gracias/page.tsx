import { GraciasStatus } from './gracias-status'

// Thank-you page after a card payment. The actual status check + auto-refresh
// lives in the client component, which reads the order through a safe database
// function (no locked-table access).
export const dynamic = 'force-dynamic'

export default async function GraciasPage({
  params,
  searchParams,
}: {
  params: Promise<{ warehouse: string }>
  searchParams: Promise<{ inv?: string }>
}) {
  const { warehouse } = await params
  const { inv } = await searchParams
  return <GraciasStatus inv={inv ?? ''} warehouse={warehouse} />
}
