// Lightweight role-based i18n for the GangaLoo admin app.
//
// Language is decided by ROLE, not a manual toggle:
//   owner / admin        -> English ('en')
//   seller / distributor -> Spanish ('es')
//
// Usage (works in both server and client components — no server-only deps):
//   import { localeForRole, t, plural } from '@/lib/i18n/dictionary'
//   const locale = localeForRole(role)
//   t(locale, 'nav.Sales')                       // -> 'Ventas' for a seller
//   plural(locale, n, 'unit.one', 'unit.other')  // -> 'unidad' / 'unidades'
//
// Missing keys fall back to English, then to the key itself, so a
// forgotten translation degrades gracefully instead of breaking the UI.

import type { Role } from '@/lib/auth/roles'

export type Locale = 'en' | 'es'

export function localeForRole(role: Role): Locale {
  return role === 'seller' || role === 'distributor' ? 'es' : 'en'
}

type Messages = Record<string, string>

const en: Messages = {
  // Sidebar navigation. Key convention: 'nav.' + the navItems label.
  'nav.Dashboard': 'Dashboard',
  'nav.Sales': 'Sales',
  'nav.Online Orders': 'Online Orders',
  'nav.Products': 'Products',
  'nav.Inventory': 'Inventory',
  'nav.Categories': 'Categories',
  'nav.Warehouses': 'Warehouses',
  'nav.Transfers': 'Transfers',
  'nav.Purchases': 'Purchases',
  'nav.Courier Payments': 'Courier Payments',
  'nav.Money Accounts': 'Money Accounts',
  'nav.Commissions': 'Commissions',
  'nav.Seller Cash': 'Seller Cash',
  'nav.Accounting': 'Accounting',
  'nav.Reports': 'Reports',
  'nav.Discount Rules': 'Discount Rules',
  'nav.People': 'People',
  'nav.Users': 'Users',
  'nav.Customers': 'Customers',
  'nav.Distributors': 'Distributors',
  'nav.Settings': 'Settings',

  // Common chrome
  'common.signOut': 'Sign out',
  'common.previous': 'Previous',
  'common.next': 'Next',
  'common.page': 'Page',
  'common.of': 'of',
  'common.cancel': 'Cancel',

  // Order / sale status badges
  'status.draft': 'Draft',
  'status.paid': 'Paid',
  'status.partial': 'Partial',
  'status.partiallyPaid': 'Partially paid',
  'status.confirmed': 'Confirmed',
  'status.cancelled': 'Cancelled',
  'status.refunded': 'Refunded',

  // Role words
  'role.seller': 'seller',
  'role.distributor': 'distributor',

  // Payment methods
  'method.cash': 'Cash',
  'method.card': 'Card',
  'method.transfer': 'Transfer',
  'method.paypal': 'PayPal',
  'method.stripe': 'Stripe',
  'method.credit': 'Credit',
  'method.mixed': 'Mixed',

  // Money account kinds
  'acctKind.bank': 'Bank',
  'acctKind.cash': 'Cash',
  'acctKind.card': 'Card',
  'acctKind.digital': 'Digital',
  'acctKind.credit_line': 'Credit line',

  // Fulfilment methods
  'fulfill.in_store': 'In-store',
  'fulfill.pickup': 'Pickup',
  'fulfill.delivery': 'Delivery',

  // Plural word pairs (use via plural())
  'unit.one': 'unit',
  'unit.other': 'units',
  'product.one': 'product',
  'product.other': 'products',
  'order.one': 'order',
  'order.other': 'orders',
  'sale.one': 'sale',
  'sale.other': 'sales',
  'row.one': 'row',
  'row.other': 'rows',
  'line.one': 'line',
  'line.other': 'lines',

  // Seller dashboard
  'dash.greeting': 'Hi',
  'dash.myDashboard': 'My dashboard',
  'dash.subtitle': "Your commissions, your orders, what you owe the business, and what's in stock.",
  'dash.incomingTransfers': 'Incoming transfers',
  'dash.onTheWay': 'on the way',
  'dash.sent': 'sent',
  'dash.walkIn': 'Walk-in / no customer',
  'dash.owes': 'owes',
  'dash.commissionOwed': 'Commission owed to you',
  'dash.earned': 'earned',
  'dash.paid': 'paid',
  'dash.unpaidOnOrders': 'Unpaid on your orders',
  'dash.businessOwedThis': 'the business is owed this',
  'dash.cashHolding': "Cash you're holding",
  'dash.collectedNotHandedIn': 'collected, not yet handed in',
  'dash.openOrders': 'Open orders',
  'dash.stillOwing': 'still owing',
  'dash.noOpenOrders': 'No open orders — nothing owing right now.',
  'dash.recentOrders': 'Recent orders',
  'dash.total': 'total',
  'dash.noOrders': 'No orders yet.',
  'dash.notYetHandedIn': 'not yet handed in',
  'dash.availableStock': 'Available stock',
  'dash.nothingInStock': 'Nothing in stock.',

  // Sales list page
  'sales.title': 'Sales',
  'sales.subtitle': 'In-person POS sales. Online orders live in their own module.',
  'sales.receivePayment': 'Receive payment',
  'sales.newPosSale': 'New POS sale',
  'sales.noMatch': 'No sales match the current filters.',
  'sales.walkIn': 'Walk-in',

  // Sales table columns
  'sales.col.invoice': 'Invoice',
  'sales.col.date': 'Date',
  'sales.col.status': 'Status',
  'sales.col.customer': 'Customer',
  'sales.col.seller': 'Seller',
  'sales.col.warehouse': 'Warehouse',
  'sales.col.items': 'Items',
  'sales.col.total': 'Total',
  'sales.col.paid': 'Paid',

  // Filters
  'filter.anyStatus': 'Any status',
  'filter.anySeller': 'Any seller',
  'filter.anyWarehouse': 'Any warehouse',
  'filter.from': 'From',
  'filter.to': 'To',
  'filter.clear': 'Clear filters',

  // ---- Sale detail (sd.*) ----
  // Header / actions menu
  'sd.draftPlaceholder': '— (draft)',
  'sd.actions': 'Actions',
  'sd.printReceipt': 'Print receipt',
  'sd.sendWhatsApp': 'Send by WhatsApp',
  'sd.logCashCollected': 'Log cash collected',
  'sd.editProducts': 'Edit products',
  'sd.cancelSale': 'Cancel sale',
  'sd.refundSale': 'Refund sale',
  'sd.sold': 'Sold',
  'sd.confirmedAt': 'confirmed',
  'sd.paidAt': 'paid',
  'sd.totalLabel': 'Total',
  'sd.paidSuffix': 'paid',
  // Fields
  'sd.fulfillment': 'Fulfillment',
  'sd.sourceWarehouse': 'Source warehouse',
  'sd.tracking': 'Tracking',
  'sd.deliveryNotes': 'Delivery notes',
  'sd.noReason': 'no reason given',
  // Cancel dialog
  'sd.cancelTitle': 'Cancel this sale?',
  'sd.cancelDesc': 'The sale will move to cancelled. Stock movements are not reversed. If this sale already had stock pulled, refund it instead.',
  'sd.reasonOptional': 'Reason (optional)',
  'sd.cancelReasonPh': 'Operator error, duplicate entry, …',
  'sd.keepSale': 'Keep sale',
  'sd.cancelling': 'Cancelling…',
  // Refund dialog
  'sd.refundTitle': 'Refund this sale?',
  'sd.refundDesc': 'Status moves to refunded. Audit-trail stock movements are written for every consumed lot. All commissions on this sale are voided (including ones already paid out, which creates a clawback debt).',
  'sd.refundReason': 'Refund reason',
  'sd.refundReasonPh': 'Customer returned product, wrong item, …',
  'sd.restockBold': 'Add stock back to lots.',
  'sd.restockHint': "Uncheck only if the items were damaged or destroyed and won't return to inventory.",
  'sd.refunding': 'Refunding…',
  // Log cash dialog
  'sd.recordsThat': 'Records that',
  'sd.theSeller': 'the seller',
  'sd.logCashHoldingTail': 'is holding this cash for the order. It does not record a payment — the money is booked when you mark it handed in.',
  'sd.logCashSelf': 'Records that you are holding this cash for the order. It does not pay the order off — the owner books it when you hand the cash in.',
  'sd.amountCollected': 'Amount collected (DOP)',
  'sd.outstandingOnOrder': 'Outstanding on this order:',
  'sd.noteOptional': 'Note (optional)',
  'sd.logCashNotePh': 'e.g. collected at delivery',
  'sd.logging': 'Logging…',
  'sd.logCollection': 'Log collection',
  // Items card
  'sd.noLineItems': 'This sale has no line items.',
  'sd.colProduct': 'Product',
  'sd.colQty': 'Qty',
  'sd.colUnitPrice': 'Unit price',
  'sd.colDiscount': 'Discount',
  'sd.colLineTotal': 'Line total',
  'sd.colCogs': 'COGS',
  'sd.fifoConsumption': 'FIFO lot consumption',
  'sd.lot': 'Lot',
  'sd.unitCost': 'Unit cost',
  'sd.subtotalCost': 'Subtotal cost',
  // Totals card
  'sd.totals': 'Totals',
  'sd.subtotal': 'Subtotal',
  'sd.tax': 'Tax',
  'sd.shipping': 'Shipping',
  'sd.outstanding': 'Outstanding',
  'sd.grossProfit': 'Gross profit',
  // Payments panel
  'sd.payments': 'Payments',
  'sd.addPayment': 'Add payment',
  'sd.noPayments': 'No payments recorded.',
  'sd.overpaid': 'Overpaid',
  // Commissions panel
  'sd.commissions': 'Commissions',
  'sd.noCommissions': 'No commissions recorded.',
  'sd.pending': 'Pending',
  'sd.void': 'Void',
  // Add payment dialog
  'sd.addPaymentDesc': 'Records a payment against this sale and updates the paid total.',
  'sd.method': 'Method',
  'sd.amountDop': 'Amount (DOP)',
  'sd.account': 'Account',
  'sd.pickAccount': 'Pick an account…',
  'sd.date': 'Date',
  'sd.reference': 'Reference',
  'sd.referencePh': 'Transfer #, auth code…',
  'sd.recording': 'Recording…',
  'sd.recordPayment': 'Record payment',
  // Toasts
  'sd.toastSaleCancelled': 'Sale cancelled.',
  'sd.toastRefundReasonRequired': 'Refund reason is required.',
  'sd.toastRefundedRestock': 'Sale refunded and stock returned to lots.',
  'sd.toastRefunded': 'Sale refunded.',
  'sd.toastCashLogged': 'Cash collection logged.',
  'sd.toastAmountPositive': 'Amount must be greater than zero.',
  'sd.toastPickAccount': 'Pick a money account.',
  'sd.toastPaymentRecorded': 'Payment recorded.',
}

