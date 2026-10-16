import type { PrototypeConfig } from './types'

/** 原型为了能演示而选的默认值，不是结论。每一项的编号见前端设计说明9.2。 */
export const defaultConfig: PrototypeConfig = {
  dispatchTiming: 'onApprove',
  changeFields: { qty: false, price: false, warehouse: false },
  reconfirmAfterChange: false,
  closeInitiator: 'undecided',
  erpNoMode: 'erpOwn',
  manualRetry: true,
  reconInitiator: 'enterprise',
  reconCancelAllowed: false,
  invoiceTolerance: null,
  shipBeforeConfirm: false,
  appointmentNeedsConfirm: true,
  buyerScopeAssigned: false,
  changeNeedsApproval: true,
  alertDays: 10,
  erpAvailable: true,
}
