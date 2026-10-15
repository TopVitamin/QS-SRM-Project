import { DAY, HOUR, addDays, bjAt, todayStr } from '../domain/format'
import { defaultConfig } from '../domain/defaults'
import { enterpriseUsers } from '../domain/identities'
import { round2 } from '../domain/money'
import type { Actor, Db, PrototypeConfig, Supplier } from '../domain/types'
import type { Ctx, ProxyInput } from './core'
import {
  confirmRecon,
  createRecon,
  createRedForm,
  createRequest,
  disputeRecon,
  expireRedForms,
  redDirect,
  registerBlue,
  sendRecon,
  setUsage,
  type RedInput,
} from './finance'
import {
  acceptSuggestion,
  approveChange,
  approveOrder,
  closeOrder,
  confirmOrder,
  createChange,
  createOrder,
  createSuggestion,
  refuseOrder,
  rejectChange,
  rejectOrder,
  rejectSuggestion,
  reportKitting,
  reviewKitting,
  settlePushes,
  type KittingInput,
} from './orders'
import {
  createAppointment,
  confirmAppointment,
  printLabels,
  returnAppointment,
  saveShipment,
  simulateNotice,
  simulateReceipt,
  simulateReturn,
  simulateReturnOutbound,
  voidBox,
} from './shipments'
import { requestErp, reviewAdmission, saveAdmission, setTier, simulateErpCreate, type AdmissionInput } from './suppliers'

/** 示例数据结构变化时加1，浏览器里旧版本的数据会被重建。 */
export const DB_VERSION = 1

const S1 = 'SUP000001'
const S2 = 'SUP000002'
const S3 = 'SUP000003'
const S4 = 'SUP000004'
const S5 = 'SUP000005'
const S6 = 'SUP000006'

const SZ = 'WH000001'
const DG = 'WH000002'
const JX = 'WH000003'

const C1 = 'SP0101010001'
const C2 = 'SP0101010002'
const T1 = 'SP0101020001'
const T2 = 'SP0101020002'
const P1 = 'SP0101030001'
const P2 = 'SP0101030002'
const K1 = 'SP0201010001'

type Who = 'b1' | 'b2' | 'f1' | 'w1' | 'q1' | 'a1' | 'S1' | 'S2' | 'S3' | 'S5' | 'S6'

const portalOf: Partial<Record<Who, string>> = { S1, S2, S3, S5, S6 }

function emptyDb(now: number): Db {
  return {
    version: DB_VERSION,
    seededAt: now,
    rev: 0,
    seq: {},
    boxSeq: 0,
    suppliers: [],
    portalUsers: [],
    skus: [],
    warehouses: [],
    prices: [],
    orders: [],
    confirmations: [],
    pushJobs: [],
    changes: [],
    suggestions: [],
    kitting: [],
    shipments: [],
    boxes: [],
    notices: [],
    receipts: [],
    returns: [],
    appointments: [],
    reconciliations: [],
    invoiceRequests: [],
    invoices: [],
    redLetters: [],
    admissions: [],
    auditLogs: [],
  }
}

// ---------------------------------------------------------------- 主数据（全部是示例）

