import { periodOf } from '../domain/format'
import { round2 } from '../domain/money'
import type { Invoice, InvoiceRequest, ReconLine, Reconciliation, RedLetter } from '../domain/types'
import {
  BizError,
  OK,
  assertOk,
  assertScope,
  audit,
  deny,
  findSupplier,
  hasRole,
  hide,
  isEnterprise,
  isSupplierActor,
  nextId,
  nextNo,
  requireDate,
  requireText,
  systemCtx,
  type Ctx,
} from './core'
import { RED_FORM_LIMIT, invoiceRemaining, precheckBlocking, requestStatus, runPrecheck } from './rules'

const sumMoney = (values: number[]) => round2(values.reduce((t, v) => t + v, 0))

// ---------------------------------------------------------------- 对账

const lineKey = (line: Pick<ReconLine, 'docType' | 'docId' | 'lineNo'>) => `${line.docType}:${line.docId}:${line.lineNo}`

/** 只取ERP已审核的采购入库单和采退出库单（《4》§六）；已在有效对账单里的行不重复取。 */
export function reconCandidates(ctx: Ctx, supplierCode: string, period: string, excludeId?: string): ReconLine[] {
  const used = new Set(
    ctx.db.reconciliations
      .filter((r) => r.status !== 'cancelled' && r.id !== excludeId)
      .flatMap((r) => r.lines.map(lineKey)),
  )
  const lines: ReconLine[] = []
  for (const receipt of ctx.db.receipts) {
    if (receipt.supplierCode !== supplierCode || periodOf(receipt.date) !== period || receipt.createdAt > ctx.now) continue
    for (const line of receipt.lines) {
      lines.push({
        id: `${receipt.id}:${line.lineNo}`,
        docType: '采购入库单',
        docId: receipt.id,
        docNo: receipt.no,
        docDate: receipt.date,
        orderNo: receipt.orderNo,
        erpOrderNo: receipt.erpOrderNo,
        lineNo: line.lineNo,
        skuCode: line.skuCode,
        skuName: line.skuName,
        unit: line.unit,
        qty: line.qty,
        price: line.price,
        taxRate: line.taxRate,
        amount: line.amount,
        tax: line.tax,
        netAmount: line.netAmount,
      })
    }
  }
  for (const item of ctx.db.returns) {
    if (item.supplierCode !== supplierCode || item.erpStatus !== '已出库' || !item.outboundDate) continue
    if (periodOf(item.outboundDate) !== period || (item.outboundAt ?? item.createdAt) > ctx.now) continue
    for (const line of item.lines) {
      lines.push({
        id: `${item.id}:${line.lineNo}`,
        docType: '采退出库单',
        docId: item.id,
        docNo: item.outboundNo ?? item.returnNo,
        docDate: item.outboundDate,
        orderNo: item.orderNo,
        erpOrderNo: item.erpOrderNo,
        lineNo: line.lineNo,
        skuCode: line.skuCode,
        skuName: line.skuName,
        unit: line.unit,
        qty: -line.qty,
        price: line.price,
        taxRate: line.taxRate,
        amount: -line.amount,
        tax: -line.tax,
        netAmount: -line.netAmount,
      })
    }
  }
  return lines.filter((line) => !used.has(lineKey(line))).sort((a, b) => a.docDate.localeCompare(b.docDate))
}

function totalsOf(lines: ReconLine[]) {
  return {
    qty: lines.reduce((t, l) => t + l.qty, 0),
    amount: sumMoney(lines.map((l) => l.amount)),
    tax: sumMoney(lines.map((l) => l.tax)),
    netAmount: sumMoney(lines.map((l) => l.netAmount)),
  }
}

export function reconCreateState(ctx: Ctx) {
  const mode = ctx.config.reconInitiator
  const label = { enterprise: '企业侧', supplier: '供应商', both: '双方' }[mode]
  if (isSupplierActor(ctx)) {
    return mode === 'enterprise' ? hide(`对账发起方当前演示为${label}（待确认-16）`) : OK
  }
  if (!hasRole(ctx, 'buyer', 'finance')) return hide()
  return mode === 'supplier' ? deny(`对账发起方当前演示为${label}（待确认-16）`) : OK
}

