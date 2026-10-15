import { fmtPrice } from '../domain/format'
import { calcAmounts, round4 } from '../domain/money'
import { statusDef } from '../domain/labels'
import type {
  ChangeItem,
  CheckResult,
  OrderChange,
  OrderLine,
  PurchaseOrder,
  PushJob,
  PushKind,
} from '../domain/types'
import type { ActionState, Actions, OrderActionKey } from '../domain/views'
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
  isSupplierActor,
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
import { PUSH_LATENCY, lineQty, unfinishedChange } from './rules'

// ---------------------------------------------------------------- 读取

export function getOrder(ctx: Ctx, id: string) {
  const order = ctx.db.orders.find((o) => o.id === id)
  if (!order || (isSupplierActor(ctx) && order.confirmStatus === 'notSent')) {
    throw new BizError('采购订单不存在', 404)
  }
  assertScope(ctx, order.supplierCode)
  return order
}

const snapshot = (order: PurchaseOrder) => ({
  审核: statusDef('audit', order.auditStatus).label,
  推送: statusDef('push', order.pushStatus).label,
  确认: statusDef('confirm', order.confirmStatus).label,
  执行: statusDef('biz', order.bizStatus).label,
  承诺交期: order.promisedDate,
})

function logOrder(ctx: Ctx, order: PurchaseOrder, action: string, before?: Record<string, unknown>, note?: string, proxy?: ReturnType<typeof proxyInfo>) {
  audit(ctx, {
    objectType: '采购订单',
    objectId: order.id,
    objectNo: order.no,
    supplierCode: order.supplierCode,
    action,
    before,
    after: snapshot(order),
    note,
    proxy,
  })
}

// ---------------------------------------------------------------- 动作可用条件

export function orderActions(ctx: Ctx, order: PurchaseOrder): Actions<OrderActionKey> {
  const buyer = hasRole(ctx, 'buyer')
  const supplier = findSupplier(ctx, order.supplierCode)
  const self = actorGuard(ctx, supplier)
  const quantities = lineQty(ctx.db, order)
  const received = quantities.reduce((t, q) => t + q.received, 0)
  const moving = quantities.reduce((t, q) => t + q.inTransit + q.pendingShip, 0)
  const approved = order.auditStatus === 'approved'
  const open = order.bizStatus === 'open'
  const change = unfinishedChange(ctx.db, order.id)
  const job = order.pushJobId ? ctx.db.pushJobs.find((j) => j.id === order.pushJobId) : undefined

  const buyerOnly = (state: () => ActionState) => (buyer ? state() : hide())
  const draftOnly = () => (order.auditStatus === 'draft' ? OK : hide('只有草稿可以编辑和提交'))
  const pendingOnly = () => (order.auditStatus === 'pending' ? OK : hide())

  const closeState = (kind: 'close' | 'cancel') =>
    buyerOnly(() => {
      if (!approved || !open) return hide()
      if (ctx.config.closeInitiator !== 'srm') return deny('关闭、取消由谁发起还没有定（待确认-04）。可在原型配置里切换为演示由SRM发起')
      if (change && change.status !== 'draft') return deny(`有未完成的变更${change.no}，先处理变更`)
      if (kind === 'cancel' && received > 0) return deny('已有入库，不能取消')
      if (kind === 'cancel' && moving > 0) return deny('有在途通知或已提交的发货单，不能取消。在途怎么处理见待确认-04')
      return OK
    })

  const shipState = (): ActionState => {
    if (self.hidden) return self
    if (!approved) return hide()
    if (!open) return deny('订单已关闭或取消，不能再发货（《3》§3.1）')
    if (order.confirmStatus === 'rejected') return deny('供应商已拒绝这张订单')
    if (order.confirmStatus !== 'confirmed' && !ctx.config.shipBeforeConfirm) return deny('订单还没确认，不能发货（待确认-19）')
    if (!order.erp) return deny('ERP还没接收这张订单，无法按发货单生成收货通知')
    if (quantities.every((q) => q.shippable <= 0)) return deny('没有可发数量')
    return OK
  }

  return {
    edit: buyerOnly(draftOnly),
    submit: buyerOnly(draftOnly),
    withdraw: buyerOnly(pendingOnly),
    approve: buyerOnly(pendingOnly),
    reject: buyerOnly(pendingOnly),
    retryPush: buyerOnly(() => {
      if (order.pushStatus !== 'failed' || !job) return hide()
      if (!ctx.config.manualRetry) return deny('推送失败后只允许系统自动重试（待确认-06），原型不模拟自动重试')
      return OK
    }),
    check: buyerOnly(() => (order.erp ? OK : hide('ERP还没接收'))),
    change: buyerOnly(() => {
      if (!approved || !open) return hide()
      if (!order.erp) return deny('ERP还没接收这张订单，先完成推送')
      if (change && change.status !== 'draft') return deny(`已有未完成的变更${change.no}`)
      return OK
    }),
    close: closeState('close'),
    cancel: closeState('cancel'),
    confirm: self.hidden ? self : order.confirmStatus !== 'pending' ? hide() : open ? OK : deny('订单已关闭或取消'),
    refuse: self.hidden ? self : order.confirmStatus !== 'pending' ? hide() : open ? OK : deny('订单已关闭或取消'),
    suggest:
      self.hidden || !approved || !open || !['pending', 'confirmed'].includes(order.confirmStatus) ? hide() : OK,
    kitting: self.hidden || !open || order.confirmStatus !== 'confirmed' ? hide() : OK,
    ship: shipState(),
  }
}