const es: Messages = {
  // Sidebar navigation
  'nav.Dashboard': 'Panel',
  'nav.Sales': 'Ventas',
  'nav.Online Orders': 'Pedidos en línea',
  'nav.Products': 'Productos',
  'nav.Inventory': 'Inventario',
  'nav.Categories': 'Categorías',
  'nav.Warehouses': 'Almacenes',
  'nav.Transfers': 'Transferencias',
  'nav.Purchases': 'Compras',
  'nav.Courier Payments': 'Pagos de mensajería',
  'nav.Money Accounts': 'Cuentas de dinero',
  'nav.Commissions': 'Comisiones',
  'nav.Seller Cash': 'Efectivo de vendedores',
  'nav.Accounting': 'Contabilidad',
  'nav.Reports': 'Reportes',
  'nav.Discount Rules': 'Reglas de descuento',
  'nav.People': 'Personas',
  'nav.Users': 'Usuarios',
  'nav.Customers': 'Clientes',
  'nav.Distributors': 'Distribuidores',
  'nav.Settings': 'Configuración',

  // Common chrome
  'common.signOut': 'Cerrar sesión',
  'common.previous': 'Anterior',
  'common.next': 'Siguiente',
  'common.page': 'Página',
  'common.of': 'de',
  'common.cancel': 'Cancelar',

  // Order / sale status badges
  'status.draft': 'Borrador',
  'status.paid': 'Pagado',
  'status.partial': 'Parcial',
  'status.partiallyPaid': 'Pagado parcial',
  'status.confirmed': 'Confirmado',
  'status.cancelled': 'Cancelado',
  'status.refunded': 'Reembolsado',

  // Role words
  'role.seller': 'vendedor',
  'role.distributor': 'distribuidor',

  // Payment methods
  'method.cash': 'Efectivo',
  'method.card': 'Tarjeta',
  'method.transfer': 'Transferencia',
  'method.paypal': 'PayPal',
  'method.stripe': 'Stripe',
  'method.credit': 'Crédito',
  'method.mixed': 'Mixto',

  // Money account kinds
  'acctKind.bank': 'Banco',
  'acctKind.cash': 'Efectivo',
  'acctKind.card': 'Tarjeta',
  'acctKind.digital': 'Digital',
  'acctKind.credit_line': 'Línea de crédito',

  // Fulfilment methods
  'fulfill.in_store': 'En tienda',
  'fulfill.pickup': 'Recogida',
  'fulfill.delivery': 'Entrega a domicilio',

  // Plural word pairs
  'unit.one': 'unidad',
  'unit.other': 'unidades',
  'product.one': 'producto',
  'product.other': 'productos',
  'order.one': 'pedido',
  'order.other': 'pedidos',
  'sale.one': 'venta',
  'sale.other': 'ventas',
  'row.one': 'fila',
  'row.other': 'filas',
  'line.one': 'línea',
  'line.other': 'líneas',

  // Seller dashboard
  'dash.greeting': 'Hola',
  'dash.myDashboard': 'Mi panel',
  'dash.subtitle': 'Tus comisiones, tus pedidos, lo que le debes al negocio y lo que hay en stock.',
  'dash.incomingTransfers': 'Transferencias entrantes',
  'dash.onTheWay': 'en camino',
  'dash.sent': 'enviado',
  'dash.walkIn': 'Sin cliente / mostrador',
  'dash.owes': 'debe',
  'dash.commissionOwed': 'Comisión que se te debe',
  'dash.earned': 'ganado',
  'dash.paid': 'pagado',
  'dash.unpaidOnOrders': 'Sin pagar en tus pedidos',
  'dash.businessOwedThis': 'el negocio cobra esto',
  'dash.cashHolding': 'Efectivo que tienes',
  'dash.collectedNotHandedIn': 'cobrado, aún no entregado',
  'dash.openOrders': 'Pedidos abiertos',
  'dash.stillOwing': 'con saldo pendiente',
  'dash.noOpenOrders': 'No hay pedidos abiertos — nada pendiente ahora.',
  'dash.recentOrders': 'Pedidos recientes',
  'dash.total': 'en total',
  'dash.noOrders': 'Aún no hay pedidos.',
  'dash.notYetHandedIn': 'aún sin entregar',
  'dash.availableStock': 'Stock disponible',
  'dash.nothingInStock': 'Nada en stock.',

  // Sales list page
  'sales.title': 'Ventas',
  'sales.subtitle': 'Ventas POS en persona. Los pedidos en línea están en su propio módulo.',
  'sales.receivePayment': 'Recibir pago',
  'sales.newPosSale': 'Nueva venta POS',
  'sales.noMatch': 'Ninguna venta coincide con los filtros actuales.',
  'sales.walkIn': 'Mostrador',

  // Sales table columns
  'sales.col.invoice': 'Factura',
  'sales.col.date': 'Fecha',
  'sales.col.status': 'Estado',
  'sales.col.customer': 'Cliente',
  'sales.col.seller': 'Vendedor',
  'sales.col.warehouse': 'Almacén',
  'sales.col.items': 'Artículos',
  'sales.col.total': 'Total',
  'sales.col.paid': 'Pagado',

  // Filters
  'filter.anyStatus': 'Cualquier estado',
  'filter.anySeller': 'Cualquier vendedor',
  'filter.anyWarehouse': 'Cualquier almacén',
  'filter.from': 'Desde',
  'filter.to': 'Hasta',
  'filter.clear': 'Limpiar filtros',

  // ---- Sale detail (sd.*) ----
  // Header / actions menu
  'sd.draftPlaceholder': '— (borrador)',
  'sd.actions': 'Acciones',
  'sd.printReceipt': 'Imprimir recibo',
  'sd.sendWhatsApp': 'Enviar por WhatsApp',
  'sd.logCashCollected': 'Registrar efectivo cobrado',
  'sd.editProducts': 'Editar productos',
  'sd.cancelSale': 'Cancelar venta',
  'sd.refundSale': 'Reembolsar venta',
  'sd.sold': 'Vendido',
  'sd.confirmedAt': 'confirmado',
  'sd.paidAt': 'pagado',
  'sd.totalLabel': 'Total',
  'sd.paidSuffix': 'pagado',
  // Fields
  'sd.fulfillment': 'Entrega',
  'sd.sourceWarehouse': 'Almacén de origen',
  'sd.tracking': 'Seguimiento',
  'sd.deliveryNotes': 'Notas de entrega',
  'sd.noReason': 'sin motivo',
  // Cancel dialog
  'sd.cancelTitle': '¿Cancelar esta venta?',
  'sd.cancelDesc': 'La venta pasará a cancelada. Los movimientos de stock no se revierten. Si esta venta ya descontó stock, mejor reembólsala.',
  'sd.reasonOptional': 'Motivo (opcional)',
  'sd.cancelReasonPh': 'Error de operador, entrada duplicada, …',
  'sd.keepSale': 'Mantener venta',
  'sd.cancelling': 'Cancelando…',
  // Refund dialog
  'sd.refundTitle': '¿Reembolsar esta venta?',
  'sd.refundDesc': 'El estado pasa a reembolsada. Se registran movimientos de stock (para auditoría) por cada lote consumido. Todas las comisiones de esta venta se anulan (incluidas las ya pagadas, lo que genera una deuda por recuperar).',
  'sd.refundReason': 'Motivo del reembolso',
  'sd.refundReasonPh': 'El cliente devolvió el producto, artículo equivocado, …',
  'sd.restockBold': 'Devolver el stock a los lotes.',
  'sd.restockHint': 'Desmarca solo si los artículos se dañaron o destruyeron y no volverán al inventario.',
  'sd.refunding': 'Reembolsando…',
  // Log cash dialog
  'sd.recordsThat': 'Registra que',
  'sd.theSeller': 'el vendedor',
  'sd.logCashHoldingTail': 'tiene este efectivo para el pedido. No registra un pago — el dinero se contabiliza cuando marcas que fue entregado.',
  'sd.logCashSelf': 'Registra que tú tienes este efectivo para el pedido. No salda el pedido — el dueño lo contabiliza cuando entregas el efectivo.',
  'sd.amountCollected': 'Monto cobrado (DOP)',
  'sd.outstandingOnOrder': 'Pendiente en este pedido:',
  'sd.noteOptional': 'Nota (opcional)',
  'sd.logCashNotePh': 'p. ej. cobrado en la entrega',
  'sd.logging': 'Registrando…',
  'sd.logCollection': 'Registrar cobro',
  // Items card
  'sd.noLineItems': 'Esta venta no tiene artículos.',
  'sd.colProduct': 'Producto',
  'sd.colQty': 'Cant.',
  'sd.colUnitPrice': 'Precio unit.',
  'sd.colDiscount': 'Descuento',
  'sd.colLineTotal': 'Total línea',
  'sd.colCogs': 'Costo',
  'sd.fifoConsumption': 'Consumo de lotes FIFO',
  'sd.lot': 'Lote',
  'sd.unitCost': 'Costo unit.',
  'sd.subtotalCost': 'Costo subtotal',
  // Totals card
  'sd.totals': 'Totales',
  'sd.subtotal': 'Subtotal',
  'sd.tax': 'Impuesto',
  'sd.shipping': 'Envío',
  'sd.outstanding': 'Pendiente',
  'sd.grossProfit': 'Ganancia bruta',
  // Payments panel
  'sd.payments': 'Pagos',
  'sd.addPayment': 'Agregar pago',
  'sd.noPayments': 'Sin pagos registrados.',
  'sd.overpaid': 'Pagado de más',
  // Commissions panel
  'sd.commissions': 'Comisiones',
  'sd.noCommissions': 'Sin comisiones registradas.',
  'sd.pending': 'Pendiente',
  'sd.void': 'Anulado',
  // Add payment dialog
  'sd.addPaymentDesc': 'Registra un pago de esta venta y actualiza el total pagado.',
  'sd.method': 'Método',
  'sd.amountDop': 'Monto (DOP)',
  'sd.account': 'Cuenta',
  'sd.pickAccount': 'Elige una cuenta…',
  'sd.date': 'Fecha',
  'sd.reference': 'Referencia',
  'sd.referencePh': '# de transferencia, código…',
  'sd.recording': 'Registrando…',
  'sd.recordPayment': 'Registrar pago',
  // Toasts
  'sd.toastSaleCancelled': 'Venta cancelada.',
  'sd.toastRefundReasonRequired': 'El motivo del reembolso es obligatorio.',
  'sd.toastRefundedRestock': 'Venta reembolsada y stock devuelto a los lotes.',
  'sd.toastRefunded': 'Venta reembolsada.',
  'sd.toastCashLogged': 'Cobro de efectivo registrado.',
  'sd.toastAmountPositive': 'El monto debe ser mayor que cero.',
  'sd.toastPickAccount': 'Elige una cuenta de dinero.',
  'sd.toastPaymentRecorded': 'Pago registrado.',
}

const messages: Record<Locale, Messages> = { en, es }

export function t(locale: Locale, key: string): string {
  return messages[locale][key] ?? messages.en[key] ?? key
}

export function plural(
  locale: Locale,
  n: number,
  oneKey: string,
  otherKey: string,
): string {
  return t(locale, n === 1 ? oneKey : otherKey)
}
