import { timeSlots } from '../domain/labels'
import type { Appointment, Box, ErpReturn, PurchaseOrder, Shipment, ShipmentLine } from '../domain/types'
import type { ActionState, ShipmentActionKey } from '../domain/views'
import {
  BizError,
  OK,
  actorGuard,
  assertOk,
  assertScope,
  audit,
  deny,
  findSupplier,
  hasRole,
  hide,
  isEnterprise,
  nextBoxCode,
  nextId,
  nextNo,
  proxyInfo,
  requireDate,
  requireInt,
  requireText,
  systemCtx,
  today,
  type Ctx,
  type ProxyInput,
} from './core'
import { getOrder, orderActions, startPush, pushJobActions } from './orders'
import { activeAppointment, lineQty, moneyLine, planBoxes, shipmentErpStatus } from './rules'

// ---------------------------------------------------------------- 发货单

export function getShipment(ctx: Ctx, id: string) {
  const shipment = ctx.db.shipments.find((s) => s.id === id)
  if (!shipment) throw new BizError('发货单不存在', 404)
  assertScope(ctx, shipment.supplierCode)
  return shipment
}

export function shipmentActions(ctx: Ctx, shipment: Shipment): Record<ShipmentActionKey, ActionState> {
  const supplier = findSupplier(ctx, shipment.supplierCode)
  const self = actorGuard(ctx, supplier)
  const order = ctx.db.orders.find((o) => o.id === shipment.orderId)
  const erpStatus = shipmentErpStatus(ctx.db, shipment)
  const notice = shipment.noticeId ? ctx.db.notices.find((n) => n.id === shipment.noticeId) : undefined
  const draft = shipment.status === 'draft'
  const submitted = shipment.status === 'submitted'
  const job = shipment.pushJobId ? ctx.db.pushJobs.find((j) => j.id === shipment.pushJobId) : undefined
  const selfState = (state: () => ActionState) => (self.hidden ? self : state())

  return {
    edit: selfState(() => (draft ? OK : hide())),
    submit: selfState(() => {
      if (!draft) return hide()
      if (!order) return deny('订单不存在')
      const ship = orderActions(ctx, order).ship
      return ship.ok ? OK : deny(ship.reason ?? '当前不能发货')
    }),
    regenerate: selfState(() => (draft ? OK : hide())),
    cancel: selfState(() => {
      if (shipment.status === 'cancelled') return hide()
      if (draft) return OK
      if (notice) return deny('ERP已经按这张发货单生成收货通知单，取消怎样联动见待确认-42')
      return OK
    }),
    print: selfState(() => (shipment.status === 'cancelled' ? hide() : OK)),
    appoint: selfState(() => {
      if (!submitted) return hide()
      if (notice && notice.status !== 'issued') return deny('已有收货结果')
      if (activeAppointment(ctx.db, shipment.id)) return deny('已有预约，可在预约里改约')
      return OK
    }),
    simulateNotice: !isEnterprise(ctx) || !submitted || notice ? hide() : erpStatus === 'waitingNotice' ? OK : deny('ERP还没接收这张发货单'),
    simulateReceipt: isEnterprise(ctx) && notice?.status === 'issued' ? OK : hide(),
    retryPush: job ? pushJobActions(ctx, job).retry : hide(),
  }
}

export function boxActions(ctx: Ctx, box: Box) {
  const shipment = ctx.db.shipments.find((s) => s.id === box.shipmentId)
  if (!shipment) return { reprint: hide(), void: hide() }
  const self = actorGuard(ctx, findSupplier(ctx, shipment.supplierCode))
  if (self.hidden) return { reprint: self, void: self }
  if (box.status === 'void') return { reprint: hide('已作废'), void: hide('已作废') }
  if (shipment.status !== 'submitted') return { reprint: hide('提交前用「重新装箱」或整单打印'), void: hide() }
  const notice = shipment.noticeId ? ctx.db.notices.find((n) => n.id === shipment.noticeId) : undefined
  return {
    reprint: OK,
    void: notice && notice.status !== 'issued' ? deny('已有收货结果，不能再换码') : OK,
  }
}

