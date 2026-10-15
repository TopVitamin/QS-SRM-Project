import { daysBetween, todayStr } from '../domain/format'
import { statusDef } from '../domain/labels'
import type { AuditLog, ErpReceipt, PurchaseOrder } from '../domain/types'
import type {
  AlertView,
  DashboardCard,
  DashboardData,
  NavBadges,
  PerformanceRow,
  PortalDashboard,
  TraceNode,
  TraceResult,
} from '../domain/views'
import { BizError, canSee, isSupplierActor, type Ctx } from './core'
import { redEffectiveStatus } from './finance'
import { CONFIRM_LIMIT, latestKitting, lineQty, orderAlerts, receiptStatusOf, requestStatus, shipmentErpStatus } from './rules'
import { listOrders, supplierBrief } from './views'

const alertMessages = {
  nearDue: '距承诺交期不足预警天数，齐套未完成',
  overdue: '已过承诺交期，尚未全部入库',
  unconfirmed24h: '下发超过24小时仍未确认',
}

export function listAlerts(ctx: Ctx): AlertView[] {
  const today = todayStr(ctx.now)
  const rows: AlertView[] = []
  for (const order of ctx.db.orders) {
    if (!canSee(ctx, order.supplierCode)) continue
    const kinds = orderAlerts(ctx.db, order, ctx.config, ctx.now)
    if (!kinds.length) continue
    const quantities = lineQty(ctx.db, order)
    const kitting = order.lines
      .map((line) => {
        const record = latestKitting(ctx.db, order.id, line.lineNo)
        if (!record) return `第${line.lineNo}行未反馈`
        return record.status === '缺料'
          ? `第${line.lineNo}行缺料：${record.materialName}，预计${record.expectedDate}到料`
          : `第${line.lineNo}行已齐套`
      })
      .join('；')
    for (const kind of kinds) {
      rows.push({
        kind,
        orderId: order.id,
        orderNo: order.no,
        supplierCode: order.supplierCode,
        supplierName: order.supplierName,
        promisedDate: order.promisedDate,
        daysLeft: daysBetween(today, order.promisedDate),
        confirmStatus: order.confirmStatus,
        receiptStatus: receiptStatusOf(quantities),
        kittingSummary: kitting,
        message: alertMessages[kind],
        sentAt: order.sentAt,
      })
    }
  }
  const rank = { overdue: 0, unconfirmed24h: 1, nearDue: 2 }
  return rows.sort((a, b) => rank[a.kind] - rank[b.kind] || a.daysLeft - b.daysLeft)
}

function card(key: string, label: string, count: number, link: string, roles: string[], tone: DashboardCard['tone']): DashboardCard {
  return { key, label, count, link, roles, tone }
}

