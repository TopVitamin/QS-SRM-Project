import type { EnterpriseRole } from './types'

export interface EnterpriseUser {
  id: string
  name: string
  role: EnterpriseRole
}

/** 演示身份只按职责命名，不对应文档里的具体人物。 */
export const enterpriseUsers: EnterpriseUser[] = [
  { id: 'u-b1', name: '采购员甲（示例）', role: 'buyer' },
  { id: 'u-b2', name: '采购员乙（示例）', role: 'buyer' },
  { id: 'u-f1', name: '财务（示例）', role: 'finance' },
  { id: 'u-w1', name: '仓储（示例）', role: 'warehouse' },
  { id: 'u-q1', name: '品质（示例）', role: 'quality' },
  { id: 'u-p1', name: '计划（示例）', role: 'planner' },
  { id: 'u-a1', name: '系统管理（示例）', role: 'admin' },
]

export function enterpriseUser(id: string) {
  return enterpriseUsers.find((user) => user.id === id)
}
