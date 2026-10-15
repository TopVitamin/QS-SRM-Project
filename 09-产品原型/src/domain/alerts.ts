import type { AlertKind } from './views'

export const alertKinds: Record<AlertKind, { label: string; color: string }> = {
  overdue: { label: '已逾期', color: 'red' },
  unconfirmed24h: { label: '超24小时未确认', color: 'red' },
  nearDue: { label: '临近交期未齐套', color: 'orange' },
}