export function dashboard(ctx: Ctx): DashboardData {
  if (isSupplierActor(ctx)) throw new BizError('无权查看', 403)
  const db = ctx.db
  const visible = <T extends { supplierCode: string }>(rows: T[]) => rows.filter((r) => canSee(ctx, r.supplierCode))
  const orders = visible(db.orders)
  const alerts = listAlerts(ctx)
  const cards = [
    card('approveOrders', '待审核采购订单', orders.filter((o) => o.auditStatus === 'pending').length, '/buyer/approvals', ['buyer'], 'orange'),
    card('approveChanges', '待审核订单变更', visible(db.changes).filter((c) => c.status === 'pending').length, '/buyer/approvals?tab=changes', ['buyer'], 'orange'),
    card('pushFailed', 'ERP推送失败', visible(db.pushJobs).filter((j) => j.status === 'failed').length, '/buyer/erp-sync?status=failed', ['buyer'], 'red'),
    card('unconfirmed', '超24小时未确认', orders.filter((o) => o.confirmStatus === 'pending' && o.bizStatus === 'open' && o.sentAt && ctx.now - o.sentAt > CONFIRM_LIMIT).length, '/buyer/orders?flag=overdue24h', ['buyer'], 'red'),
    card('suggestions', '交期建议待处理', visible(db.suggestions).filter((s) => s.status === 'pending').length, '/buyer/suggestions', ['buyer'], 'violet'),
    card('refused', '供应商拒绝', orders.filter((o) => o.confirmStatus === 'rejected' && o.bizStatus === 'open').length, '/buyer/orders?confirm=rejected', ['buyer'], 'red'),
    card('alerts', '交付预警', alerts.length, '/buyer/alerts', ['buyer', 'planner', 'quality'], 'orange'),
    card('kittingReview', '缺料待品质复核', visible(db.kitting).filter((k) => k.status === '缺料' && !k.review).length, '/buyer/alerts?tab=kitting', ['quality'], 'blue'),
    card('appointments', '预约待仓库确认', visible(db.appointments).filter((a) => a.status === 'pending').length, '/buyer/appointments', ['warehouse'], 'orange'),
    card('disputed', '对账有差异', visible(db.reconciliations).filter((r) => r.status === 'disputed').length, '/buyer/reconciliations?status=disputed', ['buyer', 'finance'], 'red'),
    card('toRequest', '已确认对账待开票申请', visible(db.reconciliations).filter((r) => r.status === 'confirmed' && !db.invoiceRequests.some((q) => q.reconciliationId === r.id)).length, '/buyer/invoice-requests', ['finance'], 'blue'),
    card('redWaiting', '红字确认单待我方确认', visible(db.redLetters).filter((r) => r.initiator === 'seller' && redEffectiveStatus(r, ctx.now) === 'waiting').length, '/buyer/red-letters', ['finance'], 'orange'),
    card('admissions', '准入资料审查中', db.admissions.filter((a) => a.status === 'reviewing').length, '/buyer/admissions', ['buyer', 'quality'], 'blue'),
    card('portalPending', '未开通门户的供应商', db.suppliers.filter((s) => s.portalStatus === '未开通').length, '/buyer/suppliers?portal=未开通', ['admin'], 'gray'),
  ]
  const recentLogs = db.auditLogs
    .filter((l) => !l.supplierCode || canSee(ctx, l.supplierCode))
    .sort((a, b) => b.at - a.at)
    .slice(0, 12)
  return { cards, recentLogs, alerts: alerts.slice(0, 6) }
}

export function portalDashboard(ctx: Ctx): PortalDashboard {
  if (!isSupplierActor(ctx)) throw new BizError('只给供应商身份使用', 403)
  const code = ctx.actor.supplierCode!
  const db = ctx.db
  const orders = listOrders(ctx)
  const shipments = db.shipments.filter((s) => s.supplierCode === code)
  const cards = [
    card('confirm', '待确认订单', orders.filter((o) => o.confirmStatus === 'pending' && o.bizStatus === 'open').length, '/portal/orders?tab=pending', ['supplier'], 'orange'),
    card('ship', '待发货订单', orders.filter((o) => o.actions.ship.ok).length, '/portal/shipments/new', ['supplier'], 'blue'),
    card('appoint', '待预约的发货单', shipments.filter((s) => s.status === 'submitted' && !db.appointments.some((a) => a.shipmentId === s.id && a.status !== 'cancelled') && ['waitingNotice', 'issued', 'pushing'].includes(shipmentErpStatus(db, s))).length, '/portal/appointments', ['supplier'], 'blue'),
    card('returned', '预约被退回改约', db.appointments.filter((a) => a.supplierCode === code && a.status === 'returned').length, '/portal/appointments', ['supplier'], 'red'),
    card('returns', '退货待确认知悉', db.returns.filter((r) => r.supplierCode === code && r.ack === 'pending').length, '/portal/receipts?tab=returns', ['supplier'], 'orange'),
    card('recon', '待确认对账单', db.reconciliations.filter((r) => r.supplierCode === code && r.status === 'sent').length, '/portal/reconciliations', ['supplier'], 'orange'),
    card('invoice', '待开票', db.invoiceRequests.filter((r) => r.supplierCode === code && requestStatus(db, r) !== 'registered').length, '/portal/invoicing', ['supplier'], 'blue'),
    card('red', '红字确认单待我方确认', db.redLetters.filter((r) => r.supplierCode === code && r.initiator === 'buyer' && redEffectiveStatus(r, ctx.now) === 'waiting').length, '/portal/red-letters', ['supplier'], 'orange'),
  ]
  return {
    supplier: supplierBrief(ctx, code),
    cards,
    pendingOrders: orders.filter((o) => o.confirmStatus === 'pending' && o.bizStatus === 'open'),
  }
}