export interface ShipmentInput {
  orderId: string
  lines: { lineNo: number; qty: number; batchNo: string; perBox: number }[]
  expectedDate: string
  carrier?: string
  waybillNo?: string
  plateNo?: string
  remark?: string
  proxy?: ProxyInput
}

function buildShipmentLines(ctx: Ctx, order: PurchaseOrder, input: ShipmentInput): ShipmentLine[] {
  const quantities = lineQty(ctx.db, order)
  const rows = (input.lines ?? []).filter((row) => Number(row.qty) > 0)
  if (!rows.length) throw new BizError('至少填一行发货数量', 400)
  const seen = new Set<number>()
  return rows.map((row) => {
    const line = order.lines.find((l) => l.lineNo === Number(row.lineNo))
    if (!line) throw new BizError(`第${row.lineNo}行不存在`, 400)
    if (seen.has(line.lineNo)) throw new BizError(`第${line.lineNo}行重复`, 400)
    seen.add(line.lineNo)
    const label = `第${line.lineNo}行`
    const qty = requireInt(row.qty, `${label}发货数量`)
    const q = quantities.find((item) => item.lineNo === line.lineNo)!
    if (qty > q.shippable) {
      throw new BizError(`${label}本次最多可发${q.shippable}：可下推${q.pushable}，已提交未生成通知${q.pendingShip}。不设超发容差（《4》§二）`, 409)
    }
    return {
      lineNo: line.lineNo,
      skuCode: line.skuCode,
      skuName: line.skuName,
      unit: line.unit,
      qty,
      batchNo: requireText(row.batchNo, `${label}供应商批号`),
      perBox: requireInt(row.perBox, `${label}每箱数量`),
    }
  })
}

function rebuildBoxes(ctx: Ctx, shipment: Shipment) {
  ctx.db.boxes = ctx.db.boxes.filter((b) => b.shipmentId !== shipment.id)
  const seeds = planBoxes(shipment)
  seeds.forEach((seed, index) => {
    ctx.db.boxes.push({
      ...seed,
      code: nextBoxCode(ctx.db),
      seq: index + 1,
      total: seeds.length,
      status: 'valid',
      printCount: 0,
      createdAt: ctx.now,
    })
  })
}

function logShipment(ctx: Ctx, shipment: Shipment, action: string, note?: string, after?: Record<string, unknown>) {
  audit(ctx, {
    objectType: '发货单',
    objectId: shipment.id,
    objectNo: shipment.no,
    supplierCode: shipment.supplierCode,
    action,
    after: after ?? { 发货数量: shipment.lines.reduce((t, l) => t + l.qty, 0), 行数: shipment.lines.length },
    note,
    proxy: shipment.proxy,
  })
}

export function saveShipment(ctx: Ctx, input: ShipmentInput, id?: string, submit = false) {
  const existing = id ? getShipment(ctx, id) : undefined
  if (existing) assertOk(shipmentActions(ctx, existing).edit)
  const order = getOrder(ctx, existing?.orderId ?? input.orderId)
  const supplier = findSupplier(ctx, order.supplierCode)
  const self = actorGuard(ctx, supplier)
  assertOk(self)
  assertOk(orderActions(ctx, order).ship)
  const lines = buildShipmentLines(ctx, order, input)
  const expectedDate = requireDate(input.expectedDate, '预计到货日期', today(ctx))
  const proxy = proxyInfo(ctx, supplier, input.proxy) ?? existing?.proxy
  const shipment: Shipment = existing ?? {
    id: nextId(ctx.db, 'sh'),
    no: nextNo(ctx.db, 'FHD', ctx.now),
    orderId: order.id,
    orderNo: order.no,
    supplierCode: order.supplierCode,
    warehouseCode: order.warehouseCode,
    lines: [],
    expectedDate,
    carrier: '',
    waybillNo: '',
    plateNo: '',
    remark: '',
    status: 'draft',
    createdBy: ctx.actor.userName,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  }
  Object.assign(shipment, {
    lines,
    expectedDate,
    carrier: input.carrier?.trim() ?? '',
    waybillNo: input.waybillNo?.trim() ?? '',
    plateNo: input.plateNo?.trim() ?? '',
    remark: input.remark?.trim() ?? '',
    updatedAt: ctx.now,
    proxy,
  })
  if (!existing) ctx.db.shipments.push(shipment)
  rebuildBoxes(ctx, shipment)
  logShipment(ctx, shipment, existing ? '编辑发货单草稿' : proxy ? '代录发货单草稿' : '新建发货单草稿')
  if (submit) submitShipment(ctx, shipment.id)
  return shipment
}

