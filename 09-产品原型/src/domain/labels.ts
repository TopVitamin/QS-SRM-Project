import type { EnterpriseRole, Role, SupplierCategory, SupplierTier } from './types'

export interface StatusDef {
  label: string
  color: string
}

type StatusMap = Record<string, StatusDef>

const s = (label: string, color: string): StatusDef => ({ label, color })

export const statusMaps = {
  audit: { draft: s('草稿', 'gray'), pending: s('待审核', 'orange'), approved: s('已审核', 'green') },
  push: {
    none: s('未推送', 'gray'),
    waiting: s('待推送', 'gray'),
    pushing: s('推送中', 'blue'),
    accepted: s('ERP已接收', 'green'),
    failed: s('推送失败', 'red'),
  },
  confirm: {
    notSent: s('未下发', 'gray'),
    pending: s('待确认', 'orange'),
    confirmed: s('已确认', 'green'),
    rejected: s('已拒绝', 'red'),
  },
  biz: { open: s('执行中', 'blue'), closed: s('已关闭', 'dark'), cancelled: s('已取消', 'dark') },
  receipt: { none: s('未入库', 'gray'), partial: s('部分入库', 'blue'), full: s('全部入库', 'green') },
  change: {
    draft: s('草稿', 'gray'),
    pending: s('待审核', 'orange'),
    pushing: s('推送中', 'blue'),
    failed: s('推送失败', 'red'),
    effective: s('已生效', 'green'),
    rejected: s('已驳回', 'dark'),
    discarded: s('已作废', 'dark'),
  },
  suggestion: { pending: s('待处理', 'violet'), accepted: s('已接受', 'green'), rejected: s('已驳回', 'dark') },
  shipment: { draft: s('草稿', 'gray'), submitted: s('已提交', 'blue'), cancelled: s('已取消', 'dark') },
  erpShip: {
    none: s('-', 'gray'),
    pushing: s('ERP接收中', 'blue'),
    pushFailed: s('ERP接收失败', 'red'),
    waitingNotice: s('待ERP生成通知单', 'orange'),
    issued: s('通知已下发WMS', 'blue'),
    full: s('已入库（全收）', 'green'),
    short: s('已入库（缺量）', 'green'),
    zero: s('零收，通知已取消', 'dark'),
  },
  notice: { issued: s('已下发WMS', 'blue'), completed: s('已完成', 'green'), cancelled: s('已取消（零收）', 'dark') },
  box: { valid: s('有效', 'green'), void: s('已作废', 'dark') },
  appointment: {
    pending: s('待仓库确认', 'orange'),
    confirmed: s('已确认', 'green'),
    booked: s('已预约', 'green'),
    returned: s('已退回改约', 'red'),
    cancelled: s('已取消', 'dark'),
  },
  returnAck: { pending: s('待供应商确认', 'orange'), acked: s('已确认知悉', 'green') },
  recon: {
    drafted: s('已取数', 'gray'),
    sent: s('待供应商确认', 'orange'),
    confirmed: s('已确认', 'green'),
    disputed: s('有差异', 'red'),
    cancelled: s('已取消', 'dark'),
  },
  request: { waiting: s('待开票', 'orange'), registered: s('已登记税票', 'green'), reissue: s('已红冲，待重开', 'violet') },
  precheck: { match: s('预校验一致', 'green'), diff: s('预校验有差额', 'red') },
  usage: { none: s('未用途确认、未入账确认', 'gray'), used: s('已用途确认', 'blue'), booked: s('已入账确认', 'blue') },
  red: {
    waiting: s('待对方确认', 'orange'),
    confirmed: s('已确认，待开具红字', 'blue'),
    issued: s('已开具红字', 'green'),
    voided: s('已作废', 'dark'),
  },
  admission: {
    draft: s('草稿', 'gray'),
    reviewing: s('资料审查中', 'orange'),
    waitingErp: s('待ERP建档', 'blue'),
    created: s('已建档', 'green'),
    terminated: s('已终止', 'dark'),
  },
  tier: { 参股核心: s('参股核心', 'indigo'), 未分级: s('未分级', 'gray'), 暂停或待淘汰: s('暂停或待淘汰', 'red') },
  portal: { 已开通: s('门户已开通', 'green'), 未开通: s('未开通，采购代录', 'cyan') },
} satisfies Record<string, StatusMap>

export type StatusKind = keyof typeof statusMaps

export function statusDef(kind: StatusKind, value: string | undefined): StatusDef {
  const map = statusMaps[kind] as StatusMap
  return (value && map[value]) || s(value || '-', 'gray')
}

export function statusOptions(kind: StatusKind) {
  const map = statusMaps[kind] as StatusMap
  return Object.entries(map).map(([value, def]) => ({ value, label: def.label }))
}

export const roleLabels: Record<Role, string> = {
  buyer: '采购员',
  finance: '财务',
  warehouse: '仓储',
  quality: '品质',
  planner: '计划（只读）',
  admin: '系统管理',
  supplier: '供应商用户',
}

export const enterpriseRoles: EnterpriseRole[] = ['buyer', 'finance', 'warehouse', 'quality', 'planner', 'admin']

export const proxyBasisTypes = ['电话', '微信', '邮件', '纸质单据', '其他']

/** 代录依据，随代录动作一起提交，记进日志。 */
export interface ProxyValue {
  basisType: string
  basisNote: string
}

export const emptyProxy: ProxyValue = { basisType: '电话', basisNote: '' }

/** 按供什么来分（《7》§一）；各类有多少家见「25」。 */
export const supplierCategories: SupplierCategory[] = ['成品代工', '包材', '配件', '模具', '物流服务']

/** 合格名单给出之前只用这三档，不生成「合格」（《8》§三、「32」）。 */
export const supplierTiers: SupplierTier[] = ['参股核心', '未分级', '暂停或待淘汰']

export const timeSlots = ['08:00-10:00', '10:00-12:00', '13:30-15:30', '15:30-17:30']

export const suggestedPrefixNote = '建议前缀·演示'
