// Round 36a — transfer-screen strings (en/es).
//
// Kept as a small companion to lib/i18n/dictionary.ts so the large shared
// dictionary stays untouched. Language still follows role (localeForRole):
// owner/admin -> en, distributor -> es. Reuse plural() + localeForRole() from
// the main dictionary; this module only adds transfer-specific keys.

import type { Locale } from '@/lib/i18n/dictionary'

type Messages = Record<string, string>

const en: Messages = {
  // List page chrome
  'tr.list.title': 'Stock Transfers',
  'tr.list.ownerBlurb': 'Move stock between warehouses. Sent stock waits in transit until received.',
  'tr.list.distBlurb': 'Request stock in or out of your warehouse. Nothing moves until the owner approves.',
  'tr.list.newTransfer': 'New transfer',
  'tr.list.newRequest': 'New request',
  'tr.list.noWh': "You don't have a warehouse assigned yet. Ask the owner to assign you one before requesting transfers.",

  // Section titles
  'tr.sec.pending': 'Pending requests',
  'tr.sec.inTransit': 'In transit',
  'tr.sec.received': 'Received',
  'tr.sec.myRequests': 'My requests',
  'tr.sec.coming': 'Coming to you',
  'tr.sec.sending': 'Sending out',
  'tr.sec.closed': 'Declined / withdrawn',

  // Empty states
  'tr.empty.pending': 'No requests waiting for approval.',
  'tr.empty.inTransit': 'Nothing in transit.',
  'tr.empty.received': 'No received transfers yet.',
  'tr.empty.coming': 'Nothing on its way to you right now.',
  'tr.empty.sending': 'Nothing leaving your warehouse right now.',

  // Status badges
  'tr.status.requested': 'Requested',
  'tr.status.in_transit': 'In transit',
  'tr.status.received': 'Received',
  'tr.status.rejected': 'Declined',
  'tr.status.cancelled': 'Withdrawn',

  // Meta line words
  'tr.meta.requested': 'requested',
  'tr.meta.sent': 'sent',
  'tr.meta.received': 'received',
  'tr.meta.by': 'by',
  'tr.meta.note': 'Note',

  // Request form
  'tr.req.title': 'Request a stock transfer',
  'tr.req.blurb': 'Ask to move stock between your warehouse and another. Nothing moves until the owner approves your request.',
  'tr.req.back': 'Back to transfers',
  'tr.req.detailsTitle': 'Request details',
  'tr.req.direction': 'Direction',
  'tr.req.orderIn': 'Order stock in',
  'tr.req.sendOut': 'Send stock out',
  'tr.req.yourWarehouse': 'Your warehouse',
  'tr.req.fromWhich': 'Order from which warehouse?',
  'tr.req.toWhich': 'Send to which warehouse?',
  'tr.req.choosePh': 'Choose warehouse…',
  'tr.req.notes': 'Notes (optional)',
  'tr.req.notesPh': 'Anything the owner should know about this request.',
  'tr.req.products': 'Products',
  'tr.req.pickFirst': 'Choose a direction and the other warehouse to start adding products.',
  'tr.req.noProducts': 'No products yet. Search above to add what you want to move.',
  'tr.req.colProduct': 'Product',
  'tr.req.colQty': 'Qty to request',
  'tr.req.colOnHand': 'On hand',
  'tr.req.moreThanAvail': '(more than available now)',
  'tr.req.guide': 'The on-hand numbers are a guide only. Your request is reviewed and approved by the owner before any stock actually moves.',
  'tr.req.cancel': 'Cancel',
  'tr.req.submit': 'Submit request',
  'tr.req.submitting': 'Submitting…',
  'tr.req.needWh': 'Choose the other warehouse',
  'tr.req.needProduct': 'Add at least one product',
  'tr.req.confirmTitle': 'Submit this request?',
  'tr.req.requesting': 'Requesting',
  'tr.req.from': 'from',
  'tr.req.to': 'to',
  'tr.req.confirmNote': 'Nothing moves yet. The owner reviews your request and approves some or all of it before any stock leaves the source warehouse.',
  'tr.req.toastSubmitted': 'Request submitted — waiting for owner approval.',
  'tr.req.toastFailed': 'Failed to submit request.',

  // Withdraw button
  'tr.withdraw.button': 'Withdraw',
  'tr.withdraw.title': 'Withdraw this request?',
  'tr.withdraw.body': "This cancels your pending request. Nothing has moved, so there's nothing to undo.",
  'tr.withdraw.keep': 'Keep it',
  'tr.withdraw.doing': 'Withdrawing…',
  'tr.withdraw.toastDone': 'Request withdrawn.',
  'tr.withdraw.toastFailed': 'Failed to withdraw.',

  // Receive button
  'tr.recv.button': 'Receive',
  'tr.recv.title': 'Receive this transfer?',
  'tr.recv.bodyPre': 'This confirms the stock arrived at',
  'tr.recv.bodyPost': "and adds it to that warehouse's inventory at the same cost it left with. It can't be undone.",
  'tr.recv.doing': 'Receiving…',
  'tr.recv.toastDone': 'Transfer received — stock added to the destination.',
  'tr.recv.cancel': 'Cancel',
}