export function getRecon(ctx: Ctx, id: string) {
  const recon = ctx.db.reconciliations.find((r) => r.id === id)
  if (!recon) throw new BizError('对账单不存在', 404)
  assertScope(ctx, recon.supplierCode)
  if (isSupplierActor(ctx) && recon.status === 'drafted' && recon.initiator === 'enterprise') {
    throw new BizError('对账单不存在', 404)
  }
  return recon
}

export function reconActions(ctx: Ctx, recon: Reconciliation) {
  const enterprise = hasRole(ctx, 'buyer', 'finance')
  const supplier = isSupplierActor(ctx) && ctx.actor.supplierCode === recon.supplierCode
  const request = ctx.db.invoiceRequests.find((r) => r.reconciliationId === recon.id)
  const cancel = () => {
    if (!enterprise || recon.status === 'cancelled') return hide()
    if (request) return deny('已生成开票申请，不能取消')
    if (recon.status === 'drafted') return OK
    return ctx.config.reconCancelAllowed ? OK : deny('已发送未开票的对账单能否取消还没有定（待确认-16）')
  }
  return {
    send: enterprise && recon.status === 'drafted' ? OK : hide(),
    confirm: supplier && recon.status === 'sent' ? OK : hide(),
    dispute: supplier && recon.status === 'sent' ? OK : hide(),
    resolve: enterprise && recon.status === 'disputed' ? OK : hide(),
    cancel: cancel(),
    createRequest: !hasRole(ctx, 'finance') || recon.status !== 'confirmed' ? hide() : request ? hide('已生成') : OK,
  }
}

function logRecon(ctx: Ctx, recon: Reconciliation, action: string, note?: string) {
  recon.history.push({ at: ctx.now, by: ctx.actor.userName, action, note })
  audit(ctx, {
    objectType: '对账单',
    objectId: recon.id,
    objectNo: recon.no,
    supplierCode: recon.supplierCode,
    action,
    after: { 状态: recon.status, 价税合计: recon.totals.amount, 行数: recon.lines.length },
    note,
  })
}

export function createRecon(ctx: Ctx, input: { supplierCode: string; period: string }) {
  assertOk(reconCreateState(ctx))
  const supplierCode = isSupplierActor(ctx) ? ctx.actor.supplierCode! : requireText(input.supplierCode, '供应商')
  findSupplier(ctx, supplierCode)
  assertScope(ctx, supplierCode)
  const period = requireText(input.period, '对账期间')
  if (!/^\d{4}-\d{2}$/.test(period)) throw new BizError('对账期间格式为YYYY-MM', 400)
  const lines = reconCandidates(ctx, supplierCode, period)
  if (!lines.length) throw new BizError('这个期间没有可对账的ERP已审核采购入库单或采退出库单', 409)
  const fromSupplier = isSupplierActor(ctx)
  const recon: Reconciliation = {
    id: nextId(ctx.db, 'dz'),
    no: nextNo(ctx.db, 'DZD', ctx.now),
    supplierCode,
    period,
    lines,
    totals: totalsOf(lines),
    status: fromSupplier ? 'sent' : 'drafted',
    initiator: fromSupplier ? 'supplier' : 'enterprise',
    createdBy: ctx.actor.userName,
    createdAt: ctx.now,
    sentAt: fromSupplier ? ctx.now : undefined,
    history: [],
    refetchCount: 0,
  }
  ctx.db.reconciliations.push(recon)
  logRecon(ctx, recon, fromSupplier ? '供应商取数生成对账单' : '取数生成对账单', '对账行取自ERP已审核单据，不能改值（A07）')
  return recon
}

export function sendRecon(ctx: Ctx, id: string) {
  const recon = getRecon(ctx, id)
  assertOk(reconActions(ctx, recon).send)
  recon.status = 'sent'
  recon.sentAt = ctx.now
  logRecon(ctx, recon, '发送供应商')
  return recon
}

export function confirmRecon(ctx: Ctx, id: string) {
  const recon = getRecon(ctx, id)
  assertOk(reconActions(ctx, recon).confirm)
  recon.status = 'confirmed'
  recon.confirmedAt = ctx.now
  recon.confirmedBy = ctx.actor.userName
  logRecon(ctx, recon, '供应商确认无误')
  return recon
}