// ---------------------------------------------------------------- 新建和编辑

export interface OrderInput {
  supplierCode: string
  warehouseCode: string
  promisedDate: string
  remark?: string
  lines: { skuCode: string; qty: number }[]
}

function buildLines(ctx: Ctx, input: OrderInput): OrderLine[] {
  if (!input.lines?.length) throw new BizError('至少要有一行', 400)
  return input.lines.map((row, index) => {
    const label = `第${index + 1}行`
    const sku = ctx.db.skus.find((s) => s.code === row.skuCode)
    if (!sku) throw new BizError(`${label}：请选择SKU`, 400)
    const qty = requireInt(row.qty, `${label}数量`)
    const price = ctx.db.prices.find((p) => p.supplierCode === input.supplierCode && p.skuCode === sku.code)
    if (!price) {
      throw new BizError(`${label}：${sku.code} ${sku.name}取不到ERP有效采购价，不能加入订单（待确认-43）`, 400)
    }
    const amounts = calcAmounts(qty, price.price, price.taxRate)
    return {
      lineNo: index + 1,
      skuCode: sku.code,
      skuName: sku.name,
      unit: sku.unit,
      qty,
      price: price.price,
      taxRate: price.taxRate,
      netPrice: amounts.netPrice,
      amount: amounts.amount,
      tax: amounts.tax,
      netAmount: amounts.netAmount,
      priceSource: price.source,
    }
  })
}

function validateHeader(ctx: Ctx, input: OrderInput) {
  const supplier = findSupplier(ctx, requireText(input.supplierCode, '供应商'))
  assertScope(ctx, supplier.code)
  if (supplier.tier === '暂停或待淘汰') {
    throw new BizError('这家供应商标记为暂停或待淘汰，不接新订单（《7》§二）', 409)
  }
  const warehouse = ctx.db.warehouses.find((w) => w.code === input.warehouseCode)
  if (!warehouse) throw new BizError('请选择收货仓', 400)
  const promisedDate = requireDate(input.promisedDate, '承诺交期', today(ctx))
  return { supplier, warehouse, promisedDate }
}

export function createOrder(ctx: Ctx, input: OrderInput, submit = false) {
  if (!hasRole(ctx, 'buyer')) throw new BizError('只有采购员可以新建采购订单', 403)
  const { supplier, warehouse, promisedDate } = validateHeader(ctx, input)
  const lines = buildLines(ctx, input)
  const order: PurchaseOrder = {
    id: nextId(ctx.db, 'po'),
    no: nextNo(ctx.db, '待定', ctx.now),
    supplierCode: supplier.code,
    supplierName: supplier.name,
    warehouseCode: warehouse.code,
    promisedDate,
    firstPromisedDate: promisedDate,
    currency: supplier.currency,
    remark: input.remark?.trim() ?? '',
    lines,
    auditStatus: 'draft',
    pushStatus: 'none',
    confirmStatus: 'notSent',
    bizStatus: 'open',
    createdBy: ctx.actor.userName,
    createdById: ctx.actor.userId,
    createdAt: ctx.now,
    updatedBy: ctx.actor.userName,
    updatedAt: ctx.now,
    changeSeq: 0,
  }
  ctx.db.orders.push(order)
  logOrder(ctx, order, '新建草稿')
  if (submit) submitOrder(ctx, order.id)
  return order
}

export function updateOrder(ctx: Ctx, id: string, input: OrderInput, submit = false) {
  const order = getOrder(ctx, id)
  assertOk(orderActions(ctx, order).edit)
  const before = { 供应商: order.supplierCode, 收货仓: order.warehouseCode, 承诺交期: order.promisedDate, 行数: order.lines.length }
  const { supplier, warehouse, promisedDate } = validateHeader(ctx, input)
  order.supplierCode = supplier.code
  order.supplierName = supplier.name
  order.currency = supplier.currency
  order.warehouseCode = warehouse.code
  order.promisedDate = promisedDate
  order.firstPromisedDate = promisedDate
  order.remark = input.remark?.trim() ?? ''
  order.lines = buildLines(ctx, input)
  order.updatedAt = ctx.now
  order.updatedBy = ctx.actor.userName
  audit(ctx, {
    objectType: '采购订单',
    objectId: order.id,
    objectNo: order.no,
    supplierCode: order.supplierCode,
    action: '编辑草稿',
    before,
    after: { 供应商: order.supplierCode, 收货仓: order.warehouseCode, 承诺交期: order.promisedDate, 行数: order.lines.length },
  })
  if (submit) submitOrder(ctx, order.id)
  return order
}

// ---------------------------------------------------------------- 审核

export function submitOrder(ctx: Ctx, id: string) {
  const order = getOrder(ctx, id)
  assertOk(orderActions(ctx, order).submit)
  const before = snapshot(order)
  order.auditStatus = 'pending'
  order.submittedBy = ctx.actor.userName
  order.submittedAt = ctx.now
  order.rejectComment = undefined
  order.updatedAt = ctx.now
  logOrder(ctx, order, '提交审核', before)
  return order
}

export function withdrawOrder(ctx: Ctx, id: string) {
  const order = getOrder(ctx, id)
  assertOk(orderActions(ctx, order).withdraw)
  const before = snapshot(order)
  order.auditStatus = 'draft'
  order.updatedAt = ctx.now
  logOrder(ctx, order, '撤回', before)
  return order
}