export function submitShipment(ctx: Ctx, id: string) {
  const shipment = getShipment(ctx, id)
  assertOk(shipmentActions(ctx, shipment).submit)
  const order = getOrder(ctx, shipment.orderId)
  const quantities = lineQty(ctx.db, order)
  for (const line of shipment.lines) {
    const q = quantities.find((item) => item.lineNo === line.lineNo)!
    if (line.qty > q.shippable) throw new BizError(`第${line.lineNo}行本次最多可发${q.shippable}，请先调整数量`, 409)
  }
  shipment.status = 'submitted'
  shipment.submittedAt = ctx.now
  shipment.updatedAt = ctx.now
  const job = startPush(ctx, '发货单', { objectId: shipment.id, objectNo: shipment.no, order }, '发货单提交后推送ERP')
  shipment.pushJobId = job.id
  logShipment(ctx, shipment, shipment.proxy ? '代录提交发货单' : '提交发货单', '提交后用「补打」「作废并换码」处理箱码')
  return shipment
}

export function cancelShipment(ctx: Ctx, id: string, reason?: string) {
  const shipment = getShipment(ctx, id)
  assertOk(shipmentActions(ctx, shipment).cancel)
  const text = shipment.status === 'submitted' ? requireText(reason, '取消原因') : reason?.trim() || '草稿不再使用'
  shipment.status = 'cancelled'
  shipment.cancelledAt = ctx.now
  shipment.cancelReason = text
  shipment.updatedAt = ctx.now
  for (const box of ctx.db.boxes) {
    if (box.shipmentId === shipment.id && box.status === 'valid') {
      box.status = 'void'
      box.voidReason = '发货单已取消'
      box.voidAt = ctx.now
      box.voidBy = ctx.actor.userName
    }
  }
  const appointment = activeAppointment(ctx.db, shipment.id)
  if (appointment) {
    appointment.status = 'cancelled'
    appointment.history.push({ at: ctx.now, by: ctx.actor.userName, action: '随发货单取消' })
  }
  logShipment(ctx, shipment, '取消发货单', text)
  return shipment
}

export function regenerateBoxes(ctx: Ctx, id: string) {
  const shipment = getShipment(ctx, id)
  assertOk(shipmentActions(ctx, shipment).regenerate)
  rebuildBoxes(ctx, shipment)
  logShipment(ctx, shipment, '重新装箱', '提交前可以重排、重打')
  return shipment
}

export function printLabels(ctx: Ctx, id: string) {
  const shipment = getShipment(ctx, id)
  assertOk(shipmentActions(ctx, shipment).print)
  const boxes = ctx.db.boxes.filter((b) => b.shipmentId === shipment.id && b.status === 'valid')
  for (const box of boxes) box.printCount += 1
  logShipment(ctx, shipment, shipment.status === 'draft' ? '打印箱码（提交前）' : '打印箱码', undefined, { 箱数: boxes.length })
  return { printed: boxes.length }
}

function getBox(ctx: Ctx, code: string) {
  const box = ctx.db.boxes.find((b) => b.code === code)
  if (!box) throw new BizError('箱码不存在', 404)
  assertScope(ctx, box.supplierCode)
  return box
}

export function reprintBox(ctx: Ctx, code: string) {
  const box = getBox(ctx, code)
  assertOk(boxActions(ctx, box).reprint)
  box.printCount += 1
  audit(ctx, {
    objectType: '箱码',
    objectId: box.code,
    objectNo: box.code,
    supplierCode: box.supplierCode,
    action: '补打箱码',
    after: { 打印次数: box.printCount },
  })
  return box
}