export function disputeRecon(ctx: Ctx, id: string, input: { lineIds: string[]; reason: string }) {
  const recon = getRecon(ctx, id)
  assertOk(reconActions(ctx, recon).dispute)
  const lineIds = (input.lineIds ?? []).filter((lineId) => recon.lines.some((l) => l.id === lineId))
  if (!lineIds.length) throw new BizError('请勾选有差异的行', 400)
  const reason = requireText(input.reason, '差异说明')
  recon.status = 'disputed'
  recon.dispute = { lineIds, reason, by: ctx.actor.userName, at: ctx.now }
  logRecon(ctx, recon, '提出差异', `${lineIds.length}行：${reason}`)
  return recon
}

export function resolveRecon(ctx: Ctx, id: string, input: { mode: 'refetch' | 'explain'; note: string }) {
  const recon = getRecon(ctx, id)
  assertOk(reconActions(ctx, recon).resolve)
  const note = requireText(input.note, '处理说明')
  if (input.mode === 'refetch') {
    recon.lines = reconCandidates(ctx, recon.supplierCode, recon.period, recon.id)
    if (!recon.lines.length) throw new BizError('重新取数后没有可对账的行', 409)
    recon.totals = totalsOf(recon.lines)
    recon.refetchCount += 1
  }
  recon.status = 'sent'
  recon.sentAt = ctx.now
  recon.dispute = undefined
  logRecon(ctx, recon, input.mode === 'refetch' ? '重新取数后重发' : '说明后重发', note)
  return recon
}

export function cancelRecon(ctx: Ctx, id: string, reason: string) {
  const recon = getRecon(ctx, id)
  assertOk(reconActions(ctx, recon).cancel)
  const text = requireText(reason, '取消原因')
  recon.status = 'cancelled'
  logRecon(ctx, recon, '取消对账单', text)
  return recon
}

// ---------------------------------------------------------------- 开票申请

export function getRequest(ctx: Ctx, id: string) {
  const request = ctx.db.invoiceRequests.find((r) => r.id === id)
  if (!request) throw new BizError('开票申请不存在', 404)
  assertScope(ctx, request.supplierCode)
  return request
}

/** 对账确认之后才开票（《4》§六）。一张对账单先对应一张开票申请，组合规则见「18」。 */
export function createRequest(ctx: Ctx, reconciliationId: string) {
  const recon = getRecon(ctx, reconciliationId)
  assertOk(reconActions(ctx, recon).createRequest)
  const request: InvoiceRequest = {
    id: nextId(ctx.db, 'kp'),
    no: nextNo(ctx.db, 'KPSQ', ctx.now),
    reconciliationId: recon.id,
    reconciliationNo: recon.no,
    supplierCode: recon.supplierCode,
    buyerName: '强盛科技（开票主体待确认）',
    period: recon.period,
    amount: recon.totals.amount,
    tax: recon.totals.tax,
    netAmount: recon.totals.netAmount,
    taxRates: [...new Set(recon.lines.map((l) => l.taxRate))],
    createdBy: ctx.actor.userName,
    createdAt: ctx.now,
  }
  ctx.db.invoiceRequests.push(request)
  audit(ctx, {
    objectType: '开票申请',
    objectId: request.id,
    objectNo: request.no,
    supplierCode: request.supplierCode,
    action: '生成开票申请',
    after: { 对账单: recon.no, 价税合计: request.amount, 税额: request.tax },
  })
  return request
}

export function requestActions(ctx: Ctx, request: InvoiceRequest) {
  const own = isSupplierActor(ctx) && ctx.actor.supplierCode === request.supplierCode
  const status = requestStatus(ctx.db, request)
  return {
    registerBlue: !own
      ? hide()
      : status === 'registered'
        ? deny('这张开票申请已登记蓝字税票。一张申请先对应一张蓝字税票（待确认-18）')
        : OK,
  }
}

// ---------------------------------------------------------------- 税票

export interface BlueInput {
  requestId: string
  invoiceNo: string
  legacyCode?: string
  invoiceType: string
  issueDate: string
  amount: number
  tax: number
  netAmount: number
  taxRate: number
  attachmentName?: string
}