export function navBadges(ctx: Ctx): NavBadges {
  if (isSupplierActor(ctx)) {
    const data = portalDashboard(ctx)
    const count = (key: string) => data.cards.find((c) => c.key === key)?.count ?? 0
    return {
      orders: count('confirm'),
      appointments: count('returned'),
      receipts: count('returns'),
      reconciliations: count('recon'),
      invoicing: count('invoice'),
      redLetters: count('red'),
    }
  }
  const data = dashboard(ctx)
  const count = (key: string) => data.cards.find((c) => c.key === key)?.count ?? 0
  return {
    approvals: count('approveOrders') + count('approveChanges'),
    suggestions: count('suggestions'),
    erpSync: count('pushFailed'),
    appointments: count('appointments'),
    alerts: count('alerts'),
    reconciliations: count('disputed'),
    redLetters: count('redWaiting'),
    admissions: count('admissions'),
  }
}

// ---------------------------------------------------------------- 绩效（口径草案）

export interface PerformanceOptions {
  promise: 'first' | 'final'
  basis: 'batch' | 'qty'
  confirmBasis: 'line' | 'order'
}

/** 《7》§三的口径草案。分子分母里未选定的部分按页面上的切换计算，只用于对照，不是选定（「33」）。 */
export function performance(ctx: Ctx, options: PerformanceOptions): PerformanceRow[] {
  if (isSupplierActor(ctx)) throw new BizError('无权查看', 403)
  const db = ctx.db
  const ratio = (numerator: number, denominator: number) => ({ numerator, denominator, rate: denominator ? numerator / denominator : null })
  return db.suppliers
    .filter((s) => canSee(ctx, s.code))
    .map((supplier) => {
      const orders = db.orders.filter((o) => o.supplierCode === supplier.code)
      let confirmNum = 0
      let confirmDen = 0
      for (const order of orders) {
        const sent = db.confirmations.find((c) => c.orderId === order.id && c.action === '下发供应商')
        if (!sent) continue
        const answer = db.confirmations.find((c) => c.orderId === order.id && c.at >= sent.at && (c.action === '确认接单' || c.action === '拒绝接单'))
        if (!answer && ctx.now - sent.at <= CONFIRM_LIMIT) continue
        const weight = options.confirmBasis === 'line' ? order.lines.length : 1
        confirmDen += weight
        if (answer?.action === '确认接单' && answer.at - sent.at <= CONFIRM_LIMIT) confirmNum += weight
      }
      let deliveryNum = 0
      let deliveryDen = 0
      const receipts: ErpReceipt[] = db.receipts.filter((r) => r.supplierCode === supplier.code)
      for (const receipt of receipts) {
        const order = orders.find((o) => o.id === receipt.orderId) as PurchaseOrder | undefined
        if (!order) continue
        const promised = options.promise === 'first' ? order.firstPromisedDate : order.promisedDate
        const weight = options.basis === 'batch' ? 1 : receipt.lines.reduce((t, l) => t + l.qty, 0)
        deliveryDen += weight
        if (receipt.date <= promised) deliveryNum += weight
      }
      const suggestions = db.suggestions.filter((s) => s.supplierCode === supplier.code)
      const recons = db.reconciliations.filter((r) => r.supplierCode === supplier.code && r.status !== 'cancelled')
      const answered = recons.filter((r) => r.history.some((h) => h.action === '供应商确认无误' || h.action === '提出差异'))
      const firstPass = answered.filter((r) => r.status === 'confirmed' && !r.history.some((h) => h.action === '提出差异'))
      return {
        supplierCode: supplier.code,
        supplierName: supplier.name,
        tier: supplier.tier,
        confirm: ratio(confirmNum, confirmDen),
        delivery: ratio(deliveryNum, deliveryDen),
        suggestions: {
          total: suggestions.length,
          pending: suggestions.filter((s) => s.status === 'pending').length,
          accepted: suggestions.filter((s) => s.status === 'accepted').length,
          rejected: suggestions.filter((s) => s.status === 'rejected').length,
        },
        reconFirstPass: ratio(firstPass.length, answered.length),
      }
    })
}