const es: Messages = {
  // List page chrome
  'tr.list.title': 'Transferencias de stock',
  'tr.list.ownerBlurb': 'Mueve stock entre almacenes. El stock enviado queda en tránsito hasta que se recibe.',
  'tr.list.distBlurb': 'Solicita stock para entrar o salir de tu almacén. Nada se mueve hasta que el dueño lo aprueba.',
  'tr.list.newTransfer': 'Nueva transferencia',
  'tr.list.newRequest': 'Nueva solicitud',
  'tr.list.noWh': 'Aún no tienes un almacén asignado. Pide al dueño que te asigne uno antes de solicitar transferencias.',

  // Section titles
  'tr.sec.pending': 'Solicitudes pendientes',
  'tr.sec.inTransit': 'En tránsito',
  'tr.sec.received': 'Recibidas',
  'tr.sec.myRequests': 'Mis solicitudes',
  'tr.sec.coming': 'En camino a ti',
  'tr.sec.sending': 'Enviando',
  'tr.sec.closed': 'Rechazadas / retiradas',

  // Empty states
  'tr.empty.pending': 'No hay solicitudes esperando aprobación.',
  'tr.empty.inTransit': 'Nada en tránsito.',
  'tr.empty.received': 'Aún no hay transferencias recibidas.',
  'tr.empty.coming': 'Nada en camino hacia ti por ahora.',
  'tr.empty.sending': 'Nada saliendo de tu almacén por ahora.',

  // Status badges
  'tr.status.requested': 'Solicitada',
  'tr.status.in_transit': 'En tránsito',
  'tr.status.received': 'Recibida',
  'tr.status.rejected': 'Rechazada',
  'tr.status.cancelled': 'Retirada',

  // Meta line words
  'tr.meta.requested': 'solicitada',
  'tr.meta.sent': 'enviada',
  'tr.meta.received': 'recibida',
  'tr.meta.by': 'por',
  'tr.meta.note': 'Nota',

  // Request form
  'tr.req.title': 'Solicitar una transferencia',
  'tr.req.blurb': 'Pide mover stock entre tu almacén y otro. Nada se mueve hasta que el dueño apruebe tu solicitud.',
  'tr.req.back': 'Volver a transferencias',
  'tr.req.detailsTitle': 'Detalles de la solicitud',
  'tr.req.direction': 'Dirección',
  'tr.req.orderIn': 'Pedir stock (entrada)',
  'tr.req.sendOut': 'Enviar stock (salida)',
  'tr.req.yourWarehouse': 'Tu almacén',
  'tr.req.fromWhich': '¿Desde cuál almacén?',
  'tr.req.toWhich': '¿Hacia cuál almacén?',
  'tr.req.choosePh': 'Elige almacén…',
  'tr.req.notes': 'Notas (opcional)',
  'tr.req.notesPh': 'Algo que el dueño deba saber sobre esta solicitud.',
  'tr.req.products': 'Productos',
  'tr.req.pickFirst': 'Elige una dirección y el otro almacén para empezar a agregar productos.',
  'tr.req.noProducts': 'Aún no hay productos. Busca arriba para agregar lo que quieres mover.',
  'tr.req.colProduct': 'Producto',
  'tr.req.colQty': 'Cant. a solicitar',
  'tr.req.colOnHand': 'Disponible',
  'tr.req.moreThanAvail': '(más de lo disponible ahora)',
  'tr.req.guide': 'Las cantidades disponibles son solo una guía. El dueño revisa y aprueba tu solicitud antes de que se mueva el stock.',
  'tr.req.cancel': 'Cancelar',
  'tr.req.submit': 'Enviar solicitud',
  'tr.req.submitting': 'Enviando…',
  'tr.req.needWh': 'Elige el otro almacén',
  'tr.req.needProduct': 'Agrega al menos un producto',
  'tr.req.confirmTitle': '¿Enviar esta solicitud?',
  'tr.req.requesting': 'Solicitando',
  'tr.req.from': 'desde',
  'tr.req.to': 'hacia',
  'tr.req.confirmNote': 'Nada se mueve todavía. El dueño revisa tu solicitud y aprueba una parte o todo antes de que salga stock del almacén de origen.',
  'tr.req.toastSubmitted': 'Solicitud enviada — esperando la aprobación del dueño.',
  'tr.req.toastFailed': 'No se pudo enviar la solicitud.',

  // Withdraw button
  'tr.withdraw.button': 'Retirar',
  'tr.withdraw.title': '¿Retirar esta solicitud?',
  'tr.withdraw.body': 'Esto cancela tu solicitud pendiente. Nada se ha movido, así que no hay nada que deshacer.',
  'tr.withdraw.keep': 'Mantener',
  'tr.withdraw.doing': 'Retirando…',
  'tr.withdraw.toastDone': 'Solicitud retirada.',
  'tr.withdraw.toastFailed': 'No se pudo retirar.',

  // Receive button
  'tr.recv.button': 'Recibir',
  'tr.recv.title': '¿Recibir esta transferencia?',
  'tr.recv.bodyPre': 'Confirma que el stock llegó a',
  'tr.recv.bodyPost': 'y lo agrega al inventario de ese almacén al mismo costo con que salió. No se puede deshacer.',
  'tr.recv.doing': 'Recibiendo…',
  'tr.recv.toastDone': 'Transferencia recibida — stock agregado al destino.',
  'tr.recv.cancel': 'Cancelar',
}

const messages: Record<Locale, Messages> = { en, es }

export function tt(locale: Locale, key: string): string {
  return messages[locale][key] ?? messages.en[key] ?? key
}
