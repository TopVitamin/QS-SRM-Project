import { daysBetween } from '../domain/format'
import { round2 } from '../domain/money'
import { enterpriseUser } from '../domain/identities'
import type { Appointment, ErpNotice, ErpReturn, Invoice, KittingRecord, OrderChange, PurchaseOrder, PushJob, Shipment, Suggestion } from '../domain/types'
import type {
  AdmissionView,
  AppointmentView,
  ChangeDetail,
  ChangeView,
  InvoiceRequestView,
  InvoiceView,
  KittingView,
  NoticeView,
  OrderDetail,
  OrderView,
  PushJobView,
  ReconView,
  RedLetterView,
  ReturnView,
  ShipmentDetail,
  ShipmentView,
  ShippableOrder,
  SuggestionView,
  SupplierBrief,
  SupplierDetail,
  SupplierView,
} from '../domain/views'
import { BizError, canSee, findSupplier, isSupplierActor, type Ctx } from './core'
import { getRecon, getRequest, invoiceActions, reconActions, redActions, redEffectiveStatus, requestActions } from './finance'
import {
  changeActions,
  getChange,
  getOrder,
  kittingActions,
  orderActions,
  pushJobActions,
  suggestionActions,
} from './orders'
import {
  CONFIRM_LIMIT,
  activeAppointment,
  appointmentFinished,
  invoiceRemaining,
  lineQty,
  orderAlerts,
  receiptStatusOf,
  requestStatus,
  shipmentErpStatus,
  unfinishedChange,
} from './rules'
import { appointmentActions, boxActions, getShipment, returnActions, shipmentActions } from './shipments'
import { admissionActions, getSupplier, supplierActions } from './suppliers'

const byNewest = <T extends { createdAt: number }>(a: T, b: T) => b.createdAt - a.createdAt

export function supplierBrief(ctx: Ctx, code: string): SupplierBrief {
  const s = findSupplier(ctx, code)
  return { code: s.code, name: s.name, shortName: s.shortName, portalStatus: s.portalStatus, tier: s.tier }
}

const supplierName = (ctx: Ctx, code: string) => ctx.db.suppliers.find((s) => s.code === code)?.name ?? code
const warehouseName = (ctx: Ctx, code: string) => ctx.db.warehouses.find((w) => w.code === code)?.name ?? code

// ---------------------------------------------------------------- 采购订单

export function orderView(ctx: Ctx, order: PurchaseOrder): OrderView {
  const quantities = lineQty(ctx.db, order)
  const change = unfinishedChange(ctx.db, order.id)
  const effect = change && (change.status === 'pushing' || change.status === 'failed') ? change : undefined
  const proxy =
    ctx.db.confirmations.some((c) => c.orderId === order.id && c.proxy) ||
    ctx.db.shipments.some((s) => s.orderId === order.id && s.proxy) ||
    ctx.db.suggestions.some((s) => s.orderId === order.id && s.proxy)
  const pushJob = order.pushJobId ? ctx.db.pushJobs.find((j) => j.id === order.pushJobId) : undefined
  const view: OrderView = {
    ...order,
    supplier: supplierBrief(ctx, order.supplierCode),
    warehouseName: warehouseName(ctx, order.warehouseCode),
    totals: {
      qty: order.lines.reduce((t, l) => t + l.qty, 0),
      amount: round2(order.lines.reduce((t, l) => t + l.amount, 0)),
      tax: round2(order.lines.reduce((t, l) => t + l.tax, 0)),
      netAmount: round2(order.lines.reduce((t, l) => t + l.netAmount, 0)),
    },
    receiptStatus: receiptStatusOf(quantities),
    lineQty: quantities,
    confirmDeadline: order.confirmStatus === 'pending' && order.sentAt ? order.sentAt + CONFIRM_LIMIT : undefined,
    overdue24h: order.confirmStatus === 'pending' && !!order.sentAt && ctx.now - order.sentAt > CONFIRM_LIMIT && order.bizStatus === 'open',
    pendingSuggestions: ctx.db.suggestions.filter((s) => s.orderId === order.id && s.status === 'pending').length,
    pendingEffect: effect && {
      changeId: effect.id,
      changeNo: effect.no,
      status: effect.status,
      items: effect.items,
      promisedDate: effect.items.find((i) => i.field === 'promisedDate')?.after as string | undefined,
    },
    unfinishedChange: change && { id: change.id, no: change.no, status: change.status },
    proxy,
    alerts: orderAlerts(ctx.db, order, ctx.config, ctx.now),
    pushJob,
    actions: orderActions(ctx, order),
  }
  if (isSupplierActor(ctx)) {
    view.rejectComment = undefined
    view.lastCheck = undefined
    view.pushJob = undefined
    view.erp = undefined
    view.unfinishedChange = undefined
    if (view.pendingEffect) view.pendingEffect = { ...view.pendingEffect, changeId: '', changeNo: '' }
  }
  return view
}