function moneyOf(value: unknown, label: string) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) throw new BizError(`${label}须大于0`, 400)
  return round2(num)
}

export function precheckInvoice(ctx: Ctx, input: BlueInput) {
  const request = input.requestId ? getRequest(ctx, input.requestId) : undefined
  return runPrecheck(
    ctx.db,
    {
      invoiceNo: String(input.invoiceNo ?? '').trim(),
      amount: Number(input.amount) || 0,
      tax: Number(input.tax) || 0,
      netAmount: Number(input.netAmount) || 0,
      taxRate: Number(input.taxRate) || 0,
    },
    request,
    ctx.config.invoiceTolerance,
    ctx.now,
  )
}

export function registerBlue(ctx: Ctx, input: BlueInput) {
  const request = getRequest(ctx, input.requestId)
  assertOk(requestActions(ctx, request).registerBlue)
  const invoiceNo = requireText(input.invoiceNo, '发票号码')
  const values = {
    amount: moneyOf(input.amount, '价税合计'),
    tax: round2(Number(input.tax) || 0),
    netAmount: moneyOf(input.netAmount, '金额'),
    taxRate: Number(input.taxRate),
  }
  const precheck = runPrecheck(ctx.db, { invoiceNo, ...values }, request, ctx.config.invoiceTolerance, ctx.now)
  const blocking = precheckBlocking(precheck)
  if (blocking.length) throw new BizError(blocking.map((i) => `${i.label}：${i.message}`).join('；'), 409)
  const invoice: Invoice = {
    id: nextId(ctx.db, 'fp'),
    kind: 'blue',
    invoiceNo,
    legacyCode: input.legacyCode?.trim() || undefined,
    invoiceType: requireText(input.invoiceType, '票种'),
    issueDate: requireDate(input.issueDate, '开票日期'),
    supplierCode: request.supplierCode,
    requestId: request.id,
    requestNo: request.no,
    ...values,
    attachmentName: input.attachmentName?.trim() || undefined,
    registeredBy: ctx.actor.userName,
    registeredAt: ctx.now,
    precheck,
    usageStatus: 'none',
    reversedAmount: 0,
  }
  ctx.db.invoices.push(invoice)
  audit(ctx, {
    objectType: '税票',
    objectId: invoice.id,
    objectNo: invoice.invoiceNo,
    supplierCode: invoice.supplierCode,
    action: '登记蓝字税票',
    after: { 开票申请: request.no, 价税合计: invoice.amount, 预校验: precheck.overall === 'match' ? '一致' : '有差额' },
  })
  return invoice
}

export function getInvoice(ctx: Ctx, id: string) {
  const invoice = ctx.db.invoices.find((i) => i.id === id)
  if (!invoice) throw new BizError('税票不存在', 404)
  assertScope(ctx, invoice.supplierCode)
  return invoice
}

function activeRed(ctx: Ctx, invoice: Invoice) {
  return ctx.db.redLetters.find((r) => r.blueInvoiceId === invoice.id && (r.status === 'waiting' || r.status === 'confirmed'))
}

export function invoiceActions(ctx: Ctx, invoice: Invoice) {
  const own = isSupplierActor(ctx) && ctx.actor.supplierCode === invoice.supplierCode
  const finance = hasRole(ctx, 'finance')
  const blue = invoice.kind === 'blue'
  const remaining = invoiceRemaining(invoice)
  const busy = activeRed(ctx, invoice)
  const base = () => {
    if (!blue || remaining <= 0) return hide()
    if (busy) return deny('这张蓝票已有处理中的红字确认单')
    return OK
  }
  const confirmed = invoice.usageStatus !== 'none'
  return {
    redDirect: !own ? hide() : confirmed ? hide('已用途确认或入账确认，须走红字确认单') : base(),
    redFormSeller: !own ? hide() : confirmed ? base() : hide('未用途确认且未入账确认，可以直接开红字'),
    redFormBuyer: !finance ? hide() : confirmed ? base() : hide('未用途确认且未入账确认，由销售方直接开红字'),
    usage: isEnterprise(ctx) && blue ? OK : hide(),
  }
}

