function roundTo(value: number, digits: number) {
  const factor = 10 ** digits
  const sign = value < 0 ? -1 : 1
  return (sign * Math.round(Math.abs(value) * factor + Number.EPSILON)) / factor
}

export const round2 = (value: number) => roundTo(value, 2)
export const round4 = (value: number) => roundTo(value, 4)

/**
 * 沿用ERP的算法：不含税单价 = 含税单价 ÷ (1 + 税率)，保留4位；
 * 价税合计、金额各自保留2位，税额 = 价税合计 − 金额，尾差落在税额上。
 */
export function calcAmounts(qty: number, price: number, taxRate: number) {
  const netPrice = round4(price / (1 + taxRate / 100))
  const amount = round2(qty * price)
  const netAmount = round2(qty * netPrice)
  const tax = round2(amount - netAmount)
  return { netPrice, amount, netAmount, tax }
}

export function sumBy<T>(rows: T[], pick: (row: T) => number) {
  return rows.reduce((total, row) => total + pick(row), 0)
}

export function sumMoney<T>(rows: T[], pick: (row: T) => number) {
  return round2(sumBy(rows, pick))
}