function seedMasterData(db: Db, now: number) {
  const since = now - 120 * DAY
  const admin = enterpriseUsers.find((u) => u.role === 'admin')!.name
  let contactSeq = 0
  const contact = (name: string, duty: string, mobile: string, isPrimary = false) => ({
    id: `ct-${++contactSeq}`,
    name,
    duty,
    mobile,
    email: `contact${contactSeq}@example.com`,
    isPrimary,
  })
  let addressSeq = 0
  const address = (label: string, detail: string, contactName: string, phone: string) => ({
    id: `ad-${++addressSeq}`,
    label,
    detail,
    contact: contactName,
    phone,
  })
  const supplier = (
    code: string,
    name: string,
    shortName: string,
    category: Supplier['category'],
    tier: Supplier['tier'],
    portal: boolean,
    buyerId: string,
    extra: Pick<Supplier, 'contacts' | 'addresses'>,
  ): Supplier => ({
    code,
    name,
    shortName,
    category,
    tier,
    relatedParty: '待认定',
    portalStatus: portal ? '已开通' : '未开通',
    currency: 'CNY',
    assignedBuyerId: buyerId,
    source: 'ERP供应商档案（示例）',
    createdAt: since,
    updatedAt: since,
    updatedBy: admin,
    ...extra,
  })
  db.suppliers.push(
    supplier(S1, '示例线材制造有限公司', '示例线材', '成品代工', '参股核心', true, 'u-b1', {
      contacts: [contact('张示例', '业务', '13800001001', true), contact('陈示例', '跟单', '13800001002')],
      addresses: [address('工厂发货地址', '示例地址：广东省东莞市示例工业园A栋', '陈示例', '13800001002')],
    }),
    supplier(S2, '示例充电头科技有限公司', '示例充电头', '成品代工', '参股核心', true, 'u-b1', {
      contacts: [contact('李示例', '业务', '13800002001', true)],
      addresses: [address('工厂发货地址', '示例地址：广东省深圳市示例科技园B栋', '李示例', '13800002001')],
    }),
    supplier(S3, '示例储能电子有限公司', '示例储能', '成品代工', '参股核心', true, 'u-b2', {
      contacts: [contact('王示例', '业务', '13800003001', true), contact('赵示例', '品质', '13800003002')],
      addresses: [address('工厂发货地址', '示例地址：广东省惠州市示例产业园C栋', '王示例', '13800003001')],
    }),
    supplier(S4, '示例电子制品有限公司', '示例电子', '成品代工', '未分级', false, 'u-b2', {
      contacts: [contact('刘示例', '跟单', '13800004001', true)],
      addresses: [address('工厂发货地址', '示例地址：广东省东莞市示例镇D路', '刘示例', '13800004001')],
    }),
    supplier(S5, '示例包装材料有限公司', '示例包材', '包材', '未分级', true, 'u-b2', {
      contacts: [contact('周示例', '业务', '13800005001', true)],
      addresses: [address('工厂发货地址', '示例地址：广东省东莞市示例包装产业园', '周示例', '13800005001')],
    }),
    supplier(S6, '示例移动电源有限公司', '示例移动电源', '成品代工', '未分级', true, 'u-b1', {
      contacts: [contact('吴示例', '业务', '13800006001', true)],
      addresses: [address('工厂发货地址', '示例地址：广东省深圳市示例工业区F栋', '吴示例', '13800006001')],
    }),
    supplier('SUP000007', '示例精密模具有限公司', '示例模具', '模具', '未分级', false, 'u-b2', {
      contacts: [contact('郑示例', '业务', '13800007001', true)],
      addresses: [],
    }),
  )
  const portalUser = (supplierCode: string, loginName: string, displayName: string) => ({
    id: `pu-${db.portalUsers.length + 1}`,
    supplierCode,
    loginName,
    displayName,
    isPrimary: true,
    status: '启用' as const,
    createdAt: since,
    createdBy: admin,
  })
  db.portalUsers.push(
    portalUser(S1, 'demo.xiancai', '线材厂业务（示例）'),
    portalUser(S2, 'demo.chongdiantou', '充电头厂业务（示例）'),
    portalUser(S3, 'demo.chuneng', '储能厂业务（示例）'),
    portalUser(S5, 'demo.baocai', '包材厂业务（示例）'),
    portalUser(S6, 'demo.yidong', '移动电源厂业务（示例）'),
  )
  db.seq['id:pu'] = db.portalUsers.length
  db.seq['id:ct'] = contactSeq
  db.seq['id:ad'] = addressSeq

  db.warehouses.push(
    { code: SZ, name: '深圳主仓', note: '自营主仓' },
    { code: DG, name: '东莞电商仓', note: '第三方电商仓，箱唛另有平台规则' },
    { code: JX, name: '嘉兴仓', note: '阶段5区域仓' },
  )
  db.skus.push(
    { code: C1, name: '示例 USB-C快充线 1m', unit: '条', categoryName: '示例分类·线材' },
    { code: C2, name: '示例 USB-C转Lightning线 1m', unit: '条', categoryName: '示例分类·线材' },
    { code: T1, name: '示例 20W快充充电头', unit: '个', categoryName: '示例分类·充电头' },
    { code: T2, name: '示例 65W氮化镓充电头', unit: '个', categoryName: '示例分类·充电头' },
    { code: P1, name: '示例 10000mAh充电宝', unit: '台', categoryName: '示例分类·充电宝' },
    { code: P2, name: '示例 20000mAh快充充电宝', unit: '台', categoryName: '示例分类·充电宝' },
    { code: K1, name: '示例 电商发货外箱（小号）', unit: '个', categoryName: '示例分类·包材' },
  )
  const effectiveFrom = todayStr(now - 90 * DAY)
  const price = (supplierCode: string, skuCode: string, value: number) => ({
    supplierCode,
    skuCode,
    price: value,
    taxRate: 13,
    source: 'ERP价目表（示例）',
    effectiveFrom,
  })
  db.prices.push(
    price(S1, C1, 6.8),
    price(S1, C2, 9.5),
    price(S2, T1, 15.6),
    price(S2, T2, 42),
    price(S3, P1, 48.5),
    price(S3, P2, 76),
    price(S4, C1, 7.1),
    price(S4, T1, 16.2),
    price(S5, K1, 2.35),
    price(S6, P1, 47.8),
  )
}

// ---------------------------------------------------------------- 时间