export function listOrders(ctx: Ctx) {
  return ctx.db.orders
    .filter((o) => canSee(ctx, o.supplierCode) && (!isSupplierActor(ctx) || o.confirmStatus !== 'notSent'))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((o) => orderView(ctx, o))
}

export function orderDetail(ctx: Ctx, id: string): OrderDetail {
  const order = getOrder(ctx, id)
  const supplier = isSupplierActor(ctx)
  return {
    ...orderView(ctx, order),
    confirmations: ctx.db.confirmations.filter((c) => c.orderId === order.id).sort((a, b) => a.at - b.at),
    changes: supplier ? [] : ctx.db.changes.filter((c) => c.orderId === order.id).sort(byNewest).map((c) => changeView(ctx, c)),
    suggestions: ctx.db.suggestions.filter((s) => s.orderId === order.id).sort((a, b) => b.submittedAt - a.submittedAt).map((s) => suggestionView(ctx, s)),
    kitting: ctx.db.kitting
      .filter((k) => k.orderId === order.id)
      .sort((a, b) => b.reportedAt - a.reportedAt)
      .map((k) => kittingView(ctx, k)),
    shipments: ctx.db.shipments.filter((s) => s.orderId === order.id).sort(byNewest).map((s) => shipmentView(ctx, s)),
    notices: ctx.db.notices.filter((n) => n.orderId === order.id),
    receipts: ctx.db.receipts.filter((r) => r.orderId === order.id),
    returns: ctx.db.returns.filter((r) => r.orderId === order.id).map((r) => returnView(ctx, r)),
    pushJobs: supplier ? [] : ctx.db.pushJobs.filter((j) => j.orderId === order.id).sort(byNewest),
  }
}

export function kittingView(ctx: Ctx, record: KittingRecord): KittingView {
  const order = ctx.db.orders.find((o) => o.id === record.orderId)
  return {
    ...record,
    skuName: order?.lines.find((l) => l.lineNo === record.lineNo)?.skuName ?? '',
    supplierName: supplierName(ctx, record.supplierCode),
    actions: kittingActions(ctx, record),
  }
}

export function listKitting(ctx: Ctx) {
  if (isSupplierActor(ctx)) throw new BizError('无权查看', 403)
  return ctx.db.kitting
    .filter((k) => canSee(ctx, k.supplierCode))
    .sort((a, b) => b.reportedAt - a.reportedAt)
    .map((k) => kittingView(ctx, k))
}

// ---------------------------------------------------------------- 变更、建议、推送

export function changeView(ctx: Ctx, change: OrderChange): ChangeView {
  return {
    ...change,
    supplierName: supplierName(ctx, change.supplierCode),
    pushJob: change.pushJobId ? ctx.db.pushJobs.find((j) => j.id === change.pushJobId) : undefined,
    actions: changeActions(ctx, change),
  }
}

export function listChanges(ctx: Ctx) {
  if (isSupplierActor(ctx)) throw new BizError('无权查看', 403)
  return ctx.db.changes.filter((c) => canSee(ctx, c.supplierCode)).sort(byNewest).map((c) => changeView(ctx, c))
}

