import { DAY, daysBetween, todayStr } from '../domain/format'
import { calcAmounts, round2 } from '../domain/money'
import type {
  Appointment,
  Box,
  Db,
  Invoice,
  InvoiceRequest,
  OrderChange,
  Precheck,
  PrecheckItem,
  PrototypeConfig,
  PurchaseOrder,
  ReceiptStatus,
  Shipment,
} from '../domain/types'
import type { AlertKind, ErpShipStatus, LineQty, RequestStatus } from '../domain/views'

export const PUSH_LATENCY = 1200
export const CONFIRM_LIMIT = DAY
export const RED_FORM_LIMIT = 3 * DAY

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

/**
 * 订单行数量口径，和ERP采购订单字段同名：
 * 可下推 = 采购数量 − 累计入库 − 在途通知；本次可发 = 可下推 − 已提交未生成通知。不设容差（《4》§二）。
 */
export function lineQty(db: Db, order: PurchaseOrder): LineQty[] {
  const receipts = db.receipts.filter((item) => item.orderId === order.id)
  const notices = db.notices.filter((item) => item.orderId === order.id && item.status === 'issued')
  const pending = db.shipments.filter((item) => item.orderId === order.id && item.status === 'submitted' && !item.noticeId)
  return order.lines.map((line) => {
    const received = sum(receipts.flatMap((r) => r.lines.filter((l) => l.lineNo === line.lineNo).map((l) => l.qty)))
    const inTransit = sum(notices.flatMap((n) => n.lines.filter((l) => l.lineNo === line.lineNo).map((l) => l.qty)))
    const pendingShip = sum(pending.flatMap((s) => s.lines.filter((l) => l.lineNo === line.lineNo).map((l) => l.qty)))
    const pushable = line.qty - received - inTransit
    return {
      lineNo: line.lineNo,
      qty: line.qty,
      received,
      inTransit,
      pushable,
      pendingShip,
      shippable: Math.max(0, pushable - pendingShip),
    }
  })
}

export function receiptStatusOf(quantities: LineQty[]): ReceiptStatus {
  const received = sum(quantities.map((q) => q.received))
  if (received === 0) return 'none'
  return quantities.every((q) => q.received >= q.qty) ? 'full' : 'partial'
}

export function unfinishedChange(db: Db, orderId: string): OrderChange | undefined {
  return db.changes.find((c) => c.orderId === orderId && ['draft', 'pending', 'pushing', 'failed'].includes(c.status))
}

export function latestKitting(db: Db, orderId: string, lineNo: number) {
  return db.kitting
    .filter((k) => k.orderId === orderId && k.lineNo === lineNo)
    .sort((a, b) => b.reportedAt - a.reportedAt)[0]
}

/** 「距承诺交期前N天，节点未完成就预警」（《3》§3.2）。节点清单未定（「20」），原型按每行最新一条齐套记录判断。 */
export function orderAlerts(db: Db, order: PurchaseOrder, config: PrototypeConfig, now: number): AlertKind[] {
  if (order.auditStatus !== 'approved' || order.bizStatus !== 'open') return []
  const kinds: AlertKind[] = []
  if (order.confirmStatus === 'pending' && order.sentAt && now - order.sentAt > CONFIRM_LIMIT) kinds.push('unconfirmed24h')
  const quantities = lineQty(db, order)
  if (receiptStatusOf(quantities) === 'full') return kinds
  const daysLeft = daysBetween(todayStr(now), order.promisedDate)
  if (daysLeft < 0) {
    kinds.push('overdue')
    return kinds
  }
  if (daysLeft <= config.alertDays) {
    const incomplete = quantities.some((q) => {
      if (q.received >= q.qty) return false
      return latestKitting(db, order.id, q.lineNo)?.status !== '已齐套'
    })
    if (incomplete) kinds.push('nearDue')
  }
  return kinds
}

export function shipmentErpStatus(db: Db, shipment: Shipment): ErpShipStatus {
  if (shipment.status !== 'submitted') return 'none'
  const notice = shipment.noticeId ? db.notices.find((n) => n.id === shipment.noticeId) : undefined
  if (notice) {
    if (notice.status === 'issued') return 'issued'
    if (notice.status === 'cancelled') return 'zero'
    const receipt = db.receipts.find((r) => r.id === notice.receiptId)
    const received = sum(receipt?.lines.map((l) => l.qty) ?? [])
    const noticed = sum(notice.lines.map((l) => l.qty))
    return received >= noticed ? 'full' : 'short'
  }
  const job = shipment.pushJobId ? db.pushJobs.find((j) => j.id === shipment.pushJobId) : undefined
  if (!job || job.status === 'pushing') return 'pushing'
  if (job.status === 'failed') return 'pushFailed'
  return 'waitingNotice'
}

export function activeAppointment(db: Db, shipmentId: string) {
  return db.appointments
    .filter((a) => a.shipmentId === shipmentId && a.status !== 'cancelled')
    .sort((a, b) => b.createdAt - a.createdAt)[0]
}

/** 这批货已有收货结果（全收、缺量或零收），预约不再能确认、退回、改约或取消。 */
export function appointmentFinished(db: Db, appointment: Appointment) {
  const shipment = db.shipments.find((s) => s.id === appointment.shipmentId)
  const notice = shipment?.noticeId ? db.notices.find((n) => n.id === shipment.noticeId) : undefined
  return !!notice && notice.status !== 'issued'
}