// ---------------------------------------------------------------- 追溯

/** 追溯关系沿用《5》§四。金蝶凭证和银行流水不在门户，只写明「在金蝶」。 */
export function trace(ctx: Ctx, query: { box?: string; receipt?: string }): TraceResult {
  if (isSupplierActor(ctx)) throw new BizError('无权查看', 403)
  const db = ctx.db
  const nodes: TraceNode[] = []
  let receipts: ErpReceipt[] = []
  let shipmentId: string | undefined
  let warn: string | undefined
  if (query.box) {
    const code = query.box.trim().toUpperCase()
    const box = db.boxes.find((b) => b.code === code)
    if (!box || !canSee(ctx, box.supplierCode)) return { found: false, message: `没有找到箱码${code}`, nodes }
    shipmentId = box.shipmentId
    if (box.status === 'void') {
      warn = `这个箱码已作废：${box.voidReason ?? ''}${box.replacedBy ? `。替换码${box.replacedBy}` : ''}。作废码不能再收`
    }
    nodes.push({
      key: 'box',
      layer: '门户',
      type: '箱码',
      no: box.code,
      status: statusDef('box', box.status).label,
      statusColor: statusDef('box', box.status).color,
      detail: `${box.skuCode} ${box.skuName} · ${box.qty}${box.unit} · 供应商批号${box.batchNo} · 第${box.seq}/${box.total}箱 · 打印${box.printCount}次${box.replaces ? ` · 替换${box.replaces}` : ''}`,
      warn,
      highlight: true,
    })
  } else if (query.receipt) {
    const no = query.receipt.trim().toUpperCase()
    const receipt = db.receipts.find((r) => r.no === no)
    if (!receipt || !canSee(ctx, receipt.supplierCode)) return { found: false, message: `没有找到采购入库单${no}`, nodes }
    shipmentId = receipt.shipmentId
  } else {
    return { found: false, message: '请输入箱码或采购入库单号', nodes }
  }
  const shipment = db.shipments.find((s) => s.id === shipmentId)!
  const order = db.orders.find((o) => o.id === shipment.orderId)!
  const notice = shipment.noticeId ? db.notices.find((n) => n.id === shipment.noticeId) : undefined
  receipts = notice?.receiptId ? db.receipts.filter((r) => r.id === notice.receiptId) : []
  const boxes = db.boxes.filter((b) => b.shipmentId === shipment.id)
  nodes.unshift(
    {
      key: 'erpOrder',
      layer: 'ERP',
      type: 'ERP采购订单（只读）',
      no: order.erp?.no ?? '-',
      detail: order.erp ? `来源单号${order.erp.sourceNo}` : 'ERP尚未接收',
    },
    {
      key: 'order',
      layer: '门户',
      type: 'SRM采购订单',
      no: order.no,
      link: `/buyer/orders/${order.id}`,
      status: statusDef('biz', order.bizStatus).label,
      statusColor: statusDef('biz', order.bizStatus).color,
      detail: `${order.supplierCode} ${order.supplierName} · 承诺交期${order.promisedDate}`,
    },
    {
      key: 'shipment',
      layer: '门户',
      type: '发货单',
      no: shipment.no,
      link: `/buyer/shipments/${shipment.id}`,
      status: statusDef('shipment', shipment.status).label,
      statusColor: statusDef('shipment', shipment.status).color,
      detail: `${shipment.lines.map((l) => `${l.skuCode}×${l.qty}`).join('，')} · 有效箱码${boxes.filter((b) => b.status === 'valid').length}个，作废${boxes.filter((b) => b.status === 'void').length}个`,
    },
  )
  if (query.receipt) {
    nodes.push({ key: 'boxes', layer: '门户', type: '箱码', no: `${boxes.filter((b) => b.status === 'valid').length}个有效`, detail: boxes.slice(0, 6).map((b) => b.code + (b.status === 'void' ? '（作废）' : '')).join('、') + (boxes.length > 6 ? '…' : '') })
  }
  if (notice) {
    nodes.push({
      key: 'notice',
      layer: 'ERP',
      type: '采购收货通知单',
      no: notice.no,
      status: statusDef('notice', notice.status).label,
      statusColor: statusDef('notice', notice.status).color,
      detail: `通知数量${notice.lines.reduce((t, l) => t + l.qty, 0)}`,
    })
  } else {
    nodes.push({ key: 'notice', layer: 'ERP', type: '采购收货通知单', no: '-', detail: 'ERP尚未生成' })
  }
  for (const receipt of receipts) {
    nodes.push({
      key: `receipt-${receipt.id}`,
      layer: 'ERP',
      type: '采购入库单',
      no: receipt.no,
      detail: `入库日期${receipt.date} · 实收${receipt.lines.reduce((t, l) => t + l.qty, 0)}`,
      highlight: !!query.receipt,
    })
    const recon = db.reconciliations.find((r) => r.status !== 'cancelled' && r.lines.some((l) => l.docId === receipt.id))
    if (!recon) {
      nodes.push({ key: 'recon', layer: '门户', type: '对账单', no: '-', detail: '尚未对账' })
      continue
    }
    nodes.push({
      key: `recon-${recon.id}`,
      layer: '门户',
      type: '对账单',
      no: recon.no,
      link: `/buyer/reconciliations/${recon.id}`,
      status: statusDef('recon', recon.status).label,
      statusColor: statusDef('recon', recon.status).color,
      detail: `期间${recon.period} · 价税合计${recon.totals.amount.toFixed(2)}`,
    })
    const request = db.invoiceRequests.find((q) => q.reconciliationId === recon.id)
    if (!request) {
      nodes.push({ key: 'request', layer: '门户', type: '开票申请', no: '-', detail: '尚未生成' })
      continue
    }
    nodes.push({
      key: `request-${request.id}`,
      layer: '门户',
      type: '开票申请',
      no: request.no,
      link: `/buyer/invoice-requests/${request.id}`,
      status: statusDef('request', requestStatus(db, request)).label,
      statusColor: statusDef('request', requestStatus(db, request)).color,
    })
    for (const invoice of db.invoices.filter((i) => i.requestId === request.id)) {
      nodes.push({
        key: `invoice-${invoice.id}`,
        layer: '税务',
        type: invoice.kind === 'blue' ? '蓝字数电票' : '红字数电票',
        no: invoice.invoiceNo,
        detail: `价税合计${invoice.amount.toFixed(2)} · 开票日期${invoice.issueDate}`,
      })
    }
    for (const red of db.redLetters.filter((r) => db.invoices.some((i) => i.id === r.blueInvoiceId && i.requestId === request.id))) {
      const status = redEffectiveStatus(red, ctx.now)
      nodes.push({
        key: `red-${red.id}`,
        layer: '税务',
        type: red.path === 'form' ? '红字确认单' : '直接开红字',
        no: red.formNo ?? red.redInvoiceNo ?? '-',
        status: statusDef('red', status).label,
        statusColor: statusDef('red', status).color,
        detail: `红冲${red.amount.toFixed(2)}`,
      })
    }
  }
  nodes.push({ key: 'kingdee', layer: '金蝶', type: '应付、核销、付款、凭证', no: '在金蝶', detail: '不在门户，追溯到这里为止（《3》§3.5）' })
  return { found: true, nodes }
}