/** 贴错作废换码：原码作废、新码沿用同一箱内容，追溯里能看到替换关系（《6》§三）。 */
export function voidBox(ctx: Ctx, code: string, reason: string) {
  const box = getBox(ctx, code)
  assertOk(boxActions(ctx, box).void)
  const text = requireText(reason, '作废原因')
  const replacement: Box = {
    ...box,
    code: nextBoxCode(ctx.db),
    status: 'valid',
    printCount: 1,
    replaces: box.code,
    replacedBy: undefined,
    voidReason: undefined,
    voidAt: undefined,
    voidBy: undefined,
    createdAt: ctx.now,
  }
  box.status = 'void'
  box.voidReason = text
  box.voidAt = ctx.now
  box.voidBy = ctx.actor.userName
  box.replacedBy = replacement.code
  ctx.db.boxes.push(replacement)
  audit(ctx, {
    objectType: '箱码',
    objectId: box.code,
    objectNo: box.code,
    supplierCode: box.supplierCode,
    action: '作废并换码',
    before: { 箱码: box.code },
    after: { 新箱码: replacement.code },
    note: text,
  })
  return replacement
}

// ---------------------------------------------------------------- 模拟ERP、WMS回传

export function simulateNotice(ctx: Ctx, id: string) {
  const shipment = getShipment(ctx, id)
  assertOk(shipmentActions(ctx, shipment).simulateNotice)
  const order = getOrder(ctx, shipment.orderId)
  const sys = systemCtx(ctx, ctx.now)
  const notice = {
    id: nextId(ctx.db, 'nt'),
    no: nextNo(ctx.db, 'CGSHTZ', ctx.now),
    shipmentId: shipment.id,
    shipmentNo: shipment.no,
    orderId: order.id,
    orderNo: order.no,
    erpOrderNo: order.erp?.no ?? '-',
    supplierCode: shipment.supplierCode,
    warehouseCode: shipment.warehouseCode,
    lines: shipment.lines.map((l) => ({ lineNo: l.lineNo, skuCode: l.skuCode, skuName: l.skuName, unit: l.unit, qty: l.qty })),
    status: 'issued' as const,
    createdAt: ctx.now,
  }
  ctx.db.notices.push(notice)
  shipment.noticeId = notice.id
  audit(sys, {
    objectType: '采购收货通知单',
    objectId: notice.id,
    objectNo: notice.no,
    supplierCode: notice.supplierCode,
    action: 'ERP按发货单生成收货通知单并下发WMS',
    note: `发货单${shipment.no}`,
  })
  return notice
}

export interface ReceiptInput {
  mode: 'full' | 'short' | 'zero'
  lines?: { lineNo: number; qty: number }[]
}

