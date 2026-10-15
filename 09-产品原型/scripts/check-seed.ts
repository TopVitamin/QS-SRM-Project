/**
 * 在Node里按不同的「当前时间」生成示例数据，检查不变量，并让每个演示身份把主要接口跑一遍。
 * 用法：npm run check:seed
 */
import { bjAt } from '../src/domain/format'
import { defaultConfig } from '../src/domain/defaults'
import { enterpriseUsers } from '../src/domain/identities'
import type { Actor, Db } from '../src/domain/types'
import type { Ctx } from '../src/mocks/core'
import { buildSeed } from '../src/mocks/seed'
import { lineQty } from '../src/mocks/rules'
import * as insights from '../src/mocks/insights'
import * as views from '../src/mocks/views'

const failures: string[] = []
const check = (ok: boolean, message: string) => {
  if (!ok) failures.push(message)
}

function actors(db: Db): Actor[] {
  return [
    ...enterpriseUsers.map((u) => ({ party: 'enterprise' as const, role: u.role, userId: u.id, userName: u.name })),
    ...db.portalUsers.map((u) => ({
      party: 'supplier' as const,
      role: 'supplier' as const,
      userId: u.id,
      userName: u.displayName,
      supplierCode: u.supplierCode,
    })),
  ]
}

function invariants(db: Db, label: string) {
  for (const order of db.orders) {
    for (const q of lineQty(db, order)) {
      check(q.pushable >= 0, `${label} ${order.no} 第${q.lineNo}行可下推为负`)
      check(q.shippable >= 0, `${label} ${order.no} 第${q.lineNo}行本次可发为负`)
    }
  }
  for (const shipment of db.shipments) {
    if (shipment.status === 'cancelled') continue
    for (const line of shipment.lines) {
      const boxed = db.boxes
        .filter((b) => b.shipmentId === shipment.id && b.lineNo === line.lineNo && b.status === 'valid')
        .reduce((t, b) => t + b.qty, 0)
      check(boxed === line.qty, `${label} ${shipment.no} 第${line.lineNo}行箱码数量${boxed}不等于发货数量${line.qty}`)
    }
  }
  for (const notice of db.notices) {
    const receipt = db.receipts.find((r) => r.id === notice.receiptId)
    if (notice.status === 'cancelled') check(!receipt, `${label} 零收的${notice.no}不应有入库单`)
    for (const line of receipt?.lines ?? []) {
      check(line.qty <= line.noticeQty, `${label} ${receipt!.no}实收超过通知数量`)
    }
  }
  const pushing = db.pushJobs.filter((j) => j.status === 'pushing')
  check(pushing.length === 0, `${label} 有${pushing.length}笔推送停在推送中`)
  const nos = db.invoices.map((i) => i.invoiceNo)
  check(new Set(nos).size === nos.length, `${label} 税票号码重复`)
  check(nos.every((n) => /^\d{20}$/.test(n)), `${label} 税票号码不是20位`)
}

function exercise(db: Db, now: number, label: string) {
  for (const actor of actors(db)) {
    const ctx: Ctx = { db: structuredClone(db), now, actor, config: defaultConfig }
    const who = `${label} ${actor.userName}`
    try {
      const orders = views.listOrders(ctx)
      for (const o of orders) views.orderDetail(ctx, o.id)
      for (const s of views.listShipments(ctx)) views.shipmentDetail(ctx, s.id)
      views.listSuggestions(ctx)
      views.listAppointments(ctx)
      views.listNotices(ctx)
      views.listReceipts(ctx)
      views.listReturns(ctx)
      for (const r of views.listRecons(ctx)) views.reconDetail(ctx, r.id)
      for (const r of views.listRequests(ctx)) views.requestDetail(ctx, r.id)
      views.listInvoices(ctx)
      views.listRedLetters(ctx)
      insights.navBadges(ctx)
      if (actor.party === 'supplier') {
        insights.portalDashboard(ctx)
        views.supplierDetail(ctx, actor.supplierCode!)
        views.shippableOrders(ctx, actor.supplierCode)
        check(orders.every((o) => o.supplierCode === actor.supplierCode), `${who} 看到了别家的订单`)
      } else {
        insights.dashboard(ctx)
        insights.listAlerts(ctx)
        views.listKitting(ctx)
        views.listChanges(ctx).forEach((c) => views.changeDetail(ctx, c.id))
        views.listPushJobs(ctx)
        views.listSuppliers(ctx).forEach((s) => views.supplierDetail(ctx, s.code))
        views.listAdmissions(ctx)
        views.shippableOrders(ctx)
        insights.performance(ctx, { promise: 'first', basis: 'batch', confirmBasis: 'line' })
        insights.auditLogs(ctx, new URLSearchParams())
        const samples = insights.traceSamples(ctx)
        for (const box of [samples.validBox, samples.voidBox]) if (box) check(insights.trace(ctx, { box }).found, `${who} 追溯不到箱码${box}`)
        if (samples.receiptNo) check(insights.trace(ctx, { receipt: samples.receiptNo }).found, `${who} 追溯不到入库单`)
        const expectedLinks: Record<string, number> = { shortage: 3, box: 2, twice: 2, proxy: 3, invoice: 1 }
        for (const scenario of insights.demoScenarios(ctx)) {
          check(
            scenario.links.length === expectedLinks[scenario.key],
            `${who} 演示路线「${scenario.title}」只找到${scenario.links.length}个入口：${scenario.links.map((l) => l.label).join('、')}`,
          )
        }
      }
    } catch (error) {
      failures.push(`${who} 接口出错：${(error as Error).message}`)
    }
  }
}

const moments: [string, number][] = [
  ['2026-10-15 10:30', bjAt('2026-10-15', '10:30')],
  ['2026-11-01 00:05', bjAt('2026-11-01', '00:05')],
  ['2026-11-01 08:00', bjAt('2026-11-01', '08:00')],
  ['2026-10-31 23:50', bjAt('2026-10-31', '23:50')],
  ['2027-01-01 00:20', bjAt('2027-01-01', '00:20')],
  ['2028-02-29 12:00', bjAt('2028-02-29', '12:00')],
  ['2026-03-03 07:00', bjAt('2026-03-03', '07:00')],
  ['now', Date.now()],
]

for (const [label, now] of moments) {
  let db: Db
  try {
    db = buildSeed(now)
  } catch (error) {
    failures.push(`${label} 生成失败：${(error as Error).stack}`)
    continue
  }
  invariants(db, label)
  exercise(db, now, label)
  if (label === moments[0][0]) {
    const ctx: Ctx = { db, now, actor: actors(db)[0], config: defaultConfig }
    const cards = insights.dashboard(ctx).cards.map((c) => `${c.label}=${c.count}`)
    console.log(`[${label}] 订单${db.orders.length} 发货单${db.shipments.length} 箱码${db.boxes.length} 入库单${db.receipts.length} 对账单${db.reconciliations.length} 税票${db.invoices.length} 日志${db.auditLogs.length} 体积${(JSON.stringify(db).length / 1024).toFixed(0)}KB`)
    console.log(`  待办：${cards.join('，')}`)
    for (const actor of actors(db).filter((a) => a.party === 'supplier')) {
      const portal = insights.portalDashboard({ ...ctx, actor })
      console.log(`  ${actor.userName}：${portal.cards.filter((c) => c.count).map((c) => `${c.label}=${c.count}`).join('，')}`)
    }
  }
}

if (failures.length) {
  console.error(`\n${failures.length}项检查未通过：`)
  for (const f of failures) console.error(`- ${f}`)
  process.exit(1)
}
console.log(`\n${moments.length}个时间点全部通过。`)