/** 追溯页的「试一试」：挑一条链路最完整的示例，作废箱码优先选同一张发货单上的。 */
export function traceSamples(ctx: Ctx): { validBox?: string; voidBox?: string; receiptNo?: string } {
  if (isSupplierActor(ctx)) throw new BizError('无权查看', 403)
  const db = ctx.db
  const boxes = db.boxes.filter((b) => canSee(ctx, b.supplierCode))
  const received = (shipmentId: string) => {
    const shipment = db.shipments.find((s) => s.id === shipmentId)
    const notice = shipment?.noticeId ? db.notices.find((n) => n.id === shipment.noticeId) : undefined
    return !!notice?.receiptId
  }
  const voidBox = boxes.find((b) => b.status === 'void' && b.replacedBy)
  const validBox =
    boxes.find((b) => b.status === 'valid' && b.shipmentId === voidBox?.shipmentId && received(b.shipmentId)) ??
    boxes.find((b) => b.status === 'valid' && received(b.shipmentId))
  const invoiced = (receipt: ErpReceipt) => {
    const recon = db.reconciliations.find((r) => r.status !== 'cancelled' && r.lines.some((l) => l.docId === receipt.id))
    const request = recon && db.invoiceRequests.find((q) => q.reconciliationId === recon.id)
    const invoices = request ? db.invoices.filter((i) => i.requestId === request.id) : []
    return { invoiced: invoices.length > 0, red: db.redLetters.some((r) => invoices.some((i) => i.id === r.blueInvoiceId)) }
  }
  const receipts = db.receipts.filter((r) => canSee(ctx, r.supplierCode))
  const receipt = receipts.find((r) => invoiced(r).red) ?? receipts.find((r) => invoiced(r).invoiced) ?? receipts[0]
  return { validBox: validBox?.code, voidBox: voidBox?.code, receiptNo: receipt?.no }
}