/** 一批发货一张通知、一次最终结果：全收、缺量或零收。超过通知数量的回传会被拒绝（《4》§二）。 */
export function simulateReceipt(ctx: Ctx, id: string, input: ReceiptInput) {
  const shipment = getShipment(ctx, id)
  assertOk(shipmentActions(ctx, shipment).simulateReceipt)
  const notice = ctx.db.notices.find((n) => n.id === shipment.noticeId)!
  const order = getOrder(ctx, shipment.orderId)
  const sys = systemCtx(ctx, ctx.now, 'wms')
  notice.resultAt = ctx.now
  if (input.mode === 'zero') {
    notice.status = 'cancelled'
    audit(sys, {
      objectType: '采购收货通知单',
      objectId: notice.id,
      objectNo: notice.no,
      supplierCode: notice.supplierCode,
      action: '零收，通知单取消',
      note: '零收不生成采购入库单（《5》§三）',
    })
    return { notice }
  }
  const quantities = notice.lines.map((line) => {
    if (input.mode === 'full') return { line, qty: line.qty }
    const row = input.lines?.find((r) => r.lineNo === line.lineNo)
    const qty = Number(row?.qty ?? 0)
    if (!Number.isInteger(qty) || qty < 0) throw new BizError(`第${line.lineNo}行实收数量须为非负整数`, 400)
    if (qty > line.qty) {
      throw new BizError(`第${line.lineNo}行实收${qty}超过通知数量${line.qty}，ERP会拒绝。多出的货怎么处理见待确认-10`, 409)
    }
    return { line, qty }
  })
  const total = quantities.reduce((t, q) => t + q.qty, 0)
  const noticed = notice.lines.reduce((t, l) => t + l.qty, 0)
  if (input.mode === 'short' && total === 0) throw new BizError('实收合计为0，请选零收', 400)
  if (input.mode === 'short' && total >= noticed) throw new BizError('实收等于通知数量，请选全收', 400)
  const receipt = {
    id: nextId(ctx.db, 'rk'),
    no: nextNo(ctx.db, 'CGRK', ctx.now),
    noticeId: notice.id,
    noticeNo: notice.no,
    shipmentId: shipment.id,
    shipmentNo: shipment.no,
    orderId: order.id,
    orderNo: order.no,
    erpOrderNo: notice.erpOrderNo,
    supplierCode: notice.supplierCode,
    warehouseCode: notice.warehouseCode,
    lines: quantities.filter((q) => q.qty > 0).map((q) => ({ ...moneyLine(order, q.line.lineNo, q.qty), noticeQty: q.line.qty })),
    date: today(ctx),
    createdAt: ctx.now,
  }
  ctx.db.receipts.push(receipt)
  notice.status = 'completed'
  notice.receiptId = receipt.id
  audit(sys, {
    objectType: '采购入库单',
    objectId: receipt.id,
    objectNo: receipt.no,
    supplierCode: receipt.supplierCode,
    action: input.mode === 'full' ? 'WMS全收，ERP生成采购入库单' : 'WMS缺量收货，ERP生成采购入库单',
    after: { 通知数量: noticed, 实收数量: total },
    note: `通知单${notice.no}`,
  })
  return { notice, receipt }
}

// ---------------------------------------------------------------- 采购退货（ERP回传）

export function returnActions(ctx: Ctx, item: ErpReturn) {
  const supplier = findSupplier(ctx, item.supplierCode)
  const self = actorGuard(ctx, supplier)
  return {
    ack: self.hidden ? self : item.ack === 'pending' ? OK : hide(),
    simulateOutbound: isEnterprise(ctx) && item.erpStatus === '采退通知已下发' ? OK : hide(),
  }
}

export function simulateReturn(ctx: Ctx, receiptId: string, input: { lineNo: number; qty: number; reason: string }) {
  if (!isEnterprise(ctx)) throw new BizError('模拟ERP退货只在企业侧演示', 403)
  const receipt = ctx.db.receipts.find((r) => r.id === receiptId)
  if (!receipt) throw new BizError('采购入库单不存在', 404)
  assertScope(ctx, receipt.supplierCode)
  const line = receipt.lines.find((l) => l.lineNo === Number(input.lineNo))
  if (!line) throw new BizError('请选择入库行', 400)
  const lineTotal = (rows: { lineNo: number; qty: number }[]) =>
    rows.filter((l) => l.lineNo === line.lineNo).reduce((t, l) => t + l.qty, 0)
  const received = lineTotal(ctx.db.receipts.filter((r) => r.orderId === receipt.orderId).flatMap((r) => r.lines))
  const returned = lineTotal(ctx.db.returns.filter((r) => r.orderId === receipt.orderId).flatMap((r) => r.lines))
  const qty = requireInt(input.qty, '退货数量')
  if (qty > received - returned) throw new BizError(`这一行最多可退${received - returned}`, 409)
  const order = getOrder(ctx, receipt.orderId)
  const sys = systemCtx(ctx, ctx.now)
  const item: ErpReturn = {
    id: nextId(ctx.db, 'th'),
    returnNo: nextNo(ctx.db, 'CGTH', ctx.now),
    noticeNo: nextNo(ctx.db, 'CTFHTZ', ctx.now),
    orderId: order.id,
    orderNo: order.no,
    erpOrderNo: receipt.erpOrderNo,
    supplierCode: receipt.supplierCode,
    warehouseCode: receipt.warehouseCode,
    lines: [moneyLine(order, line.lineNo, qty)],
    reason: requireText(input.reason, '退货原因'),
    erpStatus: '采退通知已下发',
    ack: 'pending',
    createdAt: ctx.now,
  }
  ctx.db.returns.push(item)
  audit(sys, {
    objectType: '采购退货',
    objectId: item.id,
    objectNo: item.returnNo,
    supplierCode: item.supplierCode,
    action: 'ERP下发采购退货',
    after: { 数量: qty, 入库单: receipt.no },
    note: item.reason,
  })
  return item
}