type BoxSeed = Omit<Box, 'code' | 'status' | 'printCount' | 'createdAt' | 'seq' | 'total'>

/** 只填每箱数量，系统算整箱和尾箱；一箱一种SKU（《6》§三）。 */
export function planBoxes(shipment: Shipment): BoxSeed[] {
  const seeds: BoxSeed[] = []
  for (const line of shipment.lines) {
    let left = line.qty
    while (left > 0) {
      const qty = Math.min(line.perBox, left)
      left -= qty
      seeds.push({
        shipmentId: shipment.id,
        shipmentNo: shipment.no,
        orderId: shipment.orderId,
        orderNo: shipment.orderNo,
        supplierCode: shipment.supplierCode,
        warehouseCode: shipment.warehouseCode,
        lineNo: line.lineNo,
        skuCode: line.skuCode,
        skuName: line.skuName,
        unit: line.unit,
        batchNo: line.batchNo,
        qty,
      })
    }
  }
  return seeds
}

export function moneyLine(order: PurchaseOrder, lineNo: number, qty: number) {
  const line = order.lines.find((l) => l.lineNo === lineNo)
  if (!line) throw new Error(`line ${lineNo} missing`)
  const amounts = calcAmounts(qty, line.price, line.taxRate)
  return {
    lineNo,
    skuCode: line.skuCode,
    skuName: line.skuName,
    unit: line.unit,
    qty,
    price: line.price,
    taxRate: line.taxRate,
    amount: amounts.amount,
    tax: amounts.tax,
    netAmount: amounts.netAmount,
  }
}

export function requestStatus(db: Db, request: InvoiceRequest): RequestStatus {
  const blues = db.invoices.filter((i) => i.kind === 'blue' && i.requestId === request.id)
  if (!blues.length) return 'waiting'
  return blues.some((b) => b.reversedAmount < b.amount) ? 'registered' : 'reissue'
}

export function invoiceRemaining(invoice: Invoice) {
  return round2(invoice.amount - invoice.reversedAmount)
}

export interface PrecheckInput {
  invoiceNo: string
  amount: number
  tax: number
  netAmount: number
  taxRate: number
}

/**
 * 税票预校验。号码格式、门户内查重、金额关系不通过时拦住登记：前两项来自《6》§四，
 * 金额加税额等于价税合计是票面本身的关系，不是容差。和开票申请的差额只提示（「17」）。
 */
export function runPrecheck(db: Db, input: PrecheckInput, request: InvoiceRequest | undefined, tolerance: number | null, now: number): Precheck {
  const items: PrecheckItem[] = []
  const formatOk = /^\d{20}$/.test(input.invoiceNo)
  items.push({
    key: 'format',
    label: '号码格式',
    result: formatOk ? 'pass' : 'fail',
    message: formatOk ? '20位数字，符合数电票号码' : '数电票号码应为20位数字（《6》§四）',
    blocking: !formatOk,
  })
  const duplicate = db.invoices.some((i) => i.invoiceNo === input.invoiceNo)
  items.push({
    key: 'duplicate',
    label: '门户内查重',
    result: duplicate ? 'fail' : 'pass',
    message: duplicate ? '门户里已登记过这个号码' : '门户内未重复。只查门户内，不代表全网查重（《6》§四）',
    blocking: duplicate,
  })
  const consistent = round2(input.netAmount + input.tax) === round2(input.amount)
  items.push({
    key: 'consistency',
    label: '金额关系',
    result: consistent ? 'pass' : 'fail',
    message: consistent ? '金额 + 税额 = 价税合计' : '金额加税额不等于价税合计，请按票面核对',
    blocking: !consistent,
  })
  if (request) {
    for (const [key, label, actual, expected] of [
      ['amount', '价税合计', input.amount, request.amount],
      ['tax', '税额', input.tax, request.tax],
    ] as const) {
      const diff = round2(actual - expected)
      if (diff === 0) {
        items.push({ key, label, result: 'pass', message: `与开票申请一致：${expected.toFixed(2)}` })
      } else if (tolerance === null) {
        items.push({ key, label, result: 'warn', message: `与开票申请差${diff.toFixed(2)}。容差未设定（待确认-17），只提示，不判定通过` })
      } else {
        const within = Math.abs(diff) <= tolerance
        items.push({
          key,
          label,
          result: within ? 'pass' : 'fail',
          message: within ? `差${diff.toFixed(2)}，在演示容差${tolerance}以内` : `差${diff.toFixed(2)}，超出演示容差${tolerance}`,
        })
      }
    }
    const rateOk = request.taxRates.includes(input.taxRate)
    items.push({
      key: 'taxRate',
      label: '税率',
      result: rateOk ? 'pass' : 'warn',
      message: rateOk ? `与开票申请一致：${input.taxRate}%` : `开票申请的税率是${request.taxRates.join('、')}%`,
    })
  }
  items.push({ key: 'authenticity', label: '真伪查验', result: 'na', message: '未接入。查验在哪里做、由谁提供见待确认-37' })
  const overall = items.every((i) => i.result === 'pass' || i.result === 'na') ? 'match' : 'diff'
  return { at: now, overall, items }
}

export function precheckBlocking(precheck: Precheck) {
  return precheck.items.filter((i) => i.blocking)
}
