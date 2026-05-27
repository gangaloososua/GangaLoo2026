import { listAttributes, listAttributeValues } from './actions'
import { AttributesTable } from './attributes-table'
import { requireOwner } from '@/lib/auth/guard'

export default async function AttributesPage() {
  await requireOwner()
  const [attributes, values] = await Promise.all([
    listAttributes(),
    listAttributeValues(),
  ])
  return <AttributesTable attributes={attributes} values={values} />
}