export function rejectOrder(ctx: Ctx, id: string, comment: string) {
  const order = getOrder(ctx, id)
  assertOk(orderActions(ctx, order).reject)
  const text = requireText(comment, '驳回意见')
  const before = snapshot(order)
  order.auditStatus = 'draft'
  order.rejectComment = text
  order.updatedAt = ctx.now
  logOrder(ctx, order, '驳回', before, text)
  return order
}

function dispatch(ctx: Ctx, order: PurchaseOrder, action: '下发供应商' | '变更后重新下发') {
  order.confirmStatus = 'pending'
  order.sentAt = ctx.now
  order.confirmedAt = undefined
  order.confirmBy = undefined
  ctx.db.confirmations.push({
    id: nextId(ctx.db, 'cf'),
    orderId: order.id,
    supplierCode: order.supplierCode,
    action,
    by: ctx.actor.userName,
    at: ctx.now,
  })
}

export function approveOrder(ctx: Ctx, id: string) {
  const order = getOrder(ctx, id)
  assertOk(orderActions(ctx, order).approve)
  const before = snapshot(order)
  order.auditStatus = 'approved'
  order.approvedBy = ctx.actor.userName
  order.approvedAt = ctx.now
  order.updatedAt = ctx.now
  const timing = ctx.config.dispatchTiming
  if (timing === 'onApprove' || timing === 'confirmBeforePush') dispatch(ctx, order, '下发供应商')
  if (timing === 'confirmBeforePush') order.pushStatus = 'waiting'
  logOrder(ctx, order, '审核通过', before, `下发时点：${dispatchLabel(timing)}（待确认-02）`)
  if (timing !== 'confirmBeforePush') startOrderPush(ctx, order, '审核通过后推送')
  return order
}

export function dispatchLabel(timing: Ctx['config']['dispatchTiming']) {
  return {
    onApprove: '审核通过即下发，同时推送',
    afterErpAccepted: 'ERP接收成功后才下发',
    confirmBeforePush: '先请供应商确认，确认后才推送',
  }[timing]
}

// ---------------------------------------------------------------- 推送ERP

function startOrderPush(ctx: Ctx, order: PurchaseOrder, trigger: string) {
  const job = startPush(ctx, '订单', { objectId: order.id, objectNo: order.no, order }, trigger)
  order.pushStatus = 'pushing'
  order.pushJobId = job.id
  return job
}

export function startPush(
  ctx: Ctx,
  kind: PushKind,
  ref: { objectId: string; objectNo: string; order: PurchaseOrder },
  trigger: string,
): PushJob {
  const job: PushJob = {
    id: nextId(ctx.db, 'job'),
    kind,
    objectId: ref.objectId,
    objectNo: ref.objectNo,
    orderId: ref.order.id,
    orderNo: ref.order.no,
    supplierCode: ref.order.supplierCode,
    status: 'pushing',
    attempts: [],
    createdAt: ctx.now,
    updatedAt: ctx.now,
  }
  addAttempt(ctx, job, trigger)
  ctx.db.pushJobs.push(job)
  return job
}

function addAttempt(ctx: Ctx, job: PushJob, trigger: string) {
  job.attempts.push({
    seq: job.attempts.length + 1,
    startedAt: ctx.now,
    trigger,
    operator: ctx.actor.userName,
    planned: ctx.config.erpAvailable ? 'success' : 'fail',
    result: 'pending',
    message: '推送中',
  })
  job.status = 'pushing'
  job.updatedAt = ctx.now
}

export function pushJobActions(ctx: Ctx, job: PushJob) {
  const buyer = hasRole(ctx, 'buyer')
  const order = ctx.db.orders.find((o) => o.id === job.orderId)
  return {
    retry: !buyer || job.status !== 'failed'
      ? hide()
      : ctx.config.manualRetry
        ? OK
        : deny('推送失败后只允许系统自动重试（待确认-06），原型不模拟自动重试'),
    check: buyer && job.kind === '订单' && order?.erp ? OK : hide(),
  }
}

/** 重推同一笔：沿用原来的SRM对象和推送记录，按次追加，不复制成新单（A02）。 */
export function retryPush(ctx: Ctx, jobId: string) {
  const job = ctx.db.pushJobs.find((j) => j.id === jobId)
  if (!job) throw new BizError('推送记录不存在', 404)
  assertScope(ctx, job.supplierCode)
  assertOk(pushJobActions(ctx, job).retry)
  addAttempt(ctx, job, '采购员手工重推')
  const order = ctx.db.orders.find((o) => o.id === job.orderId)
  if (job.kind === '订单' && order) order.pushStatus = 'pushing'
  if (job.kind === '变更') {
    const change = ctx.db.changes.find((c) => c.id === job.objectId)
    if (change) change.status = 'pushing'
  }
  audit(ctx, {
    objectType: `推送记录（${job.kind}）`,
    objectId: job.id,
    objectNo: job.objectNo,
    supplierCode: job.supplierCode,
    action: `重推（第${job.attempts.length}次）`,
  })
  return job
}

