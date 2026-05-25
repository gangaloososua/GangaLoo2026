// Round 37b/37e — locations-screen strings (en/es). [v2: + placement editor]
//
// Small companion to lib/i18n/dictionary.ts (kept separate so the big shared
// dictionary stays untouched). Language follows role via localeForRole.

import type { Locale } from '@/lib/i18n/dictionary'

type Messages = Record<string, string>

const en: Messages = {
  // Page chrome
  'loc.title': 'Locations',
  'loc.blurb': 'Create and name the spots where stock is kept in each warehouse.',
  'loc.noWh': "You don't have a warehouse assigned yet. Ask the owner to assign you one.",

  // Add box
  'loc.addPh': 'New location name…',
  'loc.add': 'Add',
  'loc.adding': 'Adding…',

  // List
  'loc.empty': 'No locations yet. Add your first spot above.',
  'loc.inactive': 'Inactive',
  'loc.here.none': 'No products here yet',

  // Row actions
  'loc.edit': 'Rename',
  'loc.save': 'Save',
  'loc.saving': 'Saving…',
  'loc.cancel': 'Cancel',
  'loc.deactivate': 'Deactivate',
  'loc.activate': 'Activate',
  'loc.delete': 'Delete',

  // Confirms (browser confirm dialogs)
  'loc.confirmDelete': 'Delete this location? This only removes the location — your products stay.',
  'loc.confirmDeleteWithItems': 'This location has products assigned to it. Deleting it forgets where those items are (your products stay). Continue?',

  // Toasts
  'loc.toast.added': 'Location added.',
  'loc.toast.renamed': 'Location renamed.',
  'loc.toast.activated': 'Location activated.',
  'loc.toast.deactivated': 'Location deactivated.',
  'loc.toast.deleted': 'Location deleted.',
  'loc.toast.dupName': 'A location with that name already exists in this warehouse.',
  'loc.toast.failed': 'Something went wrong. Please try again.',
  'loc.err.emptyName': 'Type a name first.',

  // Plural words
  'loc.product.one': 'product',
  'loc.product.other': 'products',
  'loc.unit.one': 'unit',
  'loc.unit.other': 'units',

  // ---- Placement editor (Asignar productos) ----
  'loc.assign.title': 'Place products',
  'loc.assign.blurb': 'Choose a product and set how many units sit in each location.',
  'loc.assign.back': 'Back to locations',
  'loc.assign.searchPh': 'Search product or SKU…',
  'loc.assign.searching': 'Searching…',
  'loc.assign.noResults': 'No products found.',
  'loc.assign.pickProduct': 'Search and pick a product above to place it.',
  'loc.assign.onHand': 'On hand',
  'loc.assign.placed': 'Placed',
  'loc.assign.placedMore': 'You have placed more than the on-hand amount.',
  'loc.assign.current': 'Current locations',
  'loc.assign.none': 'Not placed anywhere yet.',
  'loc.assign.addHere': 'Add to a location',
  'loc.assign.pickLoc': 'Choose location…',
  'loc.assign.qty': 'Qty',
  'loc.assign.add': 'Add',
  'loc.assign.remove': 'Remove',
  'loc.assign.noLocs': 'This warehouse has no locations yet. Create some on the Locations screen first.',
  'loc.assign.toast.saved': 'Saved.',
  'loc.assign.toast.removed': 'Removed.',
  'loc.assign.toast.failed': 'Something went wrong. Please try again.',
  'loc.assign.toast.pickLoc': 'Choose a location first.',
}

const es: Messages = {
  // Page chrome
  'loc.title': 'Locaciones',
  'loc.blurb': 'Crea y nombra los lugares donde se guarda el stock en cada almacén.',
  'loc.noWh': 'Aún no tienes un almacén asignado. Pide al dueño que te asigne uno.',

  // Add box
  'loc.addPh': 'Nombre de la nueva locación…',
  'loc.add': 'Agregar',
  'loc.adding': 'Agregando…',

  // List
  'loc.empty': 'Aún no hay locaciones. Agrega tu primer lugar arriba.',
  'loc.inactive': 'Inactiva',
  'loc.here.none': 'Aún no hay productos aquí',

  // Row actions
  'loc.edit': 'Renombrar',
  'loc.save': 'Guardar',
  'loc.saving': 'Guardando…',
  'loc.cancel': 'Cancelar',
  'loc.deactivate': 'Desactivar',
  'loc.activate': 'Activar',
  'loc.delete': 'Eliminar',

  // Confirms
  'loc.confirmDelete': '¿Eliminar esta locación? Esto solo borra la locación — tus productos se mantienen.',
  'loc.confirmDeleteWithItems': 'Esta locación tiene productos asignados. Al eliminarla se olvidará dónde están esos artículos (tus productos se mantienen). ¿Continuar?',

  // Toasts
  'loc.toast.added': 'Locación agregada.',
  'loc.toast.renamed': 'Locación renombrada.',
  'loc.toast.activated': 'Locación activada.',
  'loc.toast.deactivated': 'Locación desactivada.',
  'loc.toast.deleted': 'Locación eliminada.',
  'loc.toast.dupName': 'Ya existe una locación con ese nombre en este almacén.',
  'loc.toast.failed': 'Algo salió mal. Inténtalo de nuevo.',
  'loc.err.emptyName': 'Escribe un nombre primero.',

  // Plural words
  'loc.product.one': 'producto',
  'loc.product.other': 'productos',
  'loc.unit.one': 'unidad',
  'loc.unit.other': 'unidades',

  // ---- Placement editor (Asignar productos) ----
  'loc.assign.title': 'Asignar productos',
  'loc.assign.blurb': 'Elige un producto y define cuántas unidades hay en cada locación.',
  'loc.assign.back': 'Volver a locaciones',
  'loc.assign.searchPh': 'Buscar producto o SKU…',
  'loc.assign.searching': 'Buscando…',
  'loc.assign.noResults': 'No se encontraron productos.',
  'loc.assign.pickProduct': 'Busca y elige un producto arriba para asignarlo.',
  'loc.assign.onHand': 'Disponible',
  'loc.assign.placed': 'Asignado',
  'loc.assign.placedMore': 'Has asignado más de lo disponible.',
  'loc.assign.current': 'Locaciones actuales',
  'loc.assign.none': 'Aún no está en ninguna locación.',
  'loc.assign.addHere': 'Agregar a una locación',
  'loc.assign.pickLoc': 'Elige locación…',
  'loc.assign.qty': 'Cant.',
  'loc.assign.add': 'Agregar',
  'loc.assign.remove': 'Quitar',
  'loc.assign.noLocs': 'Este almacén no tiene locaciones todavía. Créalas primero en la pantalla de Locaciones.',
  'loc.assign.toast.saved': 'Guardado.',
  'loc.assign.toast.removed': 'Quitado.',
  'loc.assign.toast.failed': 'Algo salió mal. Inténtalo de nuevo.',
  'loc.assign.toast.pickLoc': 'Elige una locación primero.',
}

const messages: Record<Locale, Messages> = { en, es }

export function tl(locale: Locale, key: string): string {
  return messages[locale][key] ?? messages.en[key] ?? key
}
