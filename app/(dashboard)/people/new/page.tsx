import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { PeopleForm } from '../people-form'

export default function NewPersonPage() {
  return (
    <div className="space-y-4 max-w-3xl">
      <Link href="/people" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Back to people
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New person</h1>
        <p className="text-sm text-muted-foreground">Add a customer, seller, distributor, or staff member.</p>
      </div>
      <PeopleForm />
    </div>
  )
}