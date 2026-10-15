import type { Address, Admission, Contact, Supplier, SupplierCategory, SupplierTier } from '../domain/types'
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
  isSupplierActor,
  nextId,
  requireText,
  systemCtx,
  type Ctx,
} from './core'

export const supplierCategories: SupplierCategory[] = ['成品代工', '包材', '配件', '模具', '物流服务']
export const supplierTiers: SupplierTier[] = ['参股核心', '未分级', '暂停或待淘汰']

export function getSupplier(ctx: Ctx, code: string) {
  const supplier = findSupplier(ctx, code)
  assertScope(ctx, supplier.code)
  return supplier
}

export function supplierActions(ctx: Ctx, supplier: Supplier) {
  const own = isSupplierActor(ctx) && ctx.actor.supplierCode === supplier.code
  return {
    collab: hasRole(ctx, 'buyer') || own ? OK : hide(),
    tier: hasRole(ctx, 'buyer') ? OK : hide(),
    openPortal: !hasRole(ctx, 'admin')
      ? hide()
      : supplier.portalStatus === '已开通'
        ? deny('已开通。子账号能否由供应商自建见待确认-34')
        : OK,
  }
}

interface CollabInput {
  contacts: Contact[]
  addresses: Address[]
}

export function updateCollab(ctx: Ctx, code: string, input: CollabInput) {
  const supplier = getSupplier(ctx, code)
  assertOk(supplierActions(ctx, supplier).collab)
  const contacts = (input.contacts ?? []).map((c, i) => ({
    id: c.id || nextId(ctx.db, 'ct'),
    name: requireText(c.name, `第${i + 1}位联系人姓名`),
    duty: c.duty?.trim() ?? '',
    mobile: requireText(c.mobile, `第${i + 1}位联系人手机`),
    email: c.email?.trim() ?? '',
    isPrimary: !!c.isPrimary,
  }))
  const addresses = (input.addresses ?? []).map((a, i) => ({
    id: a.id || nextId(ctx.db, 'ad'),
    label: requireText(a.label, `第${i + 1}个地址名称`),
    detail: requireText(a.detail, `第${i + 1}个详细地址`),
    contact: a.contact?.trim() ?? '',
    phone: a.phone?.trim() ?? '',
  }))
  const before = { 联系人: supplier.contacts.length, 地址: supplier.addresses.length }
  supplier.contacts = contacts
  supplier.addresses = addresses
  supplier.updatedAt = ctx.now
  supplier.updatedBy = ctx.actor.userName
  audit(ctx, {
    objectType: '供应商协同资料',
    objectId: supplier.code,
    objectNo: supplier.code,
    supplierCode: supplier.code,
    action: '维护联系人和送货地址',
    before,
    after: { 联系人: contacts.length, 地址: addresses.length },
  })
  return supplier
}

/** 只有三档；「合格」没有名单，不可选（《7》§二、「32」）。 */
export function setTier(ctx: Ctx, code: string, input: { tier: SupplierTier; reason?: string }) {
  const supplier = getSupplier(ctx, code)
  assertOk(supplierActions(ctx, supplier).tier)
  if (!supplierTiers.includes(input.tier)) throw new BizError('「合格」等其他分级不可选：没有名单和阈值（待确认-32）', 400)
  if (input.tier === supplier.tier) throw new BizError('分级没有变化', 400)
  const reason = input.tier === '暂停或待淘汰' ? requireText(input.reason, '暂停原因') : input.reason?.trim() || undefined
  const before = { 分级: supplier.tier }
  supplier.tier = input.tier
  supplier.tierReason = reason
  supplier.tierChangedAt = ctx.now
  supplier.tierChangedBy = ctx.actor.userName
  audit(ctx, {
    objectType: '供应商分级',
    objectId: supplier.code,
    objectNo: supplier.code,
    supplierCode: supplier.code,
    action: '调整分级',
    before,
    after: { 分级: supplier.tier },
    note: reason,
  })
  return supplier
}

/** 登录名不用供应商编码（《6》§二）。命名规则未定，见「34」。 */
export function openPortal(ctx: Ctx, code: string, input: { loginName: string; displayName: string }) {
  const supplier = getSupplier(ctx, code)
  assertOk(supplierActions(ctx, supplier).openPortal)
  const loginName = requireText(input.loginName, '登录名')
  if (!/^[a-z][a-z0-9._-]{3,31}$/i.test(loginName)) throw new BizError('登录名用4至32位字母、数字、点、横线，字母开头', 400)
  if (/^sup\d+$/i.test(loginName) || loginName.toUpperCase() === supplier.code) {
    throw new BizError('登录名不能直接用供应商编码（《6》§二）', 400)
  }
  if (ctx.db.portalUsers.some((u) => u.loginName.toLowerCase() === loginName.toLowerCase())) {
    throw new BizError('登录名已被使用', 409)
  }
  const user = {
    id: nextId(ctx.db, 'pu'),
    supplierCode: supplier.code,
    loginName,
    displayName: requireText(input.displayName, '账号显示名'),
    isPrimary: true,
    status: '启用' as const,
    createdAt: ctx.now,
    createdBy: ctx.actor.userName,
  }
  ctx.db.portalUsers.push(user)
  supplier.portalStatus = '已开通'
  audit(ctx, {
    objectType: '门户账号',
    objectId: user.id,
    objectNo: user.loginName,
    supplierCode: supplier.code,
    action: '开通门户主账号',
    after: { 登录名: loginName, 门户状态: '已开通' },
    note: '开通后不再代录，由供应商自己操作',
  })
  return user
}

// ---------------------------------------------------------------- 准入

export function getAdmission(ctx: Ctx, id: string) {
  if (isSupplierActor(ctx)) throw new BizError('无权查看', 403)
  const admission = ctx.db.admissions.find((a) => a.id === id)
  if (!admission) throw new BizError('准入申请不存在', 404)
  return admission
}

function hasPassSinceSubmit(admission: Admission) {
  return admission.reviews.some((r) => r.result === '通过' && r.at >= (admission.submittedAt ?? 0))
}

export function admissionActions(ctx: Ctx, admission: Admission) {
  const buyer = hasRole(ctx, 'buyer')
  const reviewer = hasRole(ctx, 'buyer', 'quality')
  return {
    edit: buyer && admission.status === 'draft' ? OK : hide(),
    submit: buyer && admission.status === 'draft' ? OK : hide(),
    review: reviewer && admission.status === 'reviewing' ? OK : hide(),
    requestErp: !buyer || admission.status !== 'reviewing'
      ? hide()
      : hasPassSinceSubmit(admission)
        ? OK
        : deny('至少要有一条「通过」的审查意见'),
    simulateErpCreate: !isSupplierActor(ctx) && admission.status === 'waitingErp' ? OK : hide(),
  }
}

export interface AdmissionInput {
  name: string
  category: SupplierCategory
  creditCode: string
  contactName: string
  contactPhone: string
  address: string
  supplyScope: string
  relatedDeclaration: string
  qualifications: { id?: string; type: string; fileName: string; validTo?: string }[]
}

function applyAdmission(ctx: Ctx, admission: Admission, input: AdmissionInput) {
  if (!supplierCategories.includes(input.category)) throw new BizError('请选择供应商类别', 400)
  const creditCode = requireText(input.creditCode, '统一社会信用代码').toUpperCase()
  if (!/^[0-9A-Z]{18}$/.test(creditCode)) throw new BizError('统一社会信用代码为18位数字或大写字母', 400)
  Object.assign(admission, {
    name: requireText(input.name, '企业名称'),
    category: input.category,
    creditCode,
    contactName: requireText(input.contactName, '联系人'),
    contactPhone: requireText(input.contactPhone, '联系电话'),
    address: input.address?.trim() ?? '',
    supplyScope: input.supplyScope?.trim() ?? '',
    relatedDeclaration: input.relatedDeclaration?.trim() ?? '',
    qualifications: (input.qualifications ?? []).map((q, i) => ({
      id: q.id || nextId(ctx.db, 'zz'),
      type: requireText(q.type, `第${i + 1}项资质类型`),
      fileName: requireText(q.fileName, `第${i + 1}项附件名称`),
      validTo: q.validTo || undefined,
    })),
    updatedAt: ctx.now,
  })
}

function logAdmission(ctx: Ctx, admission: Admission, action: string, note?: string) {
  audit(ctx, {
    objectType: '供应商准入',
    objectId: admission.id,
    objectNo: `准入申请#${admission.seq}`,
    action,
    after: { 企业名称: admission.name, 状态: admission.status },
    note,
  })
}

