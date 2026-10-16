import { delay, http, HttpResponse, type JsonBodyType } from 'msw'
import { defaultConfig } from '../domain/defaults'
import { enterpriseUser, enterpriseUsers } from '../domain/identities'
import { CONFIG_HEADER, IDENTITY_HEADER } from '../domain/protocol'
import type { Actor, Db, PrototypeConfig } from '../domain/types'
import type { DemoIdentities, Meta, Pulse } from '../domain/views'
import { BizError, assertScope, canSee, isSupplierActor, type Ctx, type ProxyInput } from './core'
import { commit, currentDb, resetDb } from './db'
import * as finance from './finance'
import * as insights from './insights'
import * as orders from './orders'
import * as shipments from './shipments'
import * as suppliers from './suppliers'
import * as views from './views'

const SYSTEM: Actor = { party: 'system', role: 'system', userId: 'sys', userName: '系统' }
const WRITE_LATENCY = 150

interface Req<B> {
  params: Record<string, string>
  query: URLSearchParams
  body: B
}

type Mode = 'read' | 'write' | 'compute' | 'public'
type Resolve<B> = (ctx: Ctx, req: Req<B>) => unknown

function decodeHeader<T>(request: Request, name: string): T | null {
  const raw = request.headers.get(name)
  if (!raw) return null
  try {
    return JSON.parse(decodeURIComponent(raw)) as T
  } catch {
    return null
  }
}

function configOf(request: Request): PrototypeConfig {
  const patch = decodeHeader<Partial<PrototypeConfig>>(request, CONFIG_HEADER) ?? {}
  return { ...defaultConfig, ...patch, changeFields: { ...defaultConfig.changeFields, ...patch.changeFields } }
}

/** 供应商身份以门户账号档案为准，请求头里写别家的编码也没用。 */
function actorOf(db: Db, request: Request): Actor {
  const identity = decodeHeader<{ party?: string; userId?: string }>(request, IDENTITY_HEADER)
  if (!identity?.userId) throw new BizError('请先在入口选择演示身份', 401)
  if (identity.party === 'enterprise') {
    const user = enterpriseUser(identity.userId)
    if (user) return { party: 'enterprise', role: user.role, userId: user.id, userName: user.name }
  }
  if (identity.party === 'supplier') {
    const user = db.portalUsers.find((u) => u.id === identity.userId && u.status === '启用')
    if (user) {
      return { party: 'supplier', role: 'supplier', userId: user.id, userName: user.displayName, supplierCode: user.supplierCode }
    }
  }
  throw new BizError('这个演示身份不存在了（可能刚重置过示例数据），请回入口重新选择', 401)
}

/** 推送结果和72小时作废在任何一次请求开始时结算，先落盘，再处理本次请求。 */
function settled(now: number, config: PrototypeConfig): Db {
  const db = currentDb()
  const draft = structuredClone(db)
  const ctx: Ctx = { db: draft, now, actor: SYSTEM, config }
  const pushes = orders.settlePushes(ctx)
  const reds = finance.expireRedForms(ctx)
  return pushes || reds ? commit(draft) : db
}

async function bodyOf(request: Request) {
  if (request.method === 'GET') return {}
  const text = await request.text()
  if (!text) return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new BizError('请求体不是JSON', 400)
  }
}

function fail(error: unknown) {
  if (error instanceof BizError) return HttpResponse.json({ message: error.message }, { status: error.status })
  console.error(error)
  return HttpResponse.json({ message: `模拟接口出错：${(error as Error)?.message ?? error}` }, { status: 500 })
}

function route<B>(method: 'get' | 'post' | 'put', path: string, mode: Mode, resolve: Resolve<B>) {
  return http[method](`/api${path}`, async ({ request, params }) => {
    try {
      if (mode === 'write') await delay(WRITE_LATENCY)
      const body = (await bodyOf(request)) as B
      const now = Date.now()
      const config = configOf(request)
      const db = settled(now, config)
      const req: Req<B> = { params: params as Record<string, string>, query: new URL(request.url).searchParams, body }
      const actor = mode === 'public' ? SYSTEM : actorOf(db, request)
      if (mode === 'read' || mode === 'public') return HttpResponse.json(resolve({ db, now, actor, config }, req) as JsonBodyType)
      const draft = structuredClone(db)
      const result = resolve({ db: draft, now, actor, config }, req)
      if (mode === 'write') commit(draft)
      return HttpResponse.json((result ?? { ok: true }) as JsonBodyType)
    } catch (error) {
      return fail(error)
    }
  })
}