export function simulateReturnOutbound(ctx: Ctx, id: string) {
  const item = getReturn(ctx, id)
  assertOk(returnActions(ctx, item).simulateOutbound)
  item.erpStatus = '已出库'
  item.outboundNo = nextNo(ctx.db, 'CTCK', ctx.now)
  item.outboundDate = today(ctx)
  item.outboundAt = ctx.now
  audit(systemCtx(ctx, ctx.now, 'wms'), {
    objectType: '采购退货',
    objectId: item.id,
    objectNo: item.returnNo,
    supplierCode: item.supplierCode,
    action: 'WMS退货出库，ERP生成采退出库单',
    note: item.outboundNo,
  })
  return item
}

function getReturn(ctx: Ctx, id: string) {
  const item = ctx.db.returns.find((r) => r.id === id)
  if (!item) throw new BizError('退货记录不存在', 404)
  assertScope(ctx, item.supplierCode)
  return item
}

export function ackReturn(ctx: Ctx, id: string, proxy?: ProxyInput) {
  const item = getReturn(ctx, id)
  assertOk(returnActions(ctx, item).ack)
  const info = proxyInfo(ctx, findSupplier(ctx, item.supplierCode), proxy)
  item.ack = 'acked'
  item.ackBy = ctx.actor.userName
  item.ackAt = ctx.now
  audit(ctx, {
    objectType: '采购退货',
    objectId: item.id,
    objectNo: item.returnNo,
    supplierCode: item.supplierCode,
    action: info ? '代录确认知悉退货' : '确认知悉退货',
    note: '补货、扣款不在门户决定（待确认-10）',
    proxy: info,
  })
  return item
}

// ---------------------------------------------------------------- 预约送货

export function getAppointment(ctx: Ctx, id: string) {
  const appointment = ctx.db.appointments.find((a) => a.id === id)
  if (!appointment) throw new BizError('预约不存在', 404)
  assertScope(ctx, appointment.supplierCode)
  return appointment
}

export function appointmentActions(ctx: Ctx, appointment: Appointment) {
  const supplier = findSupplier(ctx, appointment.supplierCode)
  const self = actorGuard(ctx, supplier)
  const shipment = ctx.db.shipments.find((s) => s.id === appointment.shipmentId)
  const notice = shipment?.noticeId ? ctx.db.notices.find((n) => n.id === shipment.noticeId) : undefined
  const finished = !!notice && notice.status !== 'issued'
  const warehouse = hasRole(ctx, 'warehouse')
  return {
    confirm: warehouse && appointment.status === 'pending' ? OK : hide(),
    return: warehouse && ['pending', 'confirmed'].includes(appointment.status) ? OK : hide(),
    reschedule: self.hidden ? self : appointment.status === 'cancelled' || finished ? hide() : OK,
    cancel: self.hidden ? self : appointment.status === 'cancelled' || finished ? hide() : OK,
  }
}

export interface AppointmentInput {
  shipmentId: string
  date: string
  slot: string
  plateNo: string
  pieces: number
  driverPhone: string
  proxy?: ProxyInput
}

function validateAppointment(ctx: Ctx, input: AppointmentInput) {
  const date = requireDate(input.date, '送货日期', today(ctx))
  if (!timeSlots.includes(input.slot)) throw new BizError('请选择时段', 400)
  const plateNo = requireText(input.plateNo, '车牌号')
  const pieces = requireInt(input.pieces, '件数')
  const driverPhone = requireText(input.driverPhone, '司机电话')
  if (!/^1\d{10}$/.test(driverPhone)) throw new BizError('司机电话请填11位手机号', 400)
  return { date, slot: input.slot, plateNo, pieces, driverPhone }
}