export function changeDetail(ctx: Ctx, id: string): ChangeDetail {
  const change = getChange(ctx, id)
  const order = getOrder(ctx, change.orderId)
  return {
    ...changeView(ctx, change),
    order: orderView(ctx, order),
    suggestion: change.suggestionId ? ctx.db.suggestions.find((s) => s.id === change.suggestionId) : undefined,
  }
}

export function suggestionView(ctx: Ctx, suggestion: Suggestion): SuggestionView {
  const order = ctx.db.orders.find((o) => o.id === suggestion.orderId)
  return {
    ...suggestion,
    supplierName: supplierName(ctx, suggestion.supplierCode),
    delayDays: daysBetween(suggestion.currentDate, suggestion.suggestedDate),
    orderPromisedDate: order?.promisedDate ?? '',
    actions: suggestionActions(ctx, suggestion),
  }
}

export function listSuggestions(ctx: Ctx) {
  return ctx.db.suggestions
    .filter((s) => canSee(ctx, s.supplierCode))
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .map((s) => suggestionView(ctx, s))
}

export function pushJobView(ctx: Ctx, job: PushJob): PushJobView {
  return { ...job, supplierName: supplierName(ctx, job.supplierCode), actions: pushJobActions(ctx, job) }
}

export function listPushJobs(ctx: Ctx) {
  if (isSupplierActor(ctx)) throw new BizError('无权查看', 403)
  return ctx.db.pushJobs
    .filter((j) => canSee(ctx, j.supplierCode))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((j) => pushJobView(ctx, j))
}

// ---------------------------------------------------------------- 发货、预约、收货

export function shipmentView(ctx: Ctx, shipment: Shipment): ShipmentView {
  const supplier = findSupplier(ctx, shipment.supplierCode)
  const notice = shipment.noticeId ? ctx.db.notices.find((n) => n.id === shipment.noticeId) : undefined
  return {
    ...shipment,
    supplierName: supplier.name,
    supplierPortal: supplier.portalStatus,
    warehouseName: warehouseName(ctx, shipment.warehouseCode),
    erpStatus: shipmentErpStatus(ctx.db, shipment),
    totalQty: shipment.lines.reduce((t, l) => t + l.qty, 0),
    boxCount: ctx.db.boxes.filter((b) => b.shipmentId === shipment.id && b.status === 'valid').length,
    notice,
    receipt: notice?.receiptId ? ctx.db.receipts.find((r) => r.id === notice.receiptId) : undefined,
    appointment: activeAppointment(ctx.db, shipment.id),
    pushJob: isSupplierActor(ctx) ? undefined : shipment.pushJobId ? ctx.db.pushJobs.find((j) => j.id === shipment.pushJobId) : undefined,
    actions: shipmentActions(ctx, shipment),
  }
}

export function listShipments(ctx: Ctx) {
  return ctx.db.shipments.filter((s) => canSee(ctx, s.supplierCode)).sort(byNewest).map((s) => shipmentView(ctx, s))
}

export function shipmentDetail(ctx: Ctx, id: string): ShipmentDetail {
  const shipment = getShipment(ctx, id)
  const order = getOrder(ctx, shipment.orderId)
  return {
    ...shipmentView(ctx, shipment),
    boxes: ctx.db.boxes
      .filter((b) => b.shipmentId === shipment.id)
      .sort((a, b) => a.lineNo - b.lineNo || a.seq - b.seq || a.createdAt - b.createdAt)
      .map((b) => ({ ...b, actions: boxActions(ctx, b) })),
    lineQty: lineQty(ctx.db, order),
    order: { id: order.id, no: order.no, promisedDate: order.promisedDate, bizStatus: order.bizStatus, confirmStatus: order.confirmStatus },
  }
}

export function shippableOrders(ctx: Ctx, supplierCode?: string): ShippableOrder[] {
  return ctx.db.orders
    .filter((o) => o.auditStatus === 'approved' && canSee(ctx, o.supplierCode) && o.confirmStatus !== 'notSent')
    .filter((o) => !supplierCode || o.supplierCode === supplierCode)
    .filter((o) => !orderActions(ctx, o).ship.hidden)
    .sort((a, b) => a.promisedDate.localeCompare(b.promisedDate))
    .map((o) => {
      const quantities = lineQty(ctx.db, o)
      return {
        id: o.id,
        no: o.no,
        supplierCode: o.supplierCode,
        supplierName: o.supplierName,
        warehouseCode: o.warehouseCode,
        warehouseName: warehouseName(ctx, o.warehouseCode),
        promisedDate: o.promisedDate,
        lines: o.lines.map((l) => ({ ...l, ...quantities.find((q) => q.lineNo === l.lineNo)! })),
        ship: orderActions(ctx, o).ship,
      }
    })
}