/** 演示税务平台的用途确认、入账确认结果，决定红字走哪条路径（《8》§四）。 */
export function setUsage(ctx: Ctx, id: string, status: Invoice['usageStatus']) {
  const invoice = getInvoice(ctx, id)
  assertOk(invoiceActions(ctx, invoice).usage)
  if (!['none', 'used', 'booked'].includes(status)) throw new BizError('状态不对', 400)
  invoice.usageStatus = status
  invoice.usageUpdatedAt = ctx.now
  audit(systemCtx(ctx, ctx.now, 'tax'), {
    objectType: '税票',
    objectId: invoice.id,
    objectNo: invoice.invoiceNo,
    supplierCode: invoice.supplierCode,
    action: '模拟税务平台回传用途确认状态',
    after: { 用途确认: status },
  })
  return invoice
}

// ---------------------------------------------------------------- 红字

export interface RedInput {
  blueInvoiceId: string
  scope: 'full' | 'partial'
  amount?: number
  tax?: number
  reason: string
}

function redAmounts(invoice: Invoice, input: RedInput) {
  const remaining = invoiceRemaining(invoice)
  if (input.scope === 'full') {
    const tax = round2((invoice.tax * remaining) / invoice.amount)
    return { amount: remaining, tax, netAmount: round2(remaining - tax) }
  }
  const amount = moneyOf(input.amount, '红冲价税合计')
  if (amount > remaining) throw new BizError(`最多可红冲${remaining.toFixed(2)}`, 409)
  const tax = round2(Number(input.tax) || 0)
  if (tax < 0 || tax > amount) throw new BizError('红冲税额不对', 400)
  return { amount, tax, netAmount: round2(amount - tax) }
}

function createRedInvoice(ctx: Ctx, blue: Invoice, red: RedLetter, input: { invoiceNo: string; issueDate: string }) {
  const invoiceNo = requireText(input.invoiceNo, '红字发票号码')
  const precheck = runPrecheck(ctx.db, { invoiceNo, amount: red.amount, tax: red.tax, netAmount: red.netAmount, taxRate: blue.taxRate }, undefined, null, ctx.now)
  const blocking = precheckBlocking(precheck)
  if (blocking.length) throw new BizError(blocking.map((i) => `${i.label}：${i.message}`).join('；'), 409)
  const invoice: Invoice = {
    id: nextId(ctx.db, 'fp'),
    kind: 'red',
    invoiceNo,
    invoiceType: blue.invoiceType,
    issueDate: requireDate(input.issueDate, '开票日期'),
    supplierCode: blue.supplierCode,
    requestId: blue.requestId,
    requestNo: blue.requestNo,
    amount: -red.amount,
    tax: -red.tax,
    netAmount: -red.netAmount,
    taxRate: blue.taxRate,
    registeredBy: ctx.actor.userName,
    registeredAt: ctx.now,
    precheck,
    usageStatus: 'none',
    blueInvoiceId: blue.id,
    blueInvoiceNo: blue.invoiceNo,
    redLetterId: red.id,
    reversedAmount: 0,
  }
  ctx.db.invoices.push(invoice)
  blue.reversedAmount = round2(blue.reversedAmount + red.amount)
  red.status = 'issued'
  red.redInvoiceId = invoice.id
  red.redInvoiceNo = invoice.invoiceNo
  audit(ctx, {
    objectType: '税票',
    objectId: invoice.id,
    objectNo: invoice.invoiceNo,
    supplierCode: invoice.supplierCode,
    action: '登记红字税票',
    after: { 蓝字发票: blue.invoiceNo, 红冲价税合计: red.amount },
  })
  return invoice
}

/** 未用途确认且未入账确认：销售方直接开红字，只登记红字号码。 */
export function redDirect(ctx: Ctx, input: RedInput & { invoiceNo: string; issueDate: string }) {
  const blue = getInvoice(ctx, input.blueInvoiceId)
  assertOk(invoiceActions(ctx, blue).redDirect)
  const red: RedLetter = {
    id: nextId(ctx.db, 'hz'),
    path: 'direct',
    blueInvoiceId: blue.id,
    blueInvoiceNo: blue.invoiceNo,
    supplierCode: blue.supplierCode,
    scope: input.scope,
    ...redAmounts(blue, input),
    reason: requireText(input.reason, '红冲原因'),
    status: 'waiting',
    createdAt: ctx.now,
  }
  ctx.db.redLetters.push(red)
  createRedInvoice(ctx, blue, red, input)
  return red
}

