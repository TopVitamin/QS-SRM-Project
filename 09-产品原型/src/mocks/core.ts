import { stamp, todayStr } from '../domain/format'
import { roleLabels } from '../domain/labels'
import type { Actor, AuditLog, Db, PrototypeConfig, ProxyInfo, Role, Supplier } from '../domain/types'
import type { ActionState } from '../domain/views'

export interface Ctx {
  db: Db
  now: number
  actor: Actor
  config: PrototypeConfig
}

export class BizError extends Error {
  status: number

  constructor(message: string, status = 409) {
    super(message)
    this.status = status
  }
}

export const OK: ActionState = { ok: true }
export const deny = (reason: string): ActionState => ({ ok: false, reason })
export const hide = (reason = '当前身份没有这个动作'): ActionState => ({ ok: false, reason, hidden: true })

export function assertOk(state: ActionState) {
  if (!state.ok) throw new BizError(state.reason ?? '当前不允许这个操作', state.hidden ? 403 : 409)
}

export function nextId(db: Db, kind: string) {
  const key = `id:${kind}`
  db.seq[key] = (db.seq[key] ?? 0) + 1
  return `${kind}-${db.seq[key]}`
}

/** 单号格式沿用《6》的「前缀-日期-流水」，前缀是否采用见各处标注。 */
export function nextNo(db: Db, prefix: string, now: number) {
  const key = `${prefix}-${stamp(now)}`
  db.seq[key] = (db.seq[key] ?? 0) + 1
  return `${key}-${String(db.seq[key]).padStart(4, '0')}`
}

export function nextBoxCode(db: Db) {
  db.boxSeq += 1
  return `BX${String(db.boxSeq).padStart(10, '0')}`
}

type AuditInput = Omit<AuditLog, 'id' | 'at' | 'actorName' | 'actorRole' | 'party'> & { at?: number }

export function audit(ctx: Ctx, entry: AuditInput) {
  const role = ctx.actor.role
  ctx.db.auditLogs.push({
    ...entry,
    id: nextId(ctx.db, 'log'),
    at: entry.at ?? ctx.now,
    actorName: ctx.actor.userName,
    actorRole: role in roleLabels ? roleLabels[role as Role] : role === 'wms' ? 'WMS' : role === 'erp' ? 'ERP' : '系统',
    party: ctx.actor.party,
  })
}

export function systemCtx(ctx: Ctx, at: number, who: 'erp' | 'wms' | 'tax' = 'erp'): Ctx {
  const names = { erp: 'ERP接口（模拟）', wms: 'WMS回传（模拟）', tax: '税务平台（模拟）' }
  return {
    ...ctx,
    now: at,
    actor: { party: 'system', role: who === 'wms' ? 'wms' : 'erp', userId: `sys-${who}`, userName: names[who] },
  }
}

export const isSupplierActor = (ctx: Ctx) => ctx.actor.party === 'supplier'
export const isEnterprise = (ctx: Ctx) => ctx.actor.party === 'enterprise'
export const hasRole = (ctx: Ctx, ...roles: Role[]) => roles.includes(ctx.actor.role as Role)

export function today(ctx: Ctx) {
  return todayStr(ctx.now)
}

export function findSupplier(ctx: Ctx, code: string) {
  const supplier = ctx.db.suppliers.find((item) => item.code === code)
  if (!supplier) throw new BizError(`供应商${code}不存在`, 404)
  return supplier
}

/** 供应商身份只看本公司；「34」开关打开后，采购员只看分管的供应商。 */
export function scopeReason(ctx: Ctx, supplierCode: string): string | null {
  if (ctx.actor.party === 'system') return null
  if (isSupplierActor(ctx)) {
    return ctx.actor.supplierCode === supplierCode ? null : '无权查看：这条数据不属于本公司'
  }
  if (ctx.config.buyerScopeAssigned && hasRole(ctx, 'buyer')) {
    const supplier = ctx.db.suppliers.find((item) => item.code === supplierCode)
    if (supplier && supplier.assignedBuyerId !== ctx.actor.userId) {
      return '无权查看：这家供应商不在你的分管范围（待确认-34）'
    }
  }
  return null
}

export function canSee(ctx: Ctx, supplierCode: string) {
  return scopeReason(ctx, supplierCode) === null
}

export function assertScope(ctx: Ctx, supplierCode: string) {
  const reason = scopeReason(ctx, supplierCode)
  if (reason) throw new BizError(reason, 403)
}

export function requireText(value: unknown, label: string) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new BizError(`请填写${label}`, 400)
  return text
}

export function requireDate(value: unknown, label: string, notBefore?: string) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new BizError(`请选择${label}`, 400)
  if (notBefore && text < notBefore) throw new BizError(`${label}不能早于${notBefore}`, 400)
  return text
}

export function requireInt(value: unknown, label: string, min = 1) {
  const num = Number(value)
  if (!Number.isInteger(num) || num < min) throw new BizError(`${label}须为不小于${min}的整数`, 400)
  return num
}

export interface ProxyInput {
  basisType?: string
  basisNote?: string
}

/**
 * 「本人或代录」的身份判断：供应商操作本公司数据；采购员只能替门户未开通的供应商代录（《9》§2.4）。
 */
export function actorGuard(ctx: Ctx, supplier: Supplier): ActionState {
  if (isSupplierActor(ctx)) {
    return ctx.actor.supplierCode === supplier.code ? OK : hide('只能操作本公司的数据')
  }
  if (hasRole(ctx, 'buyer') && supplier.portalStatus === '未开通') return OK
  return hide(supplier.portalStatus === '已开通' ? '门户已开通，由供应商自己操作' : '当前身份没有这个动作')
}

export function proxyInfo(ctx: Ctx, supplier: Supplier, input?: ProxyInput): ProxyInfo | undefined {
  if (isSupplierActor(ctx)) return undefined
  const basisType = requireText(input?.basisType, '代录依据类型')
  const basisNote = requireText(input?.basisNote, '代录依据说明')
  if (supplier.portalStatus !== '未开通') throw new BizError('门户已开通的供应商不能代录', 409)
  return { proxyBy: ctx.actor.userName, proxyAt: ctx.now, basisType, basisNote }
}