export function appointmentView(ctx: Ctx, appointment: Appointment): AppointmentView {
  return {
    ...appointment,
    supplierName: supplierName(ctx, appointment.supplierCode),
    warehouseName: warehouseName(ctx, appointment.warehouseCode),
    finished: appointmentFinished(ctx.db, appointment),
    actions: appointmentActions(ctx, appointment),
  }
}

export function listAppointments(ctx: Ctx) {
  return ctx.db.appointments
    .filter((a) => canSee(ctx, a.supplierCode))
    .sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot))
    .map((a) => appointmentView(ctx, a))
}

export function noticeView(ctx: Ctx, notice: ErpNotice): NoticeView {
  const receipt = notice.receiptId ? ctx.db.receipts.find((r) => r.id === notice.receiptId) : undefined
  return {
    ...notice,
    supplierName: supplierName(ctx, notice.supplierCode),
    warehouseName: warehouseName(ctx, notice.warehouseCode),
    receipt,
    noticeQty: notice.lines.reduce((t, l) => t + l.qty, 0),
    receivedQty: receipt?.lines.reduce((t, l) => t + l.qty, 0) ?? 0,
  }
}

export function listNotices(ctx: Ctx) {
  return ctx.db.notices.filter((n) => canSee(ctx, n.supplierCode)).sort(byNewest).map((n) => noticeView(ctx, n))
}

export function returnView(ctx: Ctx, item: ErpReturn): ReturnView {
  return { ...item, supplierName: supplierName(ctx, item.supplierCode), actions: returnActions(ctx, item) }
}

export function listReturns(ctx: Ctx) {
  return ctx.db.returns.filter((r) => canSee(ctx, r.supplierCode)).sort(byNewest).map((r) => returnView(ctx, r))
}

export function listReceipts(ctx: Ctx) {
  return ctx.db.receipts
    .filter((r) => canSee(ctx, r.supplierCode))
    .sort(byNewest)
    .map((r) => ({ ...r, supplierName: supplierName(ctx, r.supplierCode), warehouseName: warehouseName(ctx, r.warehouseCode) }))
}

// ---------------------------------------------------------------- 对账和发票

export function reconView(ctx: Ctx, recon: Parameters<typeof reconActions>[1]): ReconView {
  const request = ctx.db.invoiceRequests.find((r) => r.reconciliationId === recon.id)
  return {
    ...recon,
    supplierName: supplierName(ctx, recon.supplierCode),
    request: request && { id: request.id, no: request.no },
    actions: reconActions(ctx, recon),
  }
}

export function listRecons(ctx: Ctx) {
  return ctx.db.reconciliations
    .filter((r) => canSee(ctx, r.supplierCode))
    .filter((r) => !isSupplierActor(ctx) || r.status !== 'drafted' || r.initiator === 'supplier')
    .sort(byNewest)
    .map((r) => reconView(ctx, r))
}

export function reconDetail(ctx: Ctx, id: string) {
  return reconView(ctx, getRecon(ctx, id))
}

export function invoiceView(ctx: Ctx, invoice: Invoice): InvoiceView {
  const active = ctx.db.redLetters.find(
    (r) => r.blueInvoiceId === invoice.id && (redEffectiveStatus(r, ctx.now) === 'waiting' || r.status === 'confirmed'),
  )
  return {
    ...invoice,
    supplierName: supplierName(ctx, invoice.supplierCode),
    remaining: invoice.kind === 'blue' ? invoiceRemaining(invoice) : 0,
    activeRed: active && { id: active.id, status: redEffectiveStatus(active, ctx.now) },
    actions: invoiceActions(ctx, invoice),
  }
}