/** 已用途确认或入账确认：先走红字确认单，对方72小时内确认（《8》§四）。 */
export function createRedForm(ctx: Ctx, input: RedInput) {
  const blue = getInvoice(ctx, input.blueInvoiceId)
  const actions = invoiceActions(ctx, blue)
  const seller = isSupplierActor(ctx)
  assertOk(seller ? actions.redFormSeller : actions.redFormBuyer)
  const red: RedLetter = {
    id: nextId(ctx.db, 'hz'),
    path: 'form',
    blueInvoiceId: blue.id,
    blueInvoiceNo: blue.invoiceNo,
    supplierCode: blue.supplierCode,
    scope: input.scope,
    ...redAmounts(blue, input),
    reason: requireText(input.reason, '红冲原因'),
    formNo: nextNo(ctx.db, 'HZQRD', ctx.now),
    initiator: seller ? 'seller' : 'buyer',
    initiatedBy: ctx.actor.userName,
    initiatedAt: ctx.now,
    deadline: ctx.now + RED_FORM_LIMIT,
    status: 'waiting',
    createdAt: ctx.now,
  }
  ctx.db.redLetters.push(red)
  audit(ctx, {
    objectType: '红字确认单',
    objectId: red.id,
    objectNo: red.formNo!,
    supplierCode: red.supplierCode,
    action: seller ? '销售方发起红字确认单' : '购买方发起红字确认单',
    after: { 蓝字发票: blue.invoiceNo, 红冲价税合计: red.amount, 范围: red.scope === 'full' ? '全额' : '部分' },
    note: red.reason,
  })
  return red
}

export function getRed(ctx: Ctx, id: string) {
  const red = ctx.db.redLetters.find((r) => r.id === id)
  if (!red) throw new BizError('红字记录不存在', 404)
  assertScope(ctx, red.supplierCode)
  return red
}

export function redEffectiveStatus(red: RedLetter, now: number) {
  return red.status === 'waiting' && red.deadline && now > red.deadline ? 'voided' : red.status
}

export function redActions(ctx: Ctx, red: RedLetter) {
  const own = isSupplierActor(ctx) && ctx.actor.supplierCode === red.supplierCode
  const status = redEffectiveStatus(red, ctx.now)
  const counterpart = red.initiator === 'seller' ? hasRole(ctx, 'finance') : own
  return {
    confirm: red.path === 'form' && status === 'waiting' && counterpart ? OK : hide(),
    registerRed: own && red.path === 'form' && status === 'confirmed' ? OK : hide(),
  }
}

export function confirmRedForm(ctx: Ctx, id: string) {
  const red = getRed(ctx, id)
  assertOk(redActions(ctx, red).confirm)
  red.status = 'confirmed'
  red.confirmedBy = ctx.actor.userName
  red.confirmedAt = ctx.now
  audit(ctx, {
    objectType: '红字确认单',
    objectId: red.id,
    objectNo: red.formNo ?? red.id,
    supplierCode: red.supplierCode,
    action: red.initiator === 'seller' ? '购买方确认红字确认单' : '销售方确认红字确认单',
  })
  return red
}

export function registerRedFromForm(ctx: Ctx, id: string, input: { invoiceNo: string; issueDate: string }) {
  const red = getRed(ctx, id)
  assertOk(redActions(ctx, red).registerRed)
  const blue = getInvoice(ctx, red.blueInvoiceId)
  createRedInvoice(ctx, blue, red, input)
  return red
}

export function expireRedForms(ctx: Ctx) {
  let changed = false
  for (const red of ctx.db.redLetters) {
    if (red.status === 'waiting' && red.deadline && ctx.now > red.deadline) {
      red.status = 'voided'
      audit(systemCtx(ctx, red.deadline, 'tax'), {
        objectType: '红字确认单',
        objectId: red.id,
        objectNo: red.formNo ?? red.id,
        supplierCode: red.supplierCode,
        action: '超过72小时未确认，红字确认单作废',
      })
      changed = true
    }
  }
  return changed
}