// ---------------------------------------------------------------- 操作日志

export function auditLogs(ctx: Ctx, query: URLSearchParams): AuditLog[] {
  if (isSupplierActor(ctx)) throw new BizError('无权查看', 403)
  const objectId = query.get('objectId')
  const objectIds = objectId ? objectId.split(',') : null
  return ctx.db.auditLogs
    .filter((l) => !l.supplierCode || canSee(ctx, l.supplierCode))
    .filter((l) => !objectIds || objectIds.includes(l.objectId))
    .sort((a, b) => b.at - a.at)
}

export function relatedObjectIds(ctx: Ctx, orderId: string) {
  const db = ctx.db
  const ids = new Set<string>([orderId])
  for (const c of db.changes) if (c.orderId === orderId) ids.add(c.id)
  for (const s of db.suggestions) if (s.orderId === orderId) ids.add(s.id)
  for (const k of db.kitting) if (k.orderId === orderId) ids.add(k.id)
  for (const j of db.pushJobs) if (j.orderId === orderId) ids.add(j.id)
  for (const s of db.shipments) if (s.orderId === orderId) for (const id of shipmentObjectIds(ctx, s.id)) ids.add(id)
  for (const r of db.returns) if (r.orderId === orderId) ids.add(r.id)
  return [...ids]
}

export function shipmentObjectIds(ctx: Ctx, shipmentId: string) {
  const db = ctx.db
  const ids = new Set<string>([shipmentId])
  for (const b of db.boxes) if (b.shipmentId === shipmentId) ids.add(b.code)
  for (const a of db.appointments) if (a.shipmentId === shipmentId) ids.add(a.id)
  for (const n of db.notices) {
    if (n.shipmentId !== shipmentId) continue
    ids.add(n.id)
    if (n.receiptId) ids.add(n.receiptId)
  }
  for (const j of db.pushJobs) if (j.objectId === shipmentId) ids.add(j.id)
  return [...ids]
}