export function createAppointment(ctx: Ctx, input: AppointmentInput) {
  const shipment = getShipment(ctx, input.shipmentId)
  assertOk(shipmentActions(ctx, shipment).appoint)
  const supplier = findSupplier(ctx, shipment.supplierCode)
  const fields = validateAppointment(ctx, input)
  const proxy = proxyInfo(ctx, supplier, input.proxy)
  const status = ctx.config.appointmentNeedsConfirm ? 'pending' : 'booked'
  const appointment: Appointment = {
    id: nextId(ctx.db, 'yy'),
    no: nextNo(ctx.db, 'YYSH', ctx.now),
    shipmentId: shipment.id,
    shipmentNo: shipment.no,
    orderNo: shipment.orderNo,
    supplierCode: shipment.supplierCode,
    warehouseCode: shipment.warehouseCode,
    ...fields,
    status,
    history: [{ at: ctx.now, by: ctx.actor.userName, action: proxy ? '代录预约' : '提交预约', note: `${fields.date} ${fields.slot}` }],
    createdBy: ctx.actor.userName,
    createdAt: ctx.now,
    proxy,
  }
  ctx.db.appointments.push(appointment)
  logAppointment(ctx, appointment, proxy ? '代录预约送货' : '预约送货', status === 'booked' ? '「24」开关设为不需仓库确认' : undefined)
  return appointment
}

function logAppointment(ctx: Ctx, appointment: Appointment, action: string, note?: string) {
  audit(ctx, {
    objectType: '预约送货',
    objectId: appointment.id,
    objectNo: appointment.no,
    supplierCode: appointment.supplierCode,
    action,
    after: { 日期: appointment.date, 时段: appointment.slot, 车牌: appointment.plateNo, 件数: appointment.pieces },
    note,
    proxy: appointment.proxy,
  })
}

export function confirmAppointment(ctx: Ctx, id: string) {
  const appointment = getAppointment(ctx, id)
  assertOk(appointmentActions(ctx, appointment).confirm)
  appointment.status = 'confirmed'
  appointment.history.push({ at: ctx.now, by: ctx.actor.userName, action: '仓库确认' })
  logAppointment(ctx, appointment, '仓库确认预约')
  return appointment
}

export function returnAppointment(ctx: Ctx, id: string, note: string) {
  const appointment = getAppointment(ctx, id)
  assertOk(appointmentActions(ctx, appointment).return)
  const text = requireText(note, '退回原因')
  appointment.status = 'returned'
  appointment.history.push({ at: ctx.now, by: ctx.actor.userName, action: '退回改约', note: text })
  logAppointment(ctx, appointment, '退回改约', text)
  return appointment
}

export function rescheduleAppointment(ctx: Ctx, id: string, input: AppointmentInput) {
  const appointment = getAppointment(ctx, id)
  assertOk(appointmentActions(ctx, appointment).reschedule)
  const fields = validateAppointment(ctx, input)
  const before = `${appointment.date} ${appointment.slot}`
  Object.assign(appointment, fields)
  appointment.status = ctx.config.appointmentNeedsConfirm ? 'pending' : 'booked'
  appointment.history.push({ at: ctx.now, by: ctx.actor.userName, action: '改约', note: `${before} → ${fields.date} ${fields.slot}` })
  logAppointment(ctx, appointment, '改约')
  return appointment
}

export function cancelAppointment(ctx: Ctx, id: string, reason?: string) {
  const appointment = getAppointment(ctx, id)
  assertOk(appointmentActions(ctx, appointment).cancel)
  appointment.status = 'cancelled'
  appointment.history.push({ at: ctx.now, by: ctx.actor.userName, action: '取消预约', note: reason?.trim() || undefined })
  logAppointment(ctx, appointment, '取消预约', reason?.trim() || undefined)
  return appointment
}