/** 推送结果在发起时就按「模拟ERP接口状态」定好，约1.2秒后落地。任何一次接口调用都会先结算到期的推送。 */
export function settlePushes(ctx: Ctx) {
  let changed = false
  for (const job of ctx.db.pushJobs) {
    if (job.status !== 'pushing') continue
    const attempt = job.attempts[job.attempts.length - 1]
    if (!attempt || attempt.result !== 'pending' || ctx.now - attempt.startedAt < PUSH_LATENCY) continue
    const at = attempt.startedAt + PUSH_LATENCY
    const sys = systemCtx(ctx, at)
    attempt.settledAt = at
    attempt.result = attempt.planned
    attempt.message = attempt.planned === 'success' ? 'ERP已接收（模拟）' : '模拟失败：原型配置里的ERP接口设为不可用'
    job.updatedAt = at
    job.status = attempt.planned === 'success' ? 'accepted' : 'failed'
    if (attempt.planned === 'success') onPushAccepted(sys, job)
    else onPushFailed(sys, job)
    changed = true
  }
  return changed
}

function onPushAccepted(ctx: Ctx, job: PushJob) {
  const order = ctx.db.orders.find((o) => o.id === job.orderId)
  if (!order) return
  if (job.kind === '订单') {
    const before = snapshot(order)
    order.erp = {
      no: ctx.config.erpNoMode === 'erpOwn' ? nextNo(ctx.db, 'CGDD', ctx.now) : order.no,
      sourceNo: order.no,
      receivedAt: ctx.now,
      supplierCode: order.supplierCode,
      warehouseCode: order.warehouseCode,
      promisedDate: order.promisedDate,
      lines: order.lines.map((l) => ({ lineNo: l.lineNo, skuCode: l.skuCode, qty: l.qty, price: l.price })),
      bizStatus: order.bizStatus,
    }
    order.pushStatus = 'accepted'
    if (ctx.config.dispatchTiming === 'afterErpAccepted' && order.confirmStatus === 'notSent') dispatch(ctx, order, '下发供应商')
    logOrder(ctx, order, 'ERP接收成功', before, `ERP采购订单号：${order.erp.no}（待确认-05）`)
  } else if (job.kind === '变更') {
    const change = ctx.db.changes.find((c) => c.id === job.objectId)
    if (change) applyChange(ctx, order, change)
  } else if (job.kind === '关闭同步') {
    if (order.erp) order.erp.bizStatus = order.bizStatus
    logOrder(ctx, order, 'ERP关闭状态已同步')
  } else if (job.kind === '发货单') {
    audit(ctx, {
      objectType: '发货单',
      objectId: job.objectId,
      objectNo: job.objectNo,
      supplierCode: job.supplierCode,
      action: 'ERP已接收发货单，待生成收货通知单',
    })
  }
}

function onPushFailed(ctx: Ctx, job: PushJob) {
  const order = ctx.db.orders.find((o) => o.id === job.orderId)
  if (job.kind === '订单' && order) {
    order.pushStatus = 'failed'
    logOrder(ctx, order, '推送ERP失败', undefined, '保留SRM订单，可重推同一笔')
  }
  if (job.kind === '变更') {
    const change = ctx.db.changes.find((c) => c.id === job.objectId)
    if (change) {
      change.status = 'failed'
      audit(ctx, {
        objectType: '订单变更',
        objectId: change.id,
        objectNo: change.no,
        supplierCode: change.supplierCode,
        action: '变更推送ERP失败',
        note: 'SRM已接受、ERP尚未更新',
      })
    }
  }
  if (job.kind === '关闭同步' || job.kind === '发货单') {
    audit(ctx, {
      objectType: job.kind === '发货单' ? '发货单' : '采购订单',
      objectId: job.objectId,
      objectNo: job.objectNo,
      supplierCode: job.supplierCode,
      action: `${job.kind}推送ERP失败`,
    })
  }
}

/** 核对七项：单号、供应商、行、数量、价格、交期、关闭状态（A02）。 */
export function checkOrder(ctx: Ctx, id: string): CheckResult {
  const order = getOrder(ctx, id)
  assertOk(orderActions(ctx, order).check)
  const erp = order.erp!
  const join = (values: (string | number)[]) => values.join(' / ')
  const items = [
    { item: '单号', srm: order.no, erp: `${erp.no}（来源单号${erp.sourceNo}）`, ok: erp.sourceNo === order.no },
    { item: '供应商', srm: order.supplierCode, erp: erp.supplierCode, ok: erp.supplierCode === order.supplierCode },
    {
      item: '行',
      srm: join(order.lines.map((l) => `${l.lineNo}:${l.skuCode}`)),
      erp: join(erp.lines.map((l) => `${l.lineNo}:${l.skuCode}`)),
      ok: join(order.lines.map((l) => `${l.lineNo}:${l.skuCode}`)) === join(erp.lines.map((l) => `${l.lineNo}:${l.skuCode}`)),
    },
    {
      item: '数量',
      srm: join(order.lines.map((l) => l.qty)),
      erp: join(erp.lines.map((l) => l.qty)),
      ok: join(order.lines.map((l) => l.qty)) === join(erp.lines.map((l) => l.qty)),
    },
    {
      item: '价格',
      srm: join(order.lines.map((l) => fmtPrice(l.price))),
      erp: join(erp.lines.map((l) => fmtPrice(l.price))),
      ok: join(order.lines.map((l) => l.price)) === join(erp.lines.map((l) => l.price)),
    },
    { item: '交期', srm: order.promisedDate, erp: erp.promisedDate, ok: order.promisedDate === erp.promisedDate },
    {
      item: '关闭状态',
      srm: statusDef('biz', order.bizStatus).label,
      erp: statusDef('biz', erp.bizStatus).label,
      ok: order.bizStatus === erp.bizStatus,
    },
  ]
  const result: CheckResult = { at: ctx.now, by: ctx.actor.userName, consistent: items.every((i) => i.ok), items }
  order.lastCheck = result
  logOrder(
    ctx,
    order,
    '核对ERP',
    undefined,
    result.consistent ? '七项一致' : `有差异：${items.filter((i) => !i.ok).map((i) => i.item).join('、')}`,
  )
  return result
}

