import type {
  Admission,
  Appointment,
  AuditLog,
  Box,
  ChangeItem,
  ChangeStatus,
  ConfirmRecord,
  ErpNotice,
  ErpReceipt,
  ErpReturn,
  Invoice,
  InvoiceRequest,
  KittingRecord,
  OrderChange,
  PortalUser,
  PriceEntry,
  PurchaseOrder,
  PushJob,
  ReceiptStatus,
  Reconciliation,
  RedLetter,
  RedStatus,
  Shipment,
  Sku,
  Suggestion,
  Supplier,
  SupplierTier,
  Warehouse,
} from './types'

/** 按钮能不能点。hidden表示当前身份根本没有这个动作，页面不显示按钮。 */
export interface ActionState {
  ok: boolean
  reason?: string
  hidden?: boolean
}

export type Actions<K extends string> = Record<K, ActionState>

export interface SupplierBrief {
  code: string
  name: string
  shortName: string
  portalStatus: Supplier['portalStatus']
  tier: SupplierTier
}

export interface LineQty {
  lineNo: number
  qty: number
  received: number
  inTransit: number
  pushable: number
  pendingShip: number
  shippable: number
}

export interface PendingEffect {
  changeId: string
  changeNo: string
  status: ChangeStatus
  items: ChangeItem[]
  promisedDate?: string
}

export type OrderActionKey =
  | 'edit'
  | 'submit'
  | 'withdraw'
  | 'approve'
  | 'reject'
  | 'retryPush'
  | 'check'
  | 'change'
  | 'close'
  | 'cancel'
  | 'confirm'
  | 'refuse'
  | 'suggest'
  | 'kitting'
  | 'ship'

export type AlertKind = 'nearDue' | 'overdue' | 'unconfirmed24h'

export interface OrderView extends PurchaseOrder {
  supplier: SupplierBrief
  warehouseName: string
  totals: { qty: number; amount: number; tax: number; netAmount: number }
  receiptStatus: ReceiptStatus
  lineQty: LineQty[]
  confirmDeadline?: number
  overdue24h: boolean
  pendingSuggestions: number
  pendingEffect?: PendingEffect
  unfinishedChange?: { id: string; no: string; status: ChangeStatus }
  proxy: boolean
  alerts: AlertKind[]
  pushJob?: PushJob
  actions: Actions<OrderActionKey>
}

export interface SuggestionView extends Suggestion {
  supplierName: string
  delayDays: number
  orderPromisedDate: string
  actions: Actions<'accept' | 'reject'>
}

export interface KittingView extends KittingRecord {
  skuName: string
  supplierName: string
  actions: Actions<'review'>
}

export interface ChangeView extends OrderChange {
  supplierName: string
  pushJob?: PushJob
  actions: Actions<'edit' | 'submit' | 'approve' | 'reject' | 'discard' | 'retryPush'>
}

export interface OrderDetail extends OrderView {
  confirmations: ConfirmRecord[]
  changes: ChangeView[]
  suggestions: SuggestionView[]
  kitting: KittingView[]
  shipments: ShipmentView[]
  notices: ErpNotice[]
  receipts: ErpReceipt[]
  returns: ReturnView[]
  pushJobs: PushJob[]
}

export interface ChangeDetail extends ChangeView {
  order: OrderView
  suggestion?: Suggestion
}

export interface PushJobView extends PushJob {
  supplierName: string
  actions: Actions<'retry' | 'check'>
}

export type ErpShipStatus = 'none' | 'pushing' | 'pushFailed' | 'waitingNotice' | 'issued' | 'full' | 'short' | 'zero'

export type ShipmentActionKey =
  | 'edit'
  | 'submit'
  | 'cancel'
  | 'regenerate'
  | 'print'
  | 'appoint'
  | 'simulateNotice'
  | 'simulateReceipt'
  | 'retryPush'

export interface ShipmentView extends Shipment {
  supplierName: string
  supplierPortal: Supplier['portalStatus']
  warehouseName: string
  erpStatus: ErpShipStatus
  totalQty: number
  boxCount: number
  notice?: ErpNotice
  receipt?: ErpReceipt
  appointment?: Appointment
  pushJob?: PushJob
  actions: Actions<ShipmentActionKey>
}

export interface BoxView extends Box {
  actions: Actions<'reprint' | 'void'>
}

export interface ShipmentDetail extends ShipmentView {
  boxes: BoxView[]
  lineQty: LineQty[]
  order: { id: string; no: string; promisedDate: string; bizStatus: PurchaseOrder['bizStatus']; confirmStatus: PurchaseOrder['confirmStatus'] }
}

