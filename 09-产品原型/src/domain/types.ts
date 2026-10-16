export type Party = 'enterprise' | 'supplier'
export type EnterpriseRole = 'buyer' | 'finance' | 'warehouse' | 'quality' | 'planner' | 'admin'
export type Role = EnterpriseRole | 'supplier'

export interface Actor {
  party: Party | 'system'
  role: Role | 'system' | 'erp' | 'wms'
  userId: string
  userName: string
  supplierCode?: string
}

export interface ProxyInfo {
  proxyBy: string
  proxyAt: number
  basisType: string
  basisNote: string
}

export interface Contact {
  id: string
  name: string
  duty: string
  mobile: string
  email: string
  isPrimary: boolean
}

export interface Address {
  id: string
  label: string
  detail: string
  contact: string
  phone: string
}

export type SupplierCategory = '成品代工' | '包材' | '配件' | '模具' | '物流服务'
export type SupplierTier = '参股核心' | '未分级' | '暂停或待淘汰'

export interface Supplier {
  code: string
  name: string
  shortName: string
  category: SupplierCategory
  tier: SupplierTier
  tierReason?: string
  tierChangedAt?: number
  tierChangedBy?: string
  relatedParty: string
  portalStatus: '已开通' | '未开通'
  currency: string
  assignedBuyerId?: string
  contacts: Contact[]
  addresses: Address[]
  source: string
  createdAt: number
  updatedAt: number
  updatedBy: string
}

export interface PortalUser {
  id: string
  supplierCode: string
  loginName: string
  displayName: string
  isPrimary: boolean
  status: '启用' | '停用'
  createdAt: number
  createdBy: string
}

export interface Sku {
  code: string
  name: string
  unit: string
  categoryName: string
}

export interface Warehouse {
  code: string
  name: string
  note?: string
}

export interface PriceEntry {
  supplierCode: string
  skuCode: string
  price: number
  taxRate: number
  source: string
  effectiveFrom: string
}

export interface OrderLine {
  lineNo: number
  skuCode: string
  skuName: string
  unit: string
  qty: number
  price: number
  taxRate: number
  netPrice: number
  amount: number
  tax: number
  netAmount: number
  priceSource: string
}

export type AuditStatus = 'draft' | 'pending' | 'approved'
export type PushStatus = 'none' | 'waiting' | 'pushing' | 'accepted' | 'failed'
export type ConfirmStatus = 'notSent' | 'pending' | 'confirmed' | 'rejected'
export type BizStatus = 'open' | 'closed' | 'cancelled'
export type ReceiptStatus = 'none' | 'partial' | 'full'

export interface ErpOrderCopy {
  no: string
  sourceNo: string
  receivedAt: number
  supplierCode: string
  warehouseCode: string
  promisedDate: string
  lines: { lineNo: number; skuCode: string; qty: number; price: number }[]
  bizStatus: BizStatus
}

export interface CheckItem {
  item: string
  srm: string
  erp: string
  ok: boolean
}

export interface CheckResult {
  at: number
  by: string
  consistent: boolean
  items: CheckItem[]
}

export interface PurchaseOrder {
  id: string
  no: string
  supplierCode: string
  supplierName: string
  warehouseCode: string
  promisedDate: string
  firstPromisedDate: string
  currency: string
  remark: string
  lines: OrderLine[]
  auditStatus: AuditStatus
  submittedBy?: string
  submittedAt?: number
  approvedBy?: string
  approvedAt?: number
  rejectComment?: string
  pushStatus: PushStatus
  pushJobId?: string
  erp?: ErpOrderCopy
  lastCheck?: CheckResult
  confirmStatus: ConfirmStatus
  sentAt?: number
  confirmedAt?: number
  confirmBy?: string
  refuseReason?: string
  bizStatus: BizStatus
  closeInfo?: { kind: 'close' | 'cancel'; reason: string; by: string; at: number }
  createdBy: string
  createdById: string
  createdAt: number
  updatedBy: string
  updatedAt: number
  changeSeq: number
}

export interface ConfirmRecord {
  id: string
  orderId: string
  supplierCode: string
  action: '确认接单' | '拒绝接单' | '下发供应商' | '变更后重新下发'
  reason?: string
  by: string
  at: number
  proxy?: ProxyInfo
}

export type PushKind = '订单' | '变更' | '关闭同步' | '发货单'

export interface PushAttempt {
  seq: number
  startedAt: number
  settledAt?: number
  trigger: string
  operator: string
  planned: 'success' | 'fail'
  result: 'pending' | 'success' | 'fail'
  message: string
}

export interface PushJob {
  id: string
  kind: PushKind
  objectId: string
  objectNo: string
  orderId: string
  orderNo: string
  supplierCode: string
  status: 'pushing' | 'accepted' | 'failed'
  attempts: PushAttempt[]
  createdAt: number
  updatedAt: number
}

export type ChangeField = 'promisedDate' | 'qty' | 'price' | 'warehouse'

export interface ChangeItem {
  field: ChangeField
  lineNo?: number
  label: string
  before: string | number
  after: string | number
}