export function closeOrder(ctx: Ctx, id: string, kind: 'close' | 'cancel', reason: string) {
  const order = getOrder(ctx, id)
  assertOk(orderActions(ctx, order)[kind])
  const text = requireText(reason, kind === 'close' ? '关闭原因' : '取消原因')
  const before = snapshot(order)
  order.bizStatus = kind === 'close' ? 'closed' : 'cancelled'
  order.closeInfo = { kind, reason: text, by: ctx.actor.userName, at: ctx.now }
  order.updatedAt = ctx.now
  for (const change of ctx.db.changes) {
    if (change.orderId === order.id && change.status === 'draft') change.status = 'discarded'
  }
  logOrder(ctx, order, kind === 'close' ? '关闭订单' : '取消订单', before, text)
  if (order.erp) startPush(ctx, '关闭同步', { objectId: order.id, objectNo: order.no, order }, `${kind === 'close' ? '关闭' : '取消'}后同步ERP`)
  return order
}

// ---------------------------------------------------------------- 供应商确认

export function confirmOrder(ctx: Ctx, id: string, proxy?: ProxyInput) {
  const order = getOrder(ctx, id)
  assertOk(orderActions(ctx, order).confirm)
  const supplier = findSupplier(ctx, order.supplierCode)
  const info = proxyInfo(ctx, supplier, proxy)
  const before = snapshot(order)
  order.confirmStatus = 'confirmed'
  order.confirmedAt = ctx.now
  order.confirmBy = ctx.actor.userName
  order.updatedAt = ctx.now
  ctx.db.confirmations.push({
    id: nextId(ctx.db, 'cf'),
    orderId: order.id,
    supplierCode: order.supplierCode,
    action: '确认接单',
    by: ctx.actor.userName,
    at: ctx.now,
    proxy: info,
  })
  logOrder(ctx, order, info ? '代录确认接单' : '确认接单', before, '按订单接单，不带条件', info)
  if (ctx.config.dispatchTiming === 'confirmBeforePush' && ['none', 'waiting'].includes(order.pushStatus)) {
    startOrderPush(ctx, order, '供应商确认后推送')
  }
  return order
}

export function refuseOrder(ctx: Ctx, id: string, reason: string, proxy?: ProxyInput) {
  const order = getOrder(ctx, id)
  assertOk(orderActions(ctx, order).refuse)
  const supplier = findSupplier(ctx, order.supplierCode)
  const text = requireText(reason, '拒绝原因')
  const info = proxyInfo(ctx, supplier, proxy)
  const before = snapshot(order)
  order.confirmStatus = 'rejected'
  order.refuseReason = text
  order.updatedAt = ctx.now
  if (order.pushStatus === 'waiting') order.pushStatus = 'none'
  ctx.db.confirmations.push({
    id: nextId(ctx.db, 'cf'),
    orderId: order.id,
    supplierCode: order.supplierCode,
    action: '拒绝接单',
    reason: text,
    by: ctx.actor.userName,
    at: ctx.now,
    proxy: info,
  })
  logOrder(ctx, order, info ? '代录拒绝接单' : '拒绝接单', before, text, info)
  return order
}

// ---------------------------------------------------------------- 订单变更

export interface ChangeInput {
  promisedDate?: string
  warehouseCode?: string
  lines?: { lineNo: number; qty?: number; price?: number }[]
  reason: string
}

function buildChangeItems(ctx: Ctx, order: PurchaseOrder, input: ChangeInput): ChangeItem[] {
  const items: ChangeItem[] = []
  const fields = ctx.config.changeFields
  if (input.promisedDate && input.promisedDate !== order.promisedDate) {
    const date = requireDate(input.promisedDate, '新的承诺交期', today(ctx))
    items.push({ field: 'promisedDate', label: '承诺交期', before: order.promisedDate, after: date })
  }
  if (input.warehouseCode && input.warehouseCode !== order.warehouseCode) {
    if (!fields.warehouse) throw new BizError('推送后能否改收货仓库还没有定（待确认-03），原型配置没有打开', 409)
    const warehouse = ctx.db.warehouses.find((w) => w.code === input.warehouseCode)
    if (!warehouse) throw new BizError('收货仓不存在', 400)
    const shipped = ctx.db.shipments.some((s) => s.orderId === order.id && s.status === 'submitted')
    if (shipped) throw new BizError('已有提交的发货单，改收货仓会牵动已生成的收货通知（待确认-03）', 409)
    items.push({ field: 'warehouse', label: '收货仓', before: order.warehouseCode, after: warehouse.code })
  }
  const quantities = lineQty(ctx.db, order)
  for (const row of input.lines ?? []) {
    const line = order.lines.find((l) => l.lineNo === row.lineNo)
    if (!line) throw new BizError(`第${row.lineNo}行不存在`, 400)
    if (row.qty !== undefined && row.qty !== line.qty) {
      if (!fields.qty) throw new BizError('推送后能否改采购数量还没有定（待确认-03），原型配置没有打开', 409)
      const qty = requireInt(row.qty, `第${line.lineNo}行采购数量`)
      const q = quantities.find((item) => item.lineNo === line.lineNo)!
      const floor = q.received + q.inTransit + q.pendingShip
      if (qty < floor) {
        throw new BizError(
          `第${line.lineNo}行不能改到${floor}以下：已入库、在途通知和已提交未生成通知合计${floor}。已下发的通知怎样联动见待确认-03`,
          409,
        )
      }
      items.push({ field: 'qty', lineNo: line.lineNo, label: `第${line.lineNo}行采购数量`, before: line.qty, after: qty })
    }
    if (row.price !== undefined && row.price !== line.price) {
      if (!fields.price) throw new BizError('推送后能否改含税单价还没有定（待确认-03），原型配置没有打开', 409)
      const price = Number(row.price)
      if (!(price > 0) || round4(price) !== price) throw new BizError(`第${line.lineNo}行含税单价须大于0，最多4位小数`, 400)
      items.push({ field: 'price', lineNo: line.lineNo, label: `第${line.lineNo}行含税单价`, before: line.price, after: price })
    }
  }
  if (!items.length) throw new BizError('没有改动任何字段', 400)
  return items
}