const get = <B = never>(path: string, resolve: Resolve<B>) => route('get', path, 'read', resolve)
const post = <B = Record<string, never>>(path: string, resolve: Resolve<B>) => route('post', path, 'write', resolve)
const put = <B>(path: string, resolve: Resolve<B>) => route('put', path, 'write', resolve)

type WithSubmit<T> = T & { submit?: boolean }
type WithProxy = { proxy?: ProxyInput }

function identities(db: Db): DemoIdentities {
  return {
    enterprise: enterpriseUsers.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    suppliers: db.suppliers
      .filter((s) => db.portalUsers.some((u) => u.supplierCode === s.code))
      .map((s) => ({
        code: s.code,
        name: s.name,
        shortName: s.shortName,
        portalStatus: s.portalStatus,
        tier: s.tier,
        users: db.portalUsers.filter((u) => u.supplierCode === s.code && u.status === '启用'),
      })),
    proxySuppliers: db.suppliers.filter((s) => s.portalStatus === '未开通').map((s) => ({ code: s.code, name: s.name })),
    seededAt: db.seededAt,
  }
}

const supplierLogTypes = ['供应商协同资料', '供应商分级', '门户账号']

export const handlers = [
  // ------------------------------------------------------------ 公共
  route('get', '/identities', 'public', (ctx) => identities(ctx.db)),
  route('post', '/demo/reset', 'public', () => {
    const db = resetDb()
    return { seededAt: db.seededAt, rev: db.rev }
  }),
  get('/pulse', (ctx): Pulse => ({
    rev: ctx.db.rev,
    pushing: ctx.db.pushJobs.filter((j) => j.status === 'pushing' && canSee(ctx, j.supplierCode)).length,
    seededAt: ctx.db.seededAt,
  })),
  get('/meta', (ctx): Meta => ({ skus: ctx.db.skus, warehouses: ctx.db.warehouses })),
  get('/badges', (ctx) => insights.navBadges(ctx)),
  get('/dashboard', (ctx) => insights.dashboard(ctx)),
  get('/demo/scenarios', (ctx) => insights.demoScenarios(ctx)),
  get('/portal/dashboard', (ctx) => insights.portalDashboard(ctx)),

  // ------------------------------------------------------------ 采购订单
  get('/orders', (ctx) => views.listOrders(ctx)),
  post<WithSubmit<orders.OrderInput>>('/orders', (ctx, { body }) => orders.createOrder(ctx, body, !!body.submit)),
  get('/orders/:id', (ctx, { params }) => views.orderDetail(ctx, params.id)),
  put<WithSubmit<orders.OrderInput>>('/orders/:id', (ctx, { params, body }) => orders.updateOrder(ctx, params.id, body, !!body.submit)),
  post('/orders/:id/submit', (ctx, { params }) => orders.submitOrder(ctx, params.id)),
  post('/orders/:id/withdraw', (ctx, { params }) => orders.withdrawOrder(ctx, params.id)),
  post('/orders/:id/approve', (ctx, { params }) => orders.approveOrder(ctx, params.id)),
  post<{ comment: string }>('/orders/:id/reject', (ctx, { params, body }) => orders.rejectOrder(ctx, params.id, body.comment)),
  post('/orders/:id/check', (ctx, { params }) => orders.checkOrder(ctx, params.id)),
  post<{ kind: 'close' | 'cancel'; reason: string }>('/orders/:id/close', (ctx, { params, body }) =>
    orders.closeOrder(ctx, params.id, body.kind === 'cancel' ? 'cancel' : 'close', body.reason),
  ),
  post<WithProxy>('/orders/:id/confirm', (ctx, { params, body }) => orders.confirmOrder(ctx, params.id, body.proxy)),
  post<WithProxy & { reason: string }>('/orders/:id/refuse', (ctx, { params, body }) =>
    orders.refuseOrder(ctx, params.id, body.reason, body.proxy),
  ),
  post<WithSubmit<orders.ChangeInput>>('/orders/:id/changes', (ctx, { params, body }) =>
    orders.createChange(ctx, params.id, body, !!body.submit),
  ),
  post<WithProxy & { suggestedDate: string; reason: string }>('/orders/:id/suggestions', (ctx, { params, body }) =>
    orders.createSuggestion(ctx, params.id, body),
  ),
  post<orders.KittingInput>('/orders/:id/kitting', (ctx, { params, body }) => orders.reportKitting(ctx, params.id, body)),
  get('/orders/:id/logs', (ctx, { params }) => {
    orders.getOrder(ctx, params.id)
    return insights.auditLogs(ctx, new URLSearchParams({ objectId: insights.relatedObjectIds(ctx, params.id).join(',') }))
  }),

  // ------------------------------------------------------------ 变更、建议、齐套、推送
  get('/changes', (ctx) => views.listChanges(ctx)),
  get('/changes/:id', (ctx, { params }) => views.changeDetail(ctx, params.id)),
  put<WithSubmit<orders.ChangeInput>>('/changes/:id', (ctx, { params, body }) => orders.updateChange(ctx, params.id, body, !!body.submit)),
  post('/changes/:id/submit', (ctx, { params }) => orders.submitChange(ctx, params.id)),
  post('/changes/:id/approve', (ctx, { params }) => orders.approveChange(ctx, params.id)),
  post<{ comment: string }>('/changes/:id/reject', (ctx, { params, body }) => orders.rejectChange(ctx, params.id, body.comment)),
  post('/changes/:id/discard', (ctx, { params }) => orders.discardChange(ctx, params.id)),
  get('/suggestions', (ctx) => views.listSuggestions(ctx)),
  post<{ note?: string }>('/suggestions/:id/accept', (ctx, { params, body }) => orders.acceptSuggestion(ctx, params.id, body.note)),
  post<{ note: string }>('/suggestions/:id/reject', (ctx, { params, body }) => orders.rejectSuggestion(ctx, params.id, body.note)),
  get('/kitting', (ctx) => views.listKitting(ctx)),
  post<{ note: string }>('/kitting/:id/review', (ctx, { params, body }) => orders.reviewKitting(ctx, params.id, body.note)),
  get('/push-jobs', (ctx) => views.listPushJobs(ctx)),
  post('/push-jobs/:id/retry', (ctx, { params }) => orders.retryPush(ctx, params.id)),

  // ------------------------------------------------------------ 发货、箱码
  get('/shipments', (ctx) => views.listShipments(ctx)),
  get('/shippable-orders', (ctx, { query }) => views.shippableOrders(ctx, query.get('supplierCode') || undefined)),
  post<WithSubmit<shipments.ShipmentInput>>('/shipments', (ctx, { body }) => shipments.saveShipment(ctx, body, undefined, !!body.submit)),
  get('/shipments/:id', (ctx, { params }) => views.shipmentDetail(ctx, params.id)),
  put<WithSubmit<shipments.ShipmentInput>>('/shipments/:id', (ctx, { params, body }) =>
    shipments.saveShipment(ctx, body, params.id, !!body.submit),
  ),
  post('/shipments/:id/submit', (ctx, { params }) => shipments.submitShipment(ctx, params.id)),
  post<WithProxy & { reason?: string }>('/shipments/:id/cancel', (ctx, { params, body }) => shipments.cancelShipment(ctx, params.id, body)),
  post('/shipments/:id/regenerate', (ctx, { params }) => shipments.regenerateBoxes(ctx, params.id)),
  post('/shipments/:id/print', (ctx, { params }) => shipments.printLabels(ctx, params.id)),
  post('/shipments/:id/simulate-notice', (ctx, { params }) => shipments.simulateNotice(ctx, params.id)),
  post<shipments.ReceiptInput>('/shipments/:id/simulate-receipt', (ctx, { params, body }) =>
    shipments.simulateReceipt(ctx, params.id, body),
  ),
  get('/shipments/:id/logs', (ctx, { params }) => {
    shipments.getShipment(ctx, params.id)
    return insights.auditLogs(ctx, new URLSearchParams({ objectId: insights.shipmentObjectIds(ctx, params.id).join(',') }))
  }),
  post('/boxes/:code/reprint', (ctx, { params }) => shipments.reprintBox(ctx, params.code)),
  post<WithProxy & { reason: string }>('/boxes/:code/void', (ctx, { params, body }) =>
    shipments.voidBox(ctx, params.code, body.reason, body.proxy),
  ),

  // ------------------------------------------------------------ 预约、收货、退货
  get('/appointments', (ctx) => views.listAppointments(ctx)),
  post<shipments.AppointmentInput>('/appointments', (ctx, { body }) => shipments.createAppointment(ctx, body)),
  put<shipments.AppointmentInput>('/appointments/:id', (ctx, { params, body }) => shipments.rescheduleAppointment(ctx, params.id, body)),
  post('/appointments/:id/confirm', (ctx, { params }) => shipments.confirmAppointment(ctx, params.id)),
  post<{ note: string }>('/appointments/:id/return', (ctx, { params, body }) => shipments.returnAppointment(ctx, params.id, body.note)),
  post<WithProxy & { reason?: string }>('/appointments/:id/cancel', (ctx, { params, body }) =>
    shipments.cancelAppointment(ctx, params.id, body),
  ),
  get('/notices', (ctx) => views.listNotices(ctx)),
  get('/receipts', (ctx) => views.listReceipts(ctx)),
  post<{ lineNo: number; qty: number; reason: string }>('/receipts/:id/simulate-return', (ctx, { params, body }) =>
    shipments.simulateReturn(ctx, params.id, body),
  ),
  get('/returns', (ctx) => views.listReturns(ctx)),
  post('/returns/:id/simulate-outbound', (ctx, { params }) => shipments.simulateReturnOutbound(ctx, params.id)),
  post<WithProxy>('/returns/:id/ack', (ctx, { params, body }) => shipments.ackReturn(ctx, params.id, body.proxy)),

  // ------------------------------------------------------------ 预警、追溯
  get('/alerts', (ctx) => {
    views.assertEnterprise(ctx)
    return insights.listAlerts(ctx)
  }),
  get('/trace/samples', (ctx) => insights.traceSamples(ctx)),
  get('/trace', (ctx, { query }) => insights.trace(ctx, { box: query.get('box') || undefined, receipt: query.get('receipt') || undefined })),

  // ------------------------------------------------------------ 对账、开票、红字
  get('/reconciliations/candidates', (ctx, { query }) => {
    const supplierCode = isSupplierActor(ctx) ? ctx.actor.supplierCode! : query.get('supplierCode') ?? ''
    const period = query.get('period') ?? ''
    const state = finance.reconCreateState(ctx)
    if (!state.ok || !supplierCode || !/^\d{4}-\d{2}$/.test(period)) return { state, lines: [] }
    assertScope(ctx, supplierCode)
    return { state, lines: finance.reconCandidates(ctx, supplierCode, period) }
  }),
  get('/reconciliations', (ctx) => views.listRecons(ctx)),
  post<{ supplierCode: string; period: string }>('/reconciliations', (ctx, { body }) => finance.createRecon(ctx, body)),
  get('/reconciliations/:id', (ctx, { params }) => views.reconDetail(ctx, params.id)),
  post('/reconciliations/:id/send', (ctx, { params }) => finance.sendRecon(ctx, params.id)),
  post('/reconciliations/:id/confirm', (ctx, { params }) => finance.confirmRecon(ctx, params.id)),
  post<{ lineIds: string[]; reason: string }>('/reconciliations/:id/dispute', (ctx, { params, body }) =>
    finance.disputeRecon(ctx, params.id, body),
  ),
  post<{ mode: 'refetch' | 'explain'; note: string }>('/reconciliations/:id/resolve', (ctx, { params, body }) =>
    finance.resolveRecon(ctx, params.id, body),
  ),
  post<{ reason: string }>('/reconciliations/:id/cancel', (ctx, { params, body }) => finance.cancelRecon(ctx, params.id, body.reason)),
  post('/reconciliations/:id/request', (ctx, { params }) => finance.createRequest(ctx, params.id)),
  get('/invoice-requests', (ctx) => views.listRequests(ctx)),
  get('/invoice-requests/:id', (ctx, { params }) => views.requestDetail(ctx, params.id)),
  get('/invoices', (ctx) => views.listInvoices(ctx)),
  route<finance.BlueInput>('post', '/invoices/precheck', 'compute', (ctx, { body }) => finance.precheckInvoice(ctx, body)),
  post<finance.BlueInput>('/invoices', (ctx, { body }) => finance.registerBlue(ctx, body)),
  post<{ status: 'none' | 'used' | 'booked' }>('/invoices/:id/usage', (ctx, { params, body }) => finance.setUsage(ctx, params.id, body.status)),
  get('/red-letters', (ctx) => views.listRedLetters(ctx)),
  post<finance.RedInput & { invoiceNo: string; issueDate: string }>('/red-letters/direct', (ctx, { body }) => finance.redDirect(ctx, body)),
  post<finance.RedInput>('/red-letters/form', (ctx, { body }) => finance.createRedForm(ctx, body)),
  post('/red-letters/:id/confirm', (ctx, { params }) => finance.confirmRedForm(ctx, params.id)),
  post<{ invoiceNo: string; issueDate: string }>('/red-letters/:id/register', (ctx, { params, body }) =>
    finance.registerRedFromForm(ctx, params.id, body),
  ),

  // ------------------------------------------------------------ 供应商、准入
  get('/suppliers', (ctx) => views.listSuppliers(ctx)),
  get('/suppliers/:code', (ctx, { params }) => views.supplierDetail(ctx, params.code)),
  get('/suppliers/:code/prices', (ctx, { params }) => views.supplierPrices(ctx, params.code)),
  get('/suppliers/:code/logs', (ctx, { params }) => {
    suppliers.getSupplier(ctx, params.code)
    return insights.auditLogs(ctx, new URLSearchParams()).filter((l) => l.supplierCode === params.code && supplierLogTypes.includes(l.objectType))
  }),
  put<Parameters<typeof suppliers.updateCollab>[2]>('/suppliers/:code/collab', (ctx, { params, body }) =>
    suppliers.updateCollab(ctx, params.code, body),
  ),
  post<Parameters<typeof suppliers.setTier>[2]>('/suppliers/:code/tier', (ctx, { params, body }) => suppliers.setTier(ctx, params.code, body)),
  post<{ loginName: string; displayName: string }>('/suppliers/:code/portal', (ctx, { params, body }) =>
    suppliers.openPortal(ctx, params.code, body),
  ),
  get('/admissions', (ctx) => views.listAdmissions(ctx)),
  post<WithSubmit<suppliers.AdmissionInput>>('/admissions', (ctx, { body }) => suppliers.saveAdmission(ctx, body, undefined, !!body.submit)),
  get('/admissions/:id', (ctx, { params }) => views.admissionView(ctx, suppliers.getAdmission(ctx, params.id))),
  put<WithSubmit<suppliers.AdmissionInput>>('/admissions/:id', (ctx, { params, body }) =>
    suppliers.saveAdmission(ctx, body, params.id, !!body.submit),
  ),
  post('/admissions/:id/submit', (ctx, { params }) => suppliers.submitAdmission(ctx, params.id)),
  post<{ result: '通过' | '退回补充' | '终止'; note: string }>('/admissions/:id/review', (ctx, { params, body }) =>
    suppliers.reviewAdmission(ctx, params.id, body),
  ),
  post('/admissions/:id/request-erp', (ctx, { params }) => suppliers.requestErp(ctx, params.id)),
  post('/admissions/:id/simulate-erp', (ctx, { params }) => suppliers.simulateErpCreate(ctx, params.id)),

  // ------------------------------------------------------------ 绩效、日志
  get('/performance', (ctx, { query }) =>
    insights.performance(ctx, {
      promise: query.get('promise') === 'final' ? 'final' : 'first',
      basis: query.get('basis') === 'qty' ? 'qty' : 'batch',
      confirmBasis: query.get('confirmBasis') === 'order' ? 'order' : 'line',
    }),
  ),
  get('/audit-logs', (ctx, { query }) => insights.auditLogs(ctx, query)),

  http.all('/api/*', () => HttpResponse.json({ message: '模拟接口没有这个地址' }, { status: 404 })),
]