export type ChangeStatus = 'draft' | 'pending' | 'pushing' | 'failed' | 'effective' | 'rejected' | 'discarded'

export interface OrderChange {
  id: string
  no: string
  seq: number
  orderId: string
  orderNo: string
  supplierCode: string
  items: ChangeItem[]
  reason: string
  source: 'buyer' | 'suggestion'
  suggestionId?: string
  status: ChangeStatus
  needApproval: boolean
  needReconfirm: boolean
  createdBy: string
  createdAt: number
  submittedAt?: number
  approvedBy?: string
  approvedAt?: number
  rejectComment?: string
  effectiveAt?: number
  pushJobId?: string
}

export interface Suggestion {
  id: string
  no: string
  orderId: string
  orderNo: string
  supplierCode: string
  currentDate: string
  suggestedDate: string
  reason: string
  status: 'pending' | 'accepted' | 'rejected'
  submittedBy: string
  submittedAt: number
  proxy?: ProxyInfo
  handledBy?: string
  handledAt?: number
  handleNote?: string
  changeId?: string
}

export interface KittingRecord {
  id: string
  orderId: string
  orderNo: string
  supplierCode: string
  lineNo: number
  nodeName: string
  status: '已齐套' | '缺料'
  materialName?: string
  expectedDate?: string
  impact?: string
  reportedBy: string
  reportedAt: number
  proxy?: ProxyInfo
  review?: { by: string; at: number; note: string }
}

export interface ShipmentLine {
  lineNo: number
  skuCode: string
  skuName: string
  unit: string
  qty: number
  batchNo: string
  perBox: number
}

export type ShipmentStatus = 'draft' | 'submitted' | 'cancelled'

export interface Shipment {
  id: string
  no: string
  orderId: string
  orderNo: string
  supplierCode: string
  warehouseCode: string
  lines: ShipmentLine[]
  expectedDate: string
  carrier: string
  waybillNo: string
  plateNo: string
  remark: string
  status: ShipmentStatus
  createdBy: string
  createdAt: number
  updatedAt: number
  submittedAt?: number
  cancelledAt?: number
  cancelReason?: string
  proxy?: ProxyInfo
  pushJobId?: string
  noticeId?: string
}

export interface Box {
  code: string
  shipmentId: string
  shipmentNo: string
  orderId: string
  orderNo: string
  supplierCode: string
  warehouseCode: string
  lineNo: number
  skuCode: string
  skuName: string
  unit: string
  batchNo: string
  qty: number
  seq: number
  total: number
  status: 'valid' | 'void'
  printCount: number
  voidReason?: string
  voidAt?: number
  voidBy?: string
  replacedBy?: string
  replaces?: string
  createdAt: number
}

export type NoticeStatus = 'issued' | 'completed' | 'cancelled'

export interface ErpNotice {
  id: string
  no: string
  shipmentId: string
  shipmentNo: string
  orderId: string
  orderNo: string
  erpOrderNo: string
  supplierCode: string
  warehouseCode: string
  lines: { lineNo: number; skuCode: string; skuName: string; unit: string; qty: number }[]
  status: NoticeStatus
  createdAt: number
  resultAt?: number
  receiptId?: string
}

export interface MoneyLine {
  lineNo: number
  skuCode: string
  skuName: string
  unit: string
  qty: number
  price: number
  taxRate: number
  amount: number
  tax: number
  netAmount: number
}

export interface ErpReceipt {
  id: string
  no: string
  noticeId: string
  noticeNo: string
  shipmentId: string
  shipmentNo: string
  orderId: string
  orderNo: string
  erpOrderNo: string
  supplierCode: string
  warehouseCode: string
  lines: (MoneyLine & { noticeQty: number })[]
  date: string
  createdAt: number
}

