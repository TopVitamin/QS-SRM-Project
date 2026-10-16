import { Text } from '@mantine/core'
import type { DataTableColumn } from 'mantine-datatable'
import { fmtMoney, fmtPrice, fmtQty, fmtRate } from '../domain/format'
import { round4 } from '../domain/money'
import { LockHint } from './marks'

export interface MoneyRow {
  price: number
  taxRate: number
  amount: number
  tax: number
  netAmount: number
  netPrice?: number
}

export function numCell(text: string, strong = false) {
  return (
    <Text fz="sm" className="qs-num" fw={strong ? 600 : undefined}>
      {text}
    </Text>
  )
}

export function qtyCell(value: number | undefined, tone?: string) {
  return (
    <Text fz="sm" className="qs-num" c={tone}>
      {fmtQty(value)}
    </Text>
  )
}

function lockedTitle(label: string, lock: boolean) {
  return lock ? (
    <>
      {label}
      <LockHint />
    </>
  ) : (
    label
  )
}

/** 明细金额列的顺序固定：含税单价、税率、不含税单价、价税合计、税额、金额（10.5）。 */
export function moneyColumns<T extends MoneyRow>(lock = false): DataTableColumn<T>[] {
  return [
    { accessor: 'price', title: lockedTitle('含税单价', lock), textAlign: 'right', render: (r) => numCell(fmtPrice(r.price)) },
    { accessor: 'taxRate', title: '税率', textAlign: 'right', render: (r) => numCell(fmtRate(r.taxRate)) },
    {
      accessor: 'netPrice',
      title: '不含税单价',
      textAlign: 'right',
      render: (r) => numCell(fmtPrice(r.netPrice ?? round4(r.price / (1 + r.taxRate / 100)))),
    },
    { accessor: 'amount', title: '价税合计', textAlign: 'right', render: (r) => numCell(fmtMoney(r.amount), true) },
    { accessor: 'tax', title: '税额', textAlign: 'right', render: (r) => numCell(fmtMoney(r.tax)) },
    { accessor: 'netAmount', title: '金额', textAlign: 'right', render: (r) => numCell(fmtMoney(r.netAmount)) },
  ]
}

export function skuColumn<T extends { skuCode: string; skuName: string }>(title = 'SKU'): DataTableColumn<T> {
  return {
    accessor: 'skuCode',
    title,
    render: (r) => (
      <Text fz="sm">
        <span className="qs-mono">{r.skuCode}</span> {r.skuName}
      </Text>
    ),
  }
}