function monthShift(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

const pad2 = (n: number) => String(n).padStart(2, '0')

// ---------------------------------------------------------------- 场景

interface Step {
  at: number
  who: Who
  run: (ctx: Ctx) => void
  config?: Partial<PrototypeConfig>
}

/**
 * 示例数据不手写结果，而是按时间顺序调用模拟接口的业务函数生成：
 * 订单、推送、确认、发货、通知单、入库、对账、税票和日志都出自同一套规则，数量和状态自然对得上。
 * 两个历史月份按日历月锚定，保证对账期间不会因为打开原型的日期不同而重叠。
 */
export function buildSeed(now: number): Db {
  const db = emptyDb(now)
  seedMasterData(db, now)

  const today = todayStr(now)
  const ym = today.slice(0, 7)
  const prevYm = monthShift(ym, -1)
  const oldYm = monthShift(ym, -2)
  const D = (daysAgo: number, time: string) => bjAt(addDays(today, -daysAgo), time)
  const H = (hoursAgo: number) => now - hoursAgo * HOUR
  const P = (day: number, time: string) => bjAt(`${prevYm}-${pad2(day)}`, time)
  const O = (day: number, time: string) => bjAt(`${oldYm}-${pad2(day)}`, time)
  const Dd = (offset: number) => addDays(today, offset)
  const Pd = (day: number) => `${prevYm}-${pad2(day)}`
  const Od = (day: number) => `${oldYm}-${pad2(day)}`

  const steps: Step[] = []
  const ref: Record<string, string> = {}
  const get = (key: string) => {
    const value = ref[key]
    if (!value) throw new Error(`示例数据引用缺失：${key}`)
    return value
  }
  const at = (time: number, who: Who, run: (ctx: Ctx) => void, config?: Partial<PrototypeConfig>) => {
    steps.push({ at: time, who, run, config })
  }

  // ---- 动作封装

  const order = (
    key: string,
    o: { who: Who; at: number; supplier: string; warehouse: string; promised: string; lines: [string, number][]; remark?: string; submit?: boolean },
  ) =>
    at(o.at, o.who, (ctx) => {
      ref[key] = createOrder(
        ctx,
        {
          supplierCode: o.supplier,
          warehouseCode: o.warehouse,
          promisedDate: o.promised,
          remark: o.remark,
          lines: o.lines.map(([skuCode, qty]) => ({ skuCode, qty })),
        },
        o.submit ?? true,
      ).id
    })
  const approve = (key: string, who: Who, time: number, config?: Partial<PrototypeConfig>) =>
    at(time, who, (ctx) => approveOrder(ctx, get(key)), config)
  const confirm = (key: string, who: Who, time: number, proxy?: ProxyInput) => at(time, who, (ctx) => confirmOrder(ctx, get(key), proxy))
  const kit = (key: string, who: Who, time: number, input: KittingInput, refKey?: string) =>
    at(time, who, (ctx) => {
      const record = reportKitting(ctx, get(key), input)
      if (refKey) ref[refKey] = record.id
    })
  const ship = (
    key: string,
    o: {
      who: Who
      at: number
      lines: [lineNo: number, qty: number, perBox: number, batchNo: string][]
      carrier?: string
      waybillNo?: string
      plateNo?: string
      proxy?: ProxyInput
    },
  ) => {
    const orderKey = key.split('.')[0]
    at(o.at, o.who, (ctx) => {
      ref[key] = saveShipment(
        ctx,
        {
          orderId: get(orderKey),
          lines: o.lines.map(([lineNo, qty, perBox, batchNo]) => ({ lineNo, qty, perBox, batchNo })),
          expectedDate: todayStr(ctx.now + DAY),
          carrier: o.carrier ?? '示例物流',
          waybillNo: o.waybillNo ?? '',
          plateNo: o.plateNo ?? '',
          proxy: o.proxy,
        },
        undefined,
        true,
      ).id
    })
    at(o.at + 10 * 60_000, o.who, (ctx) => printLabels(ctx, get(key)))
  }
  const notice = (key: string, time: number) => at(time, 'b1', (ctx) => simulateNotice(ctx, get(key)))
  const receive = (key: string, time: number, mode: 'full' | 'short' | 'zero', lines?: { lineNo: number; qty: number }[]) =>
    at(time, 'w1', (ctx) => simulateReceipt(ctx, get(key), { mode, lines }))
  const appoint = (
    key: string,
    o: { who: Who; at: number; date: string; slot: string; plateNo: string; pieces: number; phone: string; proxy?: ProxyInput; confirmAt?: number },
  ) => {
    at(o.at, o.who, (ctx) => {
      ref[`${key}.yy`] = createAppointment(ctx, {
        shipmentId: get(key),
        date: o.date,
        slot: o.slot,
        plateNo: o.plateNo,
        pieces: o.pieces,
        driverPhone: o.phone,
        proxy: o.proxy,
      }).id
    })
    if (o.confirmAt) at(o.confirmAt, 'w1', (ctx) => confirmAppointment(ctx, get(`${key}.yy`)))
  }
  const receiptOf = (ctx: Ctx, shipmentKey: string) => {
    const receipt = ctx.db.receipts.find((r) => r.shipmentId === get(shipmentKey))
    if (!receipt) throw new Error(`示例数据：${shipmentKey}还没有入库单`)
    return receipt.id
  }
  let invoiceSeq = 0
  const invoiceNo = (issueDate: string) => `${issueDate.slice(0, 4)}${String(++invoiceSeq).padStart(16, '0')}`
  const blue = (key: string, who: Who, time: number, requestKey: string, issueDate: string, diff = 0) =>
    at(time, who, (ctx) => {
      const request = ctx.db.invoiceRequests.find((r) => r.id === get(requestKey))!
      const no = invoiceNo(issueDate)
      ref[key] = registerBlue(ctx, {
        requestId: request.id,
        invoiceNo: no,
        invoiceType: '数电票（增值税专用发票）',
        issueDate,
        amount: round2(request.amount + diff),
        tax: round2(request.tax + diff),
        netAmount: request.netAmount,
        taxRate: request.taxRates[0],
        attachmentName: `${no}.pdf`,
      }).id
    })
  const partialRed = (ctx: Ctx, invoiceKey: string, ratio: number, reason: string): RedInput => {
    const invoice = ctx.db.invoices.find((i) => i.id === get(invoiceKey))!
    const amount = round2(invoice.amount * ratio)
    const tax = round2((amount * invoice.taxRate) / (100 + invoice.taxRate))
    return { blueInvoiceId: invoice.id, scope: 'partial', amount, tax, reason }
  }
  const phoneProxy = (note: string): ProxyInput => ({ basisType: '电话', basisNote: note })

  // ================================================================ 两个月前：完整闭环，已对账开票

  order('H1', { who: 'b1', at: O(1, '10:00'), supplier: S1, warehouse: SZ, promised: Od(16), lines: [[C1, 4000], [C2, 1500]] })
  approve('H1', 'b2', O(1, '14:00'))
  confirm('H1', 'S1', O(2, '09:30'))
  kit('H1', 'S1', O(8, '10:00'), { lineNo: 1, nodeName: '主料齐套', status: '已齐套' })
  kit('H1', 'S1', O(8, '10:05'), { lineNo: 2, nodeName: '主料齐套', status: '已齐套' })
  ship('H1.s1', {
    who: 'S1',
    at: O(12, '09:00'),
    lines: [
      [1, 4000, 500, 'XC-A01'],
      [2, 1500, 300, 'XC-A02'],
    ],
    waybillNo: 'SL000000101',
    plateNo: '粤S示例101',
  })
  appoint('H1.s1', { who: 'S1', at: O(12, '09:30'), date: Od(13), slot: '08:00-10:00', plateNo: '粤S示例101', pieces: 13, phone: '13800000101', confirmAt: O(12, '11:00') })
  notice('H1.s1', O(12, '15:00'))
  receive('H1.s1', O(13, '10:30'), 'full')

  order('H2', { who: 'b1', at: O(2, '10:00'), supplier: S2, warehouse: SZ, promised: Od(18), lines: [[T1, 3000], [T2, 800]] })
  approve('H2', 'b1', O(2, '10:30'))
  confirm('H2', 'S2', O(2, '16:00'))
  ship('H2.s1', {
    who: 'S2',
    at: O(15, '09:00'),
    lines: [
      [1, 3000, 300, 'CD-A01'],
      [2, 800, 100, 'CD-A02'],
    ],
  })
  notice('H2.s1', O(15, '15:00'))
  receive('H2.s1', O(16, '10:00'), 'full')

  order('H3', { who: 'b2', at: O(3, '10:00'), supplier: S3, warehouse: SZ, promised: Od(20), lines: [[P1, 1200]] })
  approve('H3', 'b1', O(3, '15:00'))
  confirm('H3', 'S3', O(4, '16:00'))
  ship('H3.s1', { who: 'S3', at: O(18, '09:00'), lines: [[1, 1200, 60, 'CN-A01']], plateNo: '粤L示例103' })
  appoint('H3.s1', { who: 'S3', at: O(18, '09:30'), date: Od(19), slot: '08:00-10:00', plateNo: '粤L示例103', pieces: 20, phone: '13800000103', confirmAt: O(18, '10:30') })
  notice('H3.s1', O(18, '14:00'))
  receive('H3.s1', O(19, '10:00'), 'full')

  // ================================================================ 上个月：缺量、关闭、晚交

  order('H4', { who: 'b1', at: P(1, '10:00'), supplier: S1, warehouse: SZ, promised: Pd(12), lines: [[C1, 3000], [C2, 1000]] })
  approve('H4', 'b2', P(1, '11:00'))
  confirm('H4', 'S1', P(1, '17:00'))
  ship('H4.s1', {
    who: 'S1',
    at: P(9, '09:00'),
    lines: [
      [1, 3000, 500, 'XC-B01'],
      [2, 1000, 250, 'XC-B02'],
    ],
  })
  notice('H4.s1', P(9, '15:00'))
  receive('H4.s1', P(10, '10:00'), 'full')

  order('H5', { who: 'b1', at: P(2, '10:00'), supplier: S2, warehouse: SZ, promised: Pd(14), lines: [[T1, 2000]] })
  approve('H5', 'b2', P(2, '10:30'))
  confirm('H5', 'S2', P(3, '09:00'))
  ship('H5.s1', { who: 'S2', at: P(12, '09:00'), lines: [[1, 2000, 250, 'CD-B01']] })
  notice('H5.s1', P(12, '15:00'))
  receive('H5.s1', P(13, '10:00'), 'short', [{ lineNo: 1, qty: 1960 }])
  at(
    P(20, '10:00'),
    'b1',
    (ctx) => closeOrder(ctx, get('H5'), 'close', '示例：缺量40个不再补交，关闭订单。关闭由谁发起见待确认-04'),
    { closeInitiator: 'srm' },
  )

  order('H6', { who: 'b2', at: P(3, '10:00'), supplier: S3, warehouse: DG, promised: Pd(15), lines: [[P2, 600]] })
  approve('H6', 'b1', P(3, '11:00'))
  confirm('H6', 'S3', P(3, '15:00'))
  kit('H6', 'S3', P(10, '10:00'), { lineNo: 1, nodeName: '主料齐套', status: '已齐套' })
  ship('H6.s1', { who: 'S3', at: P(15, '09:00'), lines: [[1, 600, 30, 'CN-B01']] })
  notice('H6.s1', P(15, '14:00'))
  receive('H6.s1', P(16, '10:00'), 'full')

  // ================================================================ 两个月前的对账、开票、红字

  at(P(3, '10:00'), 'f1', (ctx) => {
    ref.R1 = createRecon(ctx, { supplierCode: S1, period: oldYm }).id
  })
  at(P(3, '10:30'), 'f1', (ctx) => sendRecon(ctx, get('R1')))
  at(P(4, '09:00'), 'S1', (ctx) => confirmRecon(ctx, get('R1')))
  at(P(4, '14:00'), 'f1', (ctx) => {
    ref.Q1 = createRequest(ctx, get('R1')).id
  })
  blue('I1', 'S1', P(6, '10:00'), 'Q1', Pd(6))
  at(P(10, '10:00'), 'f1', (ctx) => setUsage(ctx, get('I1'), 'used'))
  at(H(30), 'S1', (ctx) => {
    createRedForm(ctx, partialRed(ctx, 'I1', 0.1, '示例：部分货物退回，按退回金额红冲'))
  })

  at(P(3, '11:00'), 'f1', (ctx) => {
    ref.R3 = createRecon(ctx, { supplierCode: S2, period: oldYm }).id
  })
  at(P(3, '11:30'), 'f1', (ctx) => sendRecon(ctx, get('R3')))
  at(P(4, '10:00'), 'S2', (ctx) => confirmRecon(ctx, get('R3')))
  at(P(4, '15:00'), 'f1', (ctx) => {
    ref.Q2 = createRequest(ctx, get('R3')).id
  })
  blue('I2', 'S2', P(7, '10:00'), 'Q2', Pd(7), 0.02)
  at(P(12, '10:00'), 'S2', (ctx) => {
    redDirect(ctx, {
      blueInvoiceId: get('I2'),
      scope: 'full',
      reason: '示例：价税合计比开票申请多0.02，全额红冲后重开',
      invoiceNo: invoiceNo(Pd(12)),
      issueDate: Pd(12),
    })
  })

  at(P(3, '14:00'), 'f1', (ctx) => {
    ref.R6 = createRecon(ctx, { supplierCode: S3, period: oldYm }).id
  })
  at(P(3, '14:30'), 'f1', (ctx) => sendRecon(ctx, get('R6')))
  at(P(5, '10:00'), 'S3', (ctx) => confirmRecon(ctx, get('R6')))
  at(P(5, '15:00'), 'f1', (ctx) => {
    ref.Q3 = createRequest(ctx, get('R6')).id
  })
  blue('I3', 'S3', P(8, '10:00'), 'Q3', Pd(8))
  at(P(12, '10:00'), 'f1', (ctx) => setUsage(ctx, get('I3'), 'booked'))
  at(now - 6 * DAY, 'S3', (ctx) => {
    createRedForm(ctx, partialRed(ctx, 'I3', 0.05, '示例：部分退货红冲'))
  })
  at(H(20), 'f1', (ctx) => {
    createRedForm(ctx, partialRed(ctx, 'I3', 0.08, '示例：购买方发起，部分货物质量问题红冲'))
  })

  // ================================================================ 上个月的对账：待确认、待开票、有差异

  const monthStart = bjAt(`${ym}-01`, '00:00')
  const reconBase = Math.min(Math.max(monthStart + 9 * HOUR, now - 6 * DAY), now - 10 * 60_000)
  const gap = Math.max(60_000, Math.floor((now - 10 * 60_000 - reconBase) / 12))
  at(reconBase, 'f1', (ctx) => {
    ref.R2 = createRecon(ctx, { supplierCode: S1, period: prevYm }).id
  })
  at(reconBase + gap, 'f1', (ctx) => sendRecon(ctx, get('R2')))
  at(reconBase + 2 * gap, 'f1', (ctx) => {
    ref.R4 = createRecon(ctx, { supplierCode: S2, period: prevYm }).id
  })
  at(reconBase + 3 * gap, 'f1', (ctx) => sendRecon(ctx, get('R4')))
  at(reconBase + 4 * gap, 'S2', (ctx) => confirmRecon(ctx, get('R4')))
  at(reconBase + 5 * gap, 'f1', (ctx) => {
    ref.R5 = createRecon(ctx, { supplierCode: S3, period: prevYm }).id
  })
  at(reconBase + 6 * gap, 'f1', (ctx) => sendRecon(ctx, get('R5')))
  at(reconBase + 7 * gap, 'S3', (ctx) => {
    const recon = ctx.db.reconciliations.find((r) => r.id === get('R5'))!
    disputeRecon(ctx, recon.id, { lineIds: [recon.lines[0].id], reason: '示例：第1行入库数量与我方发货记录不一致，请核对入库单' })
  })

  // ================================================================ 采购退货

  at(now - 5 * DAY, 'b1', (ctx) => {
    ref.TH1 = simulateReturn(ctx, receiptOf(ctx, 'H4.s1'), { lineNo: 1, qty: 100, reason: '示例：来料抽检外观不良，退回100条' }).id
  })
  at(now - 4 * DAY, 'b1', (ctx) => simulateReturnOutbound(ctx, get('TH1')))

  // ================================================================ 本月：采购订单各个状态

  order('A', { who: 'b1', at: H(2), supplier: S1, warehouse: SZ, promised: Dd(20), lines: [[C1, 2000], [C2, 800]], remark: '示例：常规补货' })
  order('B', { who: 'b2', at: H(5), supplier: S3, warehouse: JX, promised: Dd(25), lines: [[P1, 800]] })
  order('C', { who: 'b1', at: H(1), supplier: S2, warehouse: SZ, promised: Dd(30), lines: [[T2, 500]], submit: false })

  order('D', { who: 'b2', at: D(1, '10:00'), supplier: S4, warehouse: SZ, promised: Dd(21), lines: [[C1, 1500]] })
  at(D(1, '16:00'), 'b1', (ctx) => rejectOrder(ctx, get('D'), '示例：数量与本月计划不符，请核对后重新提交'))

  order('E', { who: 'b1', at: H(6), supplier: S2, warehouse: SZ, promised: Dd(18), lines: [[T1, 1500]] })
  approve('E', 'b2', H(4), { erpAvailable: false })

  order('F', { who: 'b1', at: H(8), supplier: S1, warehouse: SZ, promised: Dd(15), lines: [[C2, 1200]] })
  approve('F', 'b2', H(7))

  order('G', { who: 'b1', at: H(32), supplier: S1, warehouse: JX, promised: Dd(14), lines: [[C1, 2500]] })
  approve('G', 'b1', H(30))

  order('R', { who: 'b2', at: D(3, '10:00'), supplier: S3, warehouse: SZ, promised: Dd(8), lines: [[P2, 1500]] })
  approve('R', 'b1', D(3, '11:00'))
  at(D(3, '16:00'), 'S3', (ctx) => refuseOrder(ctx, get('R'), '示例：订单数量超出本月产能，按当前交期无法交付'))

  // 交期建议待处理，齐套缺料进入交付预警
  order('I', { who: 'b1', at: D(6, '10:00'), supplier: S2, warehouse: SZ, promised: Dd(9), lines: [[T2, 1200]] })
  approve('I', 'b2', D(6, '10:20'))
  confirm('I', 'S2', D(6, '15:00'))
  kit('I', 'S2', D(2, '10:00'), { lineNo: 1, nodeName: '外壳到料', status: '缺料', materialName: '外壳', expectedDate: Dd(5), impact: '示例：影响整单组装' }, 'I.kt')
  at(D(1, '14:00'), 'S2', (ctx) => {
    createSuggestion(ctx, get('I'), { suggestedDate: Dd(14), reason: '示例：外壳模具维修，建议交期延后5天' })
  })
  at(D(1, '15:00'), 'q1', (ctx) => reviewKitting(ctx, get('I.kt'), '示例：已电话核实，外壳模具维修中'))

  // 建议已接受、变更推送ERP失败：SRM已接受、ERP尚未更新
  order('J', { who: 'b2', at: D(9, '10:00'), supplier: S3, warehouse: SZ, promised: Dd(5), lines: [[P1, 1000]] })
  approve('J', 'b1', D(9, '10:30'))
  confirm('J', 'S3', D(9, '14:00'))
  kit('J', 'S3', D(3, '09:50'), { lineNo: 1, nodeName: '电芯到料', status: '缺料', materialName: '电芯', expectedDate: Dd(8), impact: '示例：电芯晚到，整机组装顺延' })
  at(D(3, '10:00'), 'S3', (ctx) => {
    ref['J.sg'] = createSuggestion(ctx, get('J'), { suggestedDate: Dd(12), reason: '示例：电芯到料延迟一周，建议交期延后7天' }).id
  })
  at(D(2, '10:00'), 'b2', (ctx) => {
    ref['J.chg'] = acceptSuggestion(ctx, get('J.sg'), '示例：同意，已和计划确认').changeId!
  })
  at(D(2, '10:30'), 'b1', (ctx) => approveChange(ctx, get('J.chg')), { erpAvailable: false })

  // 交期变更已生效，部分入库后逾期
  order('L', { who: 'b1', at: D(20, '10:00'), supplier: S2, warehouse: SZ, promised: Dd(-8), lines: [[T1, 2000]] })
  approve('L', 'b2', D(20, '11:00'))
  confirm('L', 'S2', D(20, '15:00'))
  at(D(12, '10:00'), 'b1', (ctx) => {
    ref['L.chg'] = createChange(ctx, get('L'), { promisedDate: Dd(-2), reason: '示例：产线切换，双方商定交期延后6天' }, true).id
  })
  at(D(12, '14:00'), 'b2', (ctx) => approveChange(ctx, get('L.chg')))
  ship('L.s1', { who: 'S2', at: D(6, '09:00'), lines: [[1, 1000, 250, 'CD-C01']] })
  notice('L.s1', D(6, '15:00'))
  receive('L.s1', D(5, '10:00'), 'full')

  // 分两次到货：第一次全收（中途作废换码一箱），第二次通知已下发，等待模拟收货
  order('M', { who: 'b1', at: D(14, '10:00'), supplier: S2, warehouse: SZ, promised: Dd(3), lines: [[T2, 3000]] })
  approve('M', 'b1', D(14, '10:30'))
  confirm('M', 'S2', D(14, '16:00'))
  kit('M', 'S2', D(10, '10:00'), { lineNo: 1, nodeName: '主料齐套', status: '已齐套' })
  ship('M.s1', { who: 'S2', at: D(8, '09:00'), lines: [[1, 1800, 200, 'CD-D01']], plateNo: '粤S示例201' })
  appoint('M.s1', { who: 'S2', at: D(8, '09:30'), date: Dd(-7), slot: '08:00-10:00', plateNo: '粤S示例201', pieces: 9, phone: '13800000201', confirmAt: D(8, '11:00') })
  notice('M.s1', D(8, '14:00'))
  at(D(8, '16:00'), 'S2', (ctx) => {
    const box = ctx.db.boxes.find((b) => b.shipmentId === get('M.s1') && b.seq === 3 && b.status === 'valid')!
    voidBox(ctx, box.code, '示例：标签贴错箱，作废后换码')
  })
  receive('M.s1', D(7, '10:00'), 'full')
  ship('M.s2', { who: 'S2', at: D(2, '09:00'), lines: [[1, 1200, 200, 'CD-D02']], plateNo: '粤S示例202' })
  appoint('M.s2', { who: 'S2', at: D(2, '09:30'), date: Dd(0), slot: '10:00-12:00', plateNo: '粤S示例202', pieces: 6, phone: '13800000202', confirmAt: D(2, '11:00') })
  notice('M.s2', D(2, '14:00'))
  at(D(2, '10:00'), 'b1', (ctx) => {
    simulateReturn(ctx, receiptOf(ctx, 'M.s1'), { lineNo: 1, qty: 30, reason: '示例：外观划伤，退回30个' })
  })

  // 已确认，先发一批还没预约；建议被驳回；变更待审核
  order('N', { who: 'b1', at: D(4, '10:00'), supplier: S1, warehouse: SZ, promised: Dd(12), lines: [[C1, 3000], [C2, 1000]] })
  approve('N', 'b2', D(4, '10:30'))
  confirm('N', 'S1', D(4, '15:00'))
  at(D(3, '10:00'), 'S1', (ctx) => {
    ref['N.sg'] = createSuggestion(ctx, get('N'), { suggestedDate: Dd(18), reason: '示例：线材外被料备货紧张，建议交期延后6天' }).id
  })
  at(D(3, '15:00'), 'b1', (ctx) => rejectSuggestion(ctx, get('N.sg'), '示例：直播档期已定，交期不能延后'))
  kit('N', 'S1', D(2, '10:00'), { lineNo: 1, nodeName: '主料齐套', status: '已齐套' })
  at(D(1, '10:00'), 'b1', (ctx) => {
    createChange(ctx, get('N'), { promisedDate: Dd(15), reason: '示例：收货仓排期调整，交期延后3天' }, true)
  })
  ship('N.s1', { who: 'S1', at: H(3), lines: [[1, 1000, 250, 'XC-D01']], plateNo: '粤S示例302' })

  // 变更被驳回；预约被仓库退回改约
  order('O', { who: 'b1', at: D(10, '10:00'), supplier: S1, warehouse: SZ, promised: Dd(4), lines: [[C2, 2000]] })
  approve('O', 'b2', D(10, '10:30'))
  confirm('O', 'S1', D(10, '14:00'))
  at(D(6, '10:00'), 'b1', (ctx) => {
    ref['O.chg'] = createChange(ctx, get('O'), { promisedDate: Dd(9), reason: '示例：供应商口头申请延期' }, true).id
  })
  at(D(6, '15:00'), 'b2', (ctx) => rejectChange(ctx, get('O.chg'), '示例：没有供应商的交期建议记录，请让供应商在门户提交'))
  kit('O', 'S1', D(5, '10:00'), { lineNo: 1, nodeName: '主料齐套', status: '已齐套' })
  ship('O.s1', { who: 'S1', at: D(3, '09:00'), lines: [[1, 2000, 250, 'XC-C01']], plateNo: '粤S示例301' })
  appoint('O.s1', { who: 'S1', at: D(3, '09:30'), date: Dd(-1), slot: '13:30-15:30', plateNo: '粤S示例301', pieces: 8, phone: '13800000301' })
  notice('O.s1', D(3, '15:00'))
  at(D(2, '10:00'), 'w1', (ctx) => returnAppointment(ctx, get('O.s1.yy'), '示例：当天月台已满，请改约到其他日期'))

  // 门户未开通的供应商：采购代录确认、齐套、发货、预约和交期建议
  order('PX', { who: 'b2', at: D(8, '10:00'), supplier: S4, warehouse: SZ, promised: Dd(6), lines: [[C1, 2000], [T1, 600]] })
  approve('PX', 'b1', D(8, '10:30'))
  confirm('PX', 'b2', D(8, '15:00'), phoneProxy('示例：与工厂跟单员电话确认，按订单接单'))
  kit('PX', 'b2', D(5, '10:00'), { lineNo: 1, nodeName: '主料齐套', status: '已齐套', proxy: { basisType: '微信', basisNote: '示例：工厂微信发来备料照片' } })
  kit('PX', 'b2', D(5, '10:05'), { lineNo: 2, nodeName: '主料齐套', status: '已齐套', proxy: { basisType: '微信', basisNote: '示例：工厂微信发来备料照片' } })
  ship('PX.s1', {
    who: 'b2',
    at: D(3, '10:00'),
    lines: [
      [1, 2000, 500, 'DZ-A01'],
      [2, 600, 100, 'DZ-A02'],
    ],
    plateNo: '粤S示例401',
    proxy: { basisType: '纸质单据', basisNote: '示例：工厂传真的发货清单' },
  })
  notice('PX.s1', D(2, '15:00'))
  appoint('PX.s1', {
    who: 'b2',
    at: D(2, '16:00'),
    date: Dd(1),
    slot: '08:00-10:00',
    plateNo: '粤S示例401',
    pieces: 10,
    phone: '13800000401',
    proxy: phoneProxy('示例：司机电话报的车牌和件数'),
  })

  order('Q', { who: 'b2', at: H(4), supplier: S4, warehouse: SZ, promised: Dd(16), lines: [[T1, 800]] })
  approve('Q', 'b1', H(3))
  at(H(2), 'b2', (ctx) => {
    createSuggestion(ctx, get('Q'), {
      suggestedDate: Dd(20),
      reason: '示例：工厂电话反馈包材晚到，建议交期延后4天',
      proxy: phoneProxy('示例：工厂跟单员来电'),
    })
  })

  // 零收：通知单取消，可下推数量还回来
  order('Z', { who: 'b2', at: D(9, '10:00'), supplier: S5, warehouse: DG, promised: Dd(2), lines: [[K1, 20000]] })
  approve('Z', 'b1', D(9, '11:00'))
  confirm('Z', 'S5', D(9, '16:00'))
  ship('Z.s1', { who: 'S5', at: D(4, '09:00'), lines: [[1, 20000, 1000, 'BC-A01']] })
  notice('Z.s1', D(4, '14:00'))
  receive('Z.s1', D(3, '10:00'), 'zero')

  // 暂停或待淘汰：不接新单，在途照常
  order('S', { who: 'b1', at: D(18, '10:00'), supplier: S6, warehouse: SZ, promised: Dd(3), lines: [[P1, 500]] })
  approve('S', 'b2', D(18, '10:30'))
  confirm('S', 'S6', D(18, '15:00'))
  at(D(15, '10:00'), 'b1', (ctx) => setTier(ctx, S6, { tier: '暂停或待淘汰', reason: '示例：品质整改期间暂停接新单。暂停标准见待确认-32' }))
  kit('S', 'S6', D(6, '10:00'), { lineNo: 1, nodeName: '主料齐套', status: '已齐套' })
  ship('S.s1', { who: 'S6', at: D(3, '09:00'), lines: [[1, 500, 50, 'YD-A01']], plateNo: '粤S示例501' })
  notice('S.s1', D(3, '14:00'))
  appoint('S.s1', { who: 'S6', at: D(2, '10:00'), date: Dd(2), slot: '13:30-15:30', plateNo: '粤S示例501', pieces: 10, phone: '13800000501', confirmAt: D(1, '10:00') })

  // ================================================================ 供应商准入

  const admission = (name: string, category: AdmissionInput['category'], n: number, extra: Partial<AdmissionInput> = {}): AdmissionInput => ({
    name,
    category,
    creditCode: `91440300SAMPLE${String(n).padStart(4, '0')}`,
    contactName: `准入联系人${n}（示例）`,
    contactPhone: `1390000000${n}`,
    address: `示例地址：广东省示例市示例路${n}号`,
    supplyScope: '示例：仅供准入和打印参考，不限制下单（待确认-40）',
    relatedDeclaration: '示例：声明与强盛无关联关系。关联方认定见待确认-26',
    qualifications: [
      { type: '营业执照', fileName: `营业执照_${n}（示例）.pdf` },
      { type: '质量体系证书', fileName: `质量体系证书_${n}（示例）.pdf`, validTo: addDays(today, 400) },
    ],
    ...extra,
  })
  at(P(5, '10:00'), 'b1', (ctx) => {
    ref.ZR1 = saveAdmission(ctx, admission('示例快充科技有限公司', '成品代工', 1), undefined, true).id
  })
  at(P(6, '10:00'), 'q1', (ctx) => reviewAdmission(ctx, get('ZR1'), { result: '通过', note: '示例：资质齐全。样品准入怎么做见待确认-35' }))
  at(P(6, '14:00'), 'b1', (ctx) => reviewAdmission(ctx, get('ZR1'), { result: '通过', note: '示例：同意提交ERP建档' }))
  at(P(7, '10:00'), 'b1', (ctx) => requestErp(ctx, get('ZR1')))
  at(P(8, '10:00'), 'b1', (ctx) => simulateErpCreate(ctx, get('ZR1')))

  at(D(20, '10:00'), 'b1', (ctx) => {
    ref.ZR5 = saveAdmission(ctx, admission('示例塑胶制品有限公司', '配件', 5), undefined, true).id
  })
  at(D(18, '10:00'), 'q1', (ctx) => reviewAdmission(ctx, get('ZR5'), { result: '终止', note: '示例：资质不全且无法在约定时间内补齐' }))

  at(D(8, '10:00'), 'b2', (ctx) => {
    ref.ZR3 = saveAdmission(ctx, admission('示例数据线制造有限公司', '成品代工', 3, { qualifications: [{ type: '营业执照', fileName: '营业执照_3（示例）.pdf' }] }), undefined, true).id
  })
  at(D(7, '10:00'), 'q1', (ctx) => reviewAdmission(ctx, get('ZR3'), { result: '退回补充', note: '示例：缺少有效期内的质量体系证书扫描件' }))
  at(D(3, '10:00'), 'b2', (ctx) => saveAdmission(ctx, admission('示例数据线制造有限公司', '成品代工', 3), get('ZR3'), true))

  at(D(6, '10:00'), 'b1', (ctx) => {
    ref.ZR2 = saveAdmission(ctx, admission('示例数码配件有限公司', '配件', 2), undefined, true).id
  })
  at(D(5, '10:00'), 'q1', (ctx) => reviewAdmission(ctx, get('ZR2'), { result: '通过', note: '示例：资质齐全' }))
  at(D(4, '10:00'), 'b1', (ctx) => requestErp(ctx, get('ZR2')))

  at(D(1, '15:00'), 'b2', (ctx) => {
    saveAdmission(ctx, admission('示例物流服务有限公司', '物流服务', 4))
  })

  // ================================================================ 执行

  steps.sort((a, b) => a.at - b.at)
  for (const step of steps) {
    if (step.at > now) throw new Error(`示例数据的时间晚于当前时间：${new Date(step.at).toISOString()}`)
    const ctx: Ctx = { db, now: step.at, actor: actorOf(db, step.who), config: { ...defaultConfig, ...step.config } }
    settlePushes(ctx)
    expireRedForms(ctx)
    step.run(ctx)
  }
  const finalCtx: Ctx = { db, now, actor: actorOf(db, 'a1'), config: defaultConfig }
  settlePushes(finalCtx)
  expireRedForms(finalCtx)
  return db
}

function actorOf(db: Db, who: Who): Actor {
  const user = enterpriseUsers.find((u) => u.id === `u-${who}`)
  if (user) return { party: 'enterprise', role: user.role, userId: user.id, userName: user.name }
  const supplierCode = portalOf[who]
  const portalUser = db.portalUsers.find((u) => u.supplierCode === supplierCode)
  if (!supplierCode || !portalUser) throw new Error(`示例身份不存在：${who}`)
  return { party: 'supplier', role: 'supplier', userId: portalUser.id, userName: portalUser.displayName, supplierCode }
}