export interface ErpReturn {
  id: string
  returnNo: string
  noticeNo: string
  outboundNo?: string
  orderId: string
  orderNo: string
  erpOrderNo: string
  supplierCode: string
  warehouseCode: string
  lines: MoneyLine[]
  reason: string
  erpStatus: '采退通知已下发' | '已出库'
  outboundDate?: string
  outboundAt?: number
  ack: 'pending' | 'acked'
  ackBy?: string
  ackAt?: number
  createdAt: number
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'booked' | 'returned' | 'cancelled'

export interface Appointment {
  id: string
  no: string
  shipmentId: string
  shipmentNo: string
  orderNo: string
  supplierCode: string
  warehouseCode: string
  date: string
  slot: string
  plateNo: string
  pieces: number
  driverPhone: string
  status: AppointmentStatus
  history: { at: number; by: string; action: string; note?: string }[]
  createdBy: string
  createdAt: number
  proxy?: ProxyInfo
}

export interface ReconLine {
  id: string
  docType: '采购入库单' | '采退出库单'
  docId: string
  docNo: string
  docDate: string
  orderNo: string
  erpOrderNo: string
  lineNo: number
  skuCode: string
  skuName: string
  unit: string
  qty: number
  price: number
  taxRate: number
  amount: number
  tax: number
  netAmount: number
}

export type ReconStatus = 'drafted' | 'sent' | 'confirmed' | 'disputed' | 'cancelled'

export interface Reconciliation {
  id: string
  no: string
  supplierCode: string
  period: string
  lines: ReconLine[]
  totals: { qty: number; amount: number; tax: number; netAmount: number }
  status: ReconStatus
  initiator: 'enterprise' | 'supplier'
  createdBy: string
  createdAt: number
  sentAt?: number
  confirmedAt?: number
  confirmedBy?: string
  dispute?: { lineIds: string[]; reason: string; by: string; at: number }
  history: { at: number; by: string; action: string; note?: string }[]
  refetchCount: number
}

export interface InvoiceRequest {
  id: string
  no: string
  reconciliationId: string
  reconciliationNo: string
  supplierCode: string
  buyerName: string
  period: string
  amount: number
  tax: number
  netAmount: number
  taxRates: number[]
  createdBy: string
  createdAt: number
}

export interface PrecheckItem {
  key: string
  label: string
  result: 'pass' | 'fail' | 'warn' | 'na'
  message: string
  /** 这一项不通过时拦住登记。 */
  blocking?: boolean
}

export interface Precheck {
  at: number
  overall: 'match' | 'diff'
  items: PrecheckItem[]
}

export type UsageStatus = 'none' | 'used' | 'booked'

export interface Invoice {
  id: string
  kind: 'blue' | 'red'
  invoiceNo: string
  invoiceType: string
  issueDate: string
  supplierCode: string
  requestId?: string
  requestNo?: string
  amount: number
  tax: number
  netAmount: number
  taxRate: number
  attachmentName?: string
  registeredBy: string
  registeredAt: number
  precheck: Precheck
  usageStatus: UsageStatus
  usageUpdatedAt?: number
  blueInvoiceId?: string
  blueInvoiceNo?: string
  redLetterId?: string
  reversedAmount: number
}

export type RedStatus = 'waiting' | 'confirmed' | 'issued' | 'voided'

export interface RedLetter {
  id: string
  path: 'direct' | 'form'
  blueInvoiceId: string
  blueInvoiceNo: string
  supplierCode: string
  scope: 'full' | 'partial'
  amount: number
  tax: number
  netAmount: number
  reason: string
  formNo?: string
  initiator?: 'seller' | 'buyer'
  initiatedBy?: string
  initiatedAt?: number
  deadline?: number
  status: RedStatus
  confirmedBy?: string
  confirmedAt?: number
  redInvoiceId?: string
  redInvoiceNo?: string
  createdAt: number
}

export type AdmissionStatus = 'draft' | 'reviewing' | 'waitingErp' | 'created' | 'terminated'

export interface Admission {
  id: string
  seq: number
  name: string
  category: SupplierCategory
  creditCode: string
  contactName: string
  contactPhone: string
  address: string
  supplyScope: string
  qualifications: { id: string; type: string; fileName: string; validTo?: string }[]
  relatedDeclaration: string
  status: AdmissionStatus
  applicant: string
  createdAt: number
  updatedAt: number
  submittedAt?: number
  reviews: { by: string; role: string; at: number; result: '通过' | '退回补充' | '终止'; note: string }[]
  erpRequestedAt?: number
  erpCode?: string
  erpCreatedAt?: number
}

export interface AuditLog {
  id: string
  at: number
  actorName: string
  actorRole: string
  party: Party | 'system'
  supplierCode?: string
  objectType: string
  objectId: string
  objectNo: string
  action: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  note?: string
  proxy?: ProxyInfo
}

export interface PrototypeConfig {
  dispatchTiming: 'onApprove' | 'afterErpAccepted' | 'confirmBeforePush'
  changeFields: { qty: boolean; price: boolean; warehouse: boolean }
  reconfirmAfterChange: boolean
  closeInitiator: 'undecided' | 'srm'
  erpNoMode: 'erpOwn' | 'reuseSrm'
  manualRetry: boolean
  reconInitiator: 'enterprise' | 'supplier' | 'both'
  reconCancelAllowed: boolean
  invoiceTolerance: number | null
  shipBeforeConfirm: boolean
  appointmentNeedsConfirm: boolean
  buyerScopeAssigned: boolean
  changeNeedsApproval: boolean
  alertDays: 10 | 7
  erpAvailable: boolean
}

export interface Db {
  version: number
  seededAt: number
  rev: number
  seq: Record<string, number>
  boxSeq: number
  suppliers: Supplier[]
  portalUsers: PortalUser[]
  skus: Sku[]
  warehouses: Warehouse[]
  prices: PriceEntry[]
  orders: PurchaseOrder[]
  confirmations: ConfirmRecord[]
  pushJobs: PushJob[]
  changes: OrderChange[]
  suggestions: Suggestion[]
  kitting: KittingRecord[]
  shipments: Shipment[]
  boxes: Box[]
  notices: ErpNotice[]
  receipts: ErpReceipt[]
  returns: ErpReturn[]
  appointments: Appointment[]
  reconciliations: Reconciliation[]
  invoiceRequests: InvoiceRequest[]
  invoices: Invoice[]
  redLetters: RedLetter[]
  admissions: Admission[]
  auditLogs: AuditLog[]
}