export function getChange(ctx: Ctx, id: string) {
  const change = ctx.db.changes.find((c) => c.id === id)
  if (!change) throw new BizError('订单变更不存在', 404)
  if (isSupplierActor(ctx)) throw new BizError('无权查看', 403)
  assertScope(ctx, change.supplierCode)
  return change
}

export function changeActions(ctx: Ctx, change: OrderChange) {
  const buyer = hasRole(ctx, 'buyer')
  const job = change.pushJobId ? ctx.db.pushJobs.find((j) => j.id === change.pushJobId) : undefined
  const draft = buyer && change.status === 'draft' ? OK : hide()
  const pending = buyer && change.status === 'pending' ? OK : hide()
  return {
    edit: draft,
    submit: draft,
    discard: draft,
    approve: pending,
    reject: pending,
    retryPush: job ? pushJobActions(ctx, job).retry : hide(),
  }
}

function logChange(ctx: Ctx, change: OrderChange, action: string, note?: string) {
  audit(ctx, {
    objectType: '订单变更',
    objectId: change.id,
    objectNo: change.no,
    supplierCode: change.supplierCode,
    action,
    before: Object.fromEntries(change.items.map((i) => [i.label, i.before])),
    after: Object.fromEntries(change.items.map((i) => [i.label, i.after])),
    note,
  })
}

export function createChange(
  ctx: Ctx,
  orderId: string,
  input: ChangeInput,
  submit = false,
  source: { suggestionId?: string } = {},
) {
  const order = getOrder(ctx, orderId)
  const existing = unfinishedChange(ctx.db, order.id)
  if (existing?.status === 'draft' && !source.suggestionId) {
    return updateChange(ctx, existing.id, input, submit)
  }
  assertOk(orderActions(ctx, order).change)
  const items = buildChangeItems(ctx, order, input)
  const reason = requireText(input.reason, '变更原因')
  order.changeSeq += 1
  const change: OrderChange = {
    id: nextId(ctx.db, 'chg'),
    no: `${order.no}·变更#${order.changeSeq}`,
    seq: order.changeSeq,
    orderId: order.id,
    orderNo: order.no,
    supplierCode: order.supplierCode,
    items,
    reason,
    source: source.suggestionId ? 'suggestion' : 'buyer',
    suggestionId: source.suggestionId,
    status: 'draft',
    needApproval: ctx.config.changeNeedsApproval,
    needReconfirm: ctx.config.reconfirmAfterChange,
    createdBy: ctx.actor.userName,
    createdAt: ctx.now,
  }
  ctx.db.changes.push(change)
  logChange(ctx, change, '新建变更', reason)
  if (submit) submitChange(ctx, change.id)
  return change
}

export function updateChange(ctx: Ctx, id: string, input: ChangeInput, submit = false) {
  const change = getChange(ctx, id)
  assertOk(changeActions(ctx, change).edit)
  const order = getOrder(ctx, change.orderId)
  change.items = buildChangeItems(ctx, order, input)
  change.reason = requireText(input.reason, '变更原因')
  logChange(ctx, change, '编辑变更草稿', change.reason)
  if (submit) submitChange(ctx, change.id)
  return change
}

function startChangePush(ctx: Ctx, change: OrderChange, trigger: string) {
  const order = getOrder(ctx, change.orderId)
  const job = startPush(ctx, '变更', { objectId: change.id, objectNo: change.no, order }, trigger)
  change.status = 'pushing'
  change.pushJobId = job.id
}

