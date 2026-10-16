import type { Role } from './types'

/** 前端设计说明第七节的权限矩阵。模拟接口和页面共用这一份。 */
export type Capability =
  | 'order.write'
  | 'order.approve'
  | 'order.erp'
  | 'order.change'
  | 'order.close'
  | 'proxy'
  | 'order.respond'
  | 'kitting.review'
  | 'shipment.write'
  | 'appointment.write'
  | 'appointment.handle'
  | 'return.ack'
  | 'recon.create'
  | 'recon.respond'
  | 'recon.handle'
  | 'invoiceRequest.create'
  | 'invoice.register'
  | 'redForm.buyer'
  | 'redForm.seller'
  | 'supplier.collab'
  | 'supplier.tier'
  | 'admission.write'
  | 'admission.review'
  | 'portal.open'

const matrix: Record<Capability, Role[]> = {
  'order.write': ['buyer'],
  'order.approve': ['buyer'],
  'order.erp': ['buyer'],
  'order.change': ['buyer'],
  'order.close': ['buyer'],
  proxy: ['buyer'],
  'order.respond': ['supplier'],
  'kitting.review': ['quality'],
  'shipment.write': ['supplier'],
  'appointment.write': ['supplier'],
  'appointment.handle': ['warehouse'],
  'return.ack': ['supplier'],
  // 供应商能否发起由「16」开关决定，在模拟接口里另判
  'recon.create': ['buyer', 'finance'],
  'recon.respond': ['supplier'],
  'recon.handle': ['buyer', 'finance'],
  'invoiceRequest.create': ['finance'],
  'invoice.register': ['supplier'],
  'redForm.buyer': ['finance'],
  'redForm.seller': ['supplier'],
  'supplier.collab': ['buyer', 'supplier'],
  'supplier.tier': ['buyer'],
  'admission.write': ['buyer'],
  'admission.review': ['buyer', 'quality'],
  'portal.open': ['admin'],
}

export function can(role: Role | string | undefined, capability: Capability) {
  return !!role && (matrix[capability] as string[]).includes(role)
}