export function listInvoices(ctx: Ctx) {
  return ctx.db.invoices
    .filter((i) => canSee(ctx, i.supplierCode))
    .sort((a, b) => b.registeredAt - a.registeredAt)
    .map((i) => invoiceView(ctx, i))
}

export function requestView(ctx: Ctx, request: Parameters<typeof requestActions>[1]): InvoiceRequestView {
  return {
    ...request,
    supplierName: supplierName(ctx, request.supplierCode),
    status: requestStatus(ctx.db, request),
    invoices: ctx.db.invoices.filter((i) => i.requestId === request.id).map((i) => invoiceView(ctx, i)),
    actions: requestActions(ctx, request),
  }
}

export function listRequests(ctx: Ctx) {
  return ctx.db.invoiceRequests.filter((r) => canSee(ctx, r.supplierCode)).sort(byNewest).map((r) => requestView(ctx, r))
}

export function requestDetail(ctx: Ctx, id: string) {
  return requestView(ctx, getRequest(ctx, id))
}

export function redView(ctx: Ctx, red: Parameters<typeof redActions>[1]): RedLetterView {
  return {
    ...red,
    supplierName: supplierName(ctx, red.supplierCode),
    effectiveStatus: redEffectiveStatus(red, ctx.now),
    actions: redActions(ctx, red),
  }
}

export function listRedLetters(ctx: Ctx) {
  return ctx.db.redLetters.filter((r) => canSee(ctx, r.supplierCode)).sort(byNewest).map((r) => redView(ctx, r))
}

// ---------------------------------------------------------------- 供应商和准入

export function supplierView(ctx: Ctx, code: string): SupplierView {
  const supplier = getSupplier(ctx, code)
  return {
    ...supplier,
    assignedBuyerName: supplier.assignedBuyerId ? enterpriseUser(supplier.assignedBuyerId)?.name : undefined,
    openOrders: ctx.db.orders.filter((o) => o.supplierCode === code && o.auditStatus === 'approved' && o.bizStatus === 'open').length,
    actions: supplierActions(ctx, supplier),
  }
}

export function listSuppliers(ctx: Ctx) {
  return ctx.db.suppliers.filter((s) => canSee(ctx, s.code)).map((s) => supplierView(ctx, s.code))
}

export function supplierDetail(ctx: Ctx, code: string): SupplierDetail {
  const view = supplierView(ctx, code)
  const enterprise = !isSupplierActor(ctx)
  return {
    ...view,
    portalUsers: ctx.db.portalUsers.filter((u) => u.supplierCode === code),
    prices: enterprise
      ? ctx.db.prices
          .filter((p) => p.supplierCode === code)
          .map((p) => {
            const sku = ctx.db.skus.find((s) => s.code === p.skuCode)
            return { ...p, skuName: sku?.name ?? '', unit: sku?.unit ?? '' }
          })
      : [],
    recentOrders: enterprise
      ? ctx.db.orders
          .filter((o) => o.supplierCode === code)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 8)
          .map((o) => ({ id: o.id, no: o.no, promisedDate: o.promisedDate, confirmStatus: o.confirmStatus, bizStatus: o.bizStatus }))
      : [],
  }
}

export function supplierPrices(ctx: Ctx, code: string) {
  const supplier = getSupplier(ctx, code)
  return {
    supplierCode: supplier.code,
    skus: ctx.db.skus.map((sku) => ({ ...sku, price: ctx.db.prices.find((p) => p.supplierCode === code && p.skuCode === sku.code) })),
  }
}

export function admissionView(ctx: Ctx, admission: Parameters<typeof admissionActions>[1]): AdmissionView {
  return { ...admission, actions: admissionActions(ctx, admission) }
}

export function listAdmissions(ctx: Ctx) {
  if (isSupplierActor(ctx)) throw new BizError('无权查看', 403)
  return [...ctx.db.admissions].sort((a, b) => b.updatedAt - a.updatedAt).map((a) => admissionView(ctx, a))
}

export function assertEnterprise(ctx: Ctx) {
  if (isSupplierActor(ctx)) throw new BizError('无权查看', 403)
}