export function submitChange(ctx: Ctx, id: string) {
  const change = getChange(ctx, id)
  assertOk(changeActions(ctx, change).submit)
  const order = getOrder(ctx, change.orderId)
  if (order.bizStatus !== 'open') throw new BizError('订单已关闭或取消', 409)
  change.items = buildChangeItems(ctx, order, {
    promisedDate: change.items.find((i) => i.field === 'promisedDate')?.after as string | undefined,
    warehouseCode: change.items.find((i) => i.field === 'warehouse')?.after as string | undefined,
    lines: order.lines.map((l) => ({
      lineNo: l.lineNo,
      qty: change.items.find((i) => i.field === 'qty' && i.lineNo === l.lineNo)?.after as number | undefined,
      price: change.items.find((i) => i.field === 'price' && i.lineNo === l.lineNo)?.after as number | undefined,
    })),
    reason: change.reason,
  })
  change.submittedAt = ctx.now
  change.needApproval = ctx.config.changeNeedsApproval
  change.needReconfirm = ctx.config.reconfirmAfterChange
  if (change.needApproval) {
    change.status = 'pending'
    logChange(ctx, change, '提交变更审核', '要不要审核按「41」开关')
  } else {
    logChange(ctx, change, '提交变更，直接推送ERP', '「41」开关设为不审核')
    startChangePush(ctx, change, '变更提交后推送')
  }
  return change
}

export function approveChange(ctx: Ctx, id: string) {
  const change = getChange(ctx, id)
  assertOk(changeActions(ctx, change).approve)
  change.approvedBy = ctx.actor.userName
  change.approvedAt = ctx.now
  logChange(ctx, change, '变更审核通过')
  startChangePush(ctx, change, '变更审核通过后推送')
  return change
}

export function rejectChange(ctx: Ctx, id: string, comment: string) {
  const change = getChange(ctx, id)
  assertOk(changeActions(ctx, change).reject)
  change.rejectComment = requireText(comment, '驳回意见')
  change.status = 'rejected'
  logChange(ctx, change, '驳回变更', change.rejectComment)
  const suggestion = change.suggestionId ? ctx.db.suggestions.find((s) => s.id === change.suggestionId) : undefined
  if (suggestion) {
    suggestion.status = 'rejected'
    suggestion.handleNote = `据此生成的变更被驳回：${change.rejectComment}`
    suggestion.handledAt = ctx.now
    suggestion.handledBy = ctx.actor.userName
  }
  return change
}

export function discardChange(ctx: Ctx, id: string) {
  const change = getChange(ctx, id)
  assertOk(changeActions(ctx, change).discard)
  change.status = 'discarded'
  logChange(ctx, change, '作废变更草稿')
  return change
}

/** 承诺交期只在推送成功之后变化（《10》）。 */
function applyChange(ctx: Ctx, order: PurchaseOrder, change: OrderChange) {
  const before = snapshot(order)
  for (const item of change.items) {
    if (item.field === 'promisedDate') order.promisedDate = String(item.after)
    if (item.field === 'warehouse') order.warehouseCode = String(item.after)
    if (item.field === 'qty' || item.field === 'price') {
      const line = order.lines.find((l) => l.lineNo === item.lineNo)
      if (!line) continue
      if (item.field === 'qty') line.qty = Number(item.after)
      if (item.field === 'price') line.price = Number(item.after)
      const amounts = calcAmounts(line.qty, line.price, line.taxRate)
      Object.assign(line, amounts)
    }
  }
  if (order.erp) {
    order.erp.promisedDate = order.promisedDate
    order.erp.warehouseCode = order.warehouseCode
    order.erp.lines = order.lines.map((l) => ({ lineNo: l.lineNo, skuCode: l.skuCode, qty: l.qty, price: l.price }))
  }
  change.status = 'effective'
  change.effectiveAt = ctx.now
  order.updatedAt = ctx.now
  logChange(ctx, change, '变更已生效，ERP已更新')
  logOrder(ctx, order, `变更生效（${change.no}）`, before)
  if (change.needReconfirm || order.confirmStatus === 'rejected') {
    dispatch(ctx, order, '变更后重新下发')
    logOrder(ctx, order, '变更后重新下发供应商', undefined, order.confirmStatus === 'rejected' ? '被拒订单变更后重新下发' : '「03」开关要求重新确认')
  }
}

// ---------------------------------------------------------------- 交期建议

export function getSuggestion(ctx: Ctx, id: string) {
  const suggestion = ctx.db.suggestions.find((s) => s.id === id)
  if (!suggestion) throw new BizError('交期建议不存在', 404)
  assertScope(ctx, suggestion.supplierCode)
  return suggestion
}

export function suggestionActions(ctx: Ctx, suggestion: { status: string; orderId: string }) {
  const state = hasRole(ctx, 'buyer') && suggestion.status === 'pending' ? OK : hide()
  if (!state.ok) return { accept: state, reject: state }
  const order = ctx.db.orders.find((o) => o.id === suggestion.orderId)
  const change = unfinishedChange(ctx.db, suggestion.orderId)
  let accept = OK
  if (!order || order.bizStatus !== 'open') accept = deny('订单已关闭或取消')
  else if (!order.erp) accept = deny('ERP还没接收这张订单，先完成推送')
  else if (change) accept = deny(`已有未完成的变更${change.no}，先处理完再接受`)
  return { accept, reject: OK }
}