export function saveAdmission(ctx: Ctx, input: AdmissionInput, id?: string, submit = false) {
  if (!hasRole(ctx, 'buyer')) throw new BizError('只有采购员登记准入资料', 403)
  let admission: Admission
  if (id) {
    admission = getAdmission(ctx, id)
    assertOk(admissionActions(ctx, admission).edit)
  } else {
    ctx.db.seq.admission = (ctx.db.seq.admission ?? 0) + 1
    admission = {
      id: nextId(ctx.db, 'zr'),
      seq: ctx.db.seq.admission,
      name: '',
      category: '成品代工',
      creditCode: '',
      contactName: '',
      contactPhone: '',
      address: '',
      supplyScope: '',
      qualifications: [],
      relatedDeclaration: '',
      status: 'draft',
      applicant: ctx.actor.userName,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      reviews: [],
    }
  }
  applyAdmission(ctx, admission, input)
  if (!id) ctx.db.admissions.push(admission)
  logAdmission(ctx, admission, id ? '编辑准入资料' : '登记准入资料')
  if (submit) submitAdmission(ctx, admission.id)
  return admission
}

export function submitAdmission(ctx: Ctx, id: string) {
  const admission = getAdmission(ctx, id)
  assertOk(admissionActions(ctx, admission).submit)
  admission.status = 'reviewing'
  admission.submittedAt = ctx.now
  admission.updatedAt = ctx.now
  logAdmission(ctx, admission, '提交资料审查')
  return admission
}

export function reviewAdmission(ctx: Ctx, id: string, input: { result: '通过' | '退回补充' | '终止'; note: string }) {
  const admission = getAdmission(ctx, id)
  assertOk(admissionActions(ctx, admission).review)
  if (!['通过', '退回补充', '终止'].includes(input.result)) throw new BizError('请选择审查结论', 400)
  const note = requireText(input.note, '审查意见')
  admission.reviews.push({
    by: ctx.actor.userName,
    role: hasRole(ctx, 'quality') ? '品质' : '采购员',
    at: ctx.now,
    result: input.result,
    note,
  })
  if (input.result === '退回补充') admission.status = 'draft'
  if (input.result === '终止') admission.status = 'terminated'
  admission.updatedAt = ctx.now
  logAdmission(ctx, admission, `审查意见：${input.result}`, note)
  return admission
}

/** 门户不发供应商编码，等ERP建档后回传SUP编码（《6》§二）。 */
export function requestErp(ctx: Ctx, id: string) {
  const admission = getAdmission(ctx, id)
  assertOk(admissionActions(ctx, admission).requestErp)
  admission.status = 'waitingErp'
  admission.erpRequestedAt = ctx.now
  admission.updatedAt = ctx.now
  logAdmission(ctx, admission, '提交ERP建档')
  return admission
}

export function simulateErpCreate(ctx: Ctx, id: string) {
  const admission = getAdmission(ctx, id)
  assertOk(admissionActions(ctx, admission).simulateErpCreate)
  const max = Math.max(...ctx.db.suppliers.map((s) => Number(s.code.replace(/\D/g, '')) || 0))
  const code = `SUP${String(max + 1).padStart(6, '0')}`
  const sys = systemCtx(ctx, ctx.now)
  const supplier: Supplier = {
    code,
    name: admission.name,
    shortName: admission.name.replace(/有限公司|科技|电子|实业/g, '').slice(0, 8) || admission.name,
    category: admission.category,
    tier: '未分级',
    relatedParty: '待认定',
    portalStatus: '未开通',
    currency: 'CNY',
    contacts: [
      { id: nextId(ctx.db, 'ct'), name: admission.contactName, duty: '准入联系人', mobile: admission.contactPhone, email: '', isPrimary: true },
    ],
    addresses: admission.address
      ? [{ id: nextId(ctx.db, 'ad'), label: '注册地址', detail: admission.address, contact: admission.contactName, phone: admission.contactPhone }]
      : [],
    source: 'ERP建档回传（模拟）',
    createdAt: ctx.now,
    updatedAt: ctx.now,
    updatedBy: sys.actor.userName,
  }
  ctx.db.suppliers.push(supplier)
  admission.status = 'created'
  admission.erpCode = code
  admission.erpCreatedAt = ctx.now
  admission.updatedAt = ctx.now
  logAdmission(sys, admission, 'ERP建档完成，回传供应商编码', code)
  return admission
}