export interface ShippableOrder {
  id: string
  no: string
  supplierCode: string
  supplierName: string
  warehouseCode: string
  warehouseName: string
  promisedDate: string
  lines: (PurchaseOrder['lines'][number] & LineQty)[]
  ship: ActionState
}

export interface AppointmentView extends Appointment {
  supplierName: string
  warehouseName: string
  actions: Actions<'confirm' | 'return' | 'reschedule' | 'cancel'>
}

export interface NoticeView extends ErpNotice {
  supplierName: string
  warehouseName: string
  receipt?: ErpReceipt
  noticeQty: number
  receivedQty: number
}

export interface ReturnView extends ErpReturn {
  supplierName: string
  actions: Actions<'ack' | 'simulateOutbound'>
}

export interface ReconView extends Reconciliation {
  supplierName: string
  request?: { id: string; no: string }
  actions: Actions<'send' | 'confirm' | 'dispute' | 'resolve' | 'cancel' | 'createRequest'>
}

export type RequestStatus = 'waiting' | 'registered' | 'reissue'

export interface InvoiceView extends Invoice {
  supplierName: string
  remaining: number
  activeRed?: { id: string; status: RedStatus }
  actions: Actions<'redDirect' | 'redFormSeller' | 'redFormBuyer' | 'usage'>
}

export interface InvoiceRequestView extends InvoiceRequest {
  supplierName: string
  status: RequestStatus
  invoices: InvoiceView[]
  actions: Actions<'registerBlue'>
}

export interface RedLetterView extends RedLetter {
  supplierName: string
  effectiveStatus: RedStatus
  actions: Actions<'confirm' | 'registerRed'>
}

export interface SupplierView extends Supplier {
  assignedBuyerName?: string
  openOrders: number
  actions: Actions<'collab' | 'tier' | 'openPortal'>
}

export interface SupplierDetail extends SupplierView {
  portalUsers: PortalUser[]
  prices: (PriceEntry & { skuName: string; unit: string })[]
  recentOrders: { id: string; no: string; promisedDate: string; confirmStatus: PurchaseOrder['confirmStatus']; bizStatus: PurchaseOrder['bizStatus'] }[]
}

export interface AdmissionView extends Admission {
  actions: Actions<'edit' | 'submit' | 'review' | 'requestErp' | 'simulateErpCreate'>
}

export interface AlertView {
  kind: AlertKind
  orderId: string
  orderNo: string
  supplierCode: string
  supplierName: string
  promisedDate: string
  daysLeft: number
  confirmStatus: PurchaseOrder['confirmStatus']
  receiptStatus: ReceiptStatus
  kittingSummary: string
  message: string
  sentAt?: number
}

export interface DashboardCard {
  key: string
  label: string
  count: number
  link: string
  roles: string[]
  tone: 'orange' | 'red' | 'violet' | 'blue' | 'green' | 'gray'
}

export interface DashboardData {
  cards: DashboardCard[]
  recentLogs: AuditLog[]
  alerts: AlertView[]
}

export interface PortalDashboard {
  supplier: SupplierBrief
  cards: DashboardCard[]
  pendingOrders: OrderView[]
}

export interface PerformanceRow {
  supplierCode: string
  supplierName: string
  tier: SupplierTier
  confirm: { numerator: number; denominator: number; rate: number | null }
  delivery: { numerator: number; denominator: number; rate: number | null }
  suggestions: { total: number; pending: number; accepted: number; rejected: number }
  reconFirstPass: { numerator: number; denominator: number; rate: number | null }
}

export interface TraceNode {
  key: string
  layer: '门户' | 'ERP' | '金蝶' | '税务'
  type: string
  no: string
  link?: string
  status?: string
  statusColor?: string
  detail?: string
  warn?: string
  highlight?: boolean
}

export interface TraceResult {
  found: boolean
  message?: string
  nodes: TraceNode[]
}

export interface Meta {
  skus: Sku[]
  warehouses: Warehouse[]
}

export interface Pulse {
  rev: number
  pushing: number
  seededAt: number
}

export interface NavBadges {
  [key: string]: number
}

export interface DemoIdentities {
  enterprise: { id: string; name: string; role: string }[]
  suppliers: (SupplierBrief & { users: PortalUser[] })[]
}

export interface SupplierPrices {
  supplierCode: string
  skus: (Sku & { price?: PriceEntry })[]
}