export function createSuggestion(ctx: Ctx, orderId: string, input: { suggestedDate: string; reason: string; proxy?: ProxyInput }) {
  const order = getOrder(ctx, orderId)
  assertOk(orderActions(ctx, order).suggest)
  const supplier = findSupplier(ctx, order.supplierCode)
  const suggestedDate = requireDate(input.suggestedDate, '建议交期', today(ctx))
  if (suggestedDate === order.promisedDate) throw new BizError('建议交期和当前承诺交期相同', 400)
  const reason = requireText(input.reason, '原因')
  const info = proxyInfo(ctx, supplier, input.proxy)
  const suggestion = {
    id: nextId(ctx.db, 'sg'),
    no: nextNo(ctx.db, 'JYJS', ctx.now),
    orderId: order.id,
    orderNo: order.no,
    supplierCode: order.supplierCode,
    currentDate: order.promisedDate,
    suggestedDate,
    reason,
    status: 'pending' as const,
    submittedBy: ctx.actor.userName,
    submittedAt: ctx.now,
    proxy: info,
  }
  ctx.db.suggestions.push(suggestion)
  audit(ctx, {
    objectType: '交期建议',
    objectId: suggestion.id,
    objectNo: suggestion.no,
    supplierCode: order.supplierCode,
    action: info ? '代录交期建议' : '提交交期建议',
    before: { 承诺交期: order.promisedDate },
    after: { 建议交期: suggestedDate },
    note: reason,
    proxy: info,
  })
  return suggestion
}

/** 接受即在SRM生成变更并提交，ERP不单独改期（《10》）。 */
export function acceptSuggestion(ctx: Ctx, id: string, note?: string) {
  const suggestion = getSuggestion(ctx, id)
  assertOk(suggestionActions(ctx, suggestion).accept)
  const order = getOrder(ctx, suggestion.orderId)
  assertOk(orderActions(ctx, order).change)
  const change = createChange(
    ctx,
    order.id,
    { promisedDate: suggestion.suggestedDate, reason: `采纳交期建议${suggestion.no}：${suggestion.reason}` },
    true,
    { suggestionId: suggestion.id },
  )
  suggestion.status = 'accepted'
  suggestion.handledBy = ctx.actor.userName
  suggestion.handledAt = ctx.now
  suggestion.handleNote = note?.trim() || undefined
  suggestion.changeId = change.id
  audit(ctx, {
    objectType: '交期建议',
    objectId: suggestion.id,
    objectNo: suggestion.no,
    supplierCode: suggestion.supplierCode,
    action: '接受交期建议',
    note: `生成变更${change.no}`,
  })
  return suggestion
}

export function rejectSuggestion(ctx: Ctx, id: string, note: string) {
  const suggestion = getSuggestion(ctx, id)
  assertOk(suggestionActions(ctx, suggestion).reject)
  suggestion.status = 'rejected'
  suggestion.handledBy = ctx.actor.userName
  suggestion.handledAt = ctx.now
  suggestion.handleNote = requireText(note, '驳回原因')
  audit(ctx, {
    objectType: '交期建议',
    objectId: suggestion.id,
    objectNo: suggestion.no,
    supplierCode: suggestion.supplierCode,
    action: '驳回交期建议',
    note: suggestion.handleNote,
  })
  return suggestion
}

// ---------------------------------------------------------------- 齐套

export interface KittingInput {
  lineNo: number
  nodeName: string
  status: '已齐套' | '缺料'
  materialName?: string
  expectedDate?: string
  impact?: string
  proxy?: ProxyInput
}

export function reportKitting(ctx: Ctx, orderId: string, input: KittingInput) {
  const order = getOrder(ctx, orderId)
  assertOk(orderActions(ctx, order).kitting)
  const supplier = findSupplier(ctx, order.supplierCode)
  const line = order.lines.find((l) => l.lineNo === Number(input.lineNo))
  if (!line) throw new BizError('请选择订单行', 400)
  const nodeName = requireText(input.nodeName, '节点名称')
  if (input.status !== '已齐套' && input.status !== '缺料') throw new BizError('请选择齐套情况', 400)
  const shortage = input.status === '缺料'
  const record = {
    id: nextId(ctx.db, 'kt'),
    orderId: order.id,
    orderNo: order.no,
    supplierCode: order.supplierCode,
    lineNo: line.lineNo,
    nodeName,
    status: input.status,
    materialName: shortage ? requireText(input.materialName, '缺的物料') : undefined,
    expectedDate: shortage ? requireDate(input.expectedDate, '预计到料日期') : undefined,
    impact: shortage ? input.impact?.trim() || undefined : undefined,
    reportedBy: ctx.actor.userName,
    reportedAt: ctx.now,
    proxy: proxyInfo(ctx, supplier, input.proxy),
  }
  ctx.db.kitting.push(record)
  audit(ctx, {
    objectType: '齐套记录',
    objectId: record.id,
    objectNo: order.no,
    supplierCode: order.supplierCode,
    action: record.proxy ? '代录齐套反馈' : '齐套反馈',
    after: { 行: line.lineNo, 节点: nodeName, 情况: record.status, 物料: record.materialName ?? '-' },
    proxy: record.proxy,
  })
  return record
}

export function kittingActions(ctx: Ctx, record: { review?: unknown }) {
  return { review: !hasRole(ctx, 'quality') ? hide() : record.review ? hide('已复核') : OK }
}

export function reviewKitting(ctx: Ctx, id: string, note: string) {
  const record = ctx.db.kitting.find((k) => k.id === id)
  if (!record) throw new BizError('齐套记录不存在', 404)
  assertScope(ctx, record.supplierCode)
  assertOk(kittingActions(ctx, record).review)
  record.review = { by: ctx.actor.userName, at: ctx.now, note: requireText(note, '复核意见') }
  audit(ctx, {
    objectType: '齐套记录',
    objectId: record.id,
    objectNo: record.orderNo,
    supplierCode: record.supplierCode,
    action: '品质复核',
    note: record.review.note,
  })
  return record
}
