import type { ComponentType } from 'react'
import { createHashRouter, type RouteObject } from 'react-router'
import { NotFound } from '../components/QueryState'
import { BuyerLayout } from './BuyerLayout'
import { EntryPage } from './EntryPage'
import { PortalLayout } from './PortalLayout'
import { BootLoading, RouteError, StandaloneNotFound } from './RouteError'

/** 页面按路由拆包：图表库只在绩效看板里加载，首屏只带布局和入口。 */
function lazyPage<M>(load: () => Promise<M>, pick: (module: M) => ComponentType): Pick<RouteObject, 'lazy'> {
  return { lazy: async () => ({ Component: pick(await load()) }) }
}

const buyer = () => import('./buyerPages')
const portal = () => import('./portalPages')
const shared = () => import('./sharedPages')

const buyerRoutes: RouteObject[] = [
  { index: true, ...lazyPage(buyer, (m) => m.Dashboard) },
  { path: 'orders', ...lazyPage(buyer, (m) => m.OrderList) },
  { path: 'orders/new', ...lazyPage(buyer, (m) => m.OrderCreatePage) },
  { path: 'orders/:id', ...lazyPage(buyer, (m) => m.OrderDetailPage) },
  { path: 'orders/:id/edit', ...lazyPage(buyer, (m) => m.OrderEditPage) },
  { path: 'orders/:id/change', ...lazyPage(buyer, (m) => m.ChangeFormPage) },
  { path: 'approvals', ...lazyPage(buyer, (m) => m.Approvals) },
  { path: 'changes', ...lazyPage(buyer, (m) => m.ChangeList) },
  { path: 'changes/:id', ...lazyPage(buyer, (m) => m.ChangeDetailPage) },
  { path: 'suggestions', ...lazyPage(buyer, (m) => m.Suggestions) },
  { path: 'erp-sync', ...lazyPage(buyer, (m) => m.ErpSync) },
  { path: 'shipments', ...lazyPage(shared, (m) => m.ShipmentList) },
  { path: 'shipments/new', ...lazyPage(shared, (m) => m.ShipmentWizardPage) },
  { path: 'shipments/:id', ...lazyPage(shared, (m) => m.ShipmentDetailPage) },
  { path: 'shipments/:id/labels', ...lazyPage(shared, (m) => m.LabelsPage) },
  { path: 'appointments', ...lazyPage(buyer, (m) => m.AppointmentBoard) },
  { path: 'receipts', ...lazyPage(shared, (m) => m.ReceiptsPage) },
  { path: 'alerts', ...lazyPage(buyer, (m) => m.Alerts) },
  { path: 'trace', ...lazyPage(buyer, (m) => m.Trace) },
  { path: 'reconciliations', ...lazyPage(shared, (m) => m.ReconList) },
  { path: 'reconciliations/:id', ...lazyPage(shared, (m) => m.ReconDetailPage) },
  { path: 'invoice-requests', ...lazyPage(buyer, (m) => m.InvoiceRequestList) },
  { path: 'invoice-requests/:id', ...lazyPage(buyer, (m) => m.InvoiceRequestDetailPage) },
  { path: 'invoices', ...lazyPage(buyer, (m) => m.Invoices) },
  { path: 'red-letters', ...lazyPage(shared, (m) => m.RedLettersPage) },
  { path: 'suppliers', ...lazyPage(buyer, (m) => m.SupplierList) },
  { path: 'suppliers/:code', ...lazyPage(buyer, (m) => m.SupplierDetailPage) },
  { path: 'admissions', ...lazyPage(buyer, (m) => m.AdmissionList) },
  { path: 'admissions/new', ...lazyPage(buyer, (m) => m.AdmissionCreatePage) },
  { path: 'admissions/:id', ...lazyPage(buyer, (m) => m.AdmissionDetailPage) },
  { path: 'performance', ...lazyPage(() => import('../buyer/Performance'), (m) => m.Performance) },
  { path: 'audit-logs', ...lazyPage(buyer, (m) => m.AuditLogs) },
  { path: 'prototype-settings', ...lazyPage(buyer, (m) => m.PrototypeSettings) },
  { path: '*', element: <NotFound /> },
]

const portalRoutes: RouteObject[] = [
  { index: true, ...lazyPage(portal, (m) => m.PortalHome) },
  { path: 'orders', ...lazyPage(portal, (m) => m.PortalOrders) },
  { path: 'orders/:id', ...lazyPage(portal, (m) => m.PortalOrderDetailPage) },
  { path: 'shipments', ...lazyPage(shared, (m) => m.ShipmentList) },
  { path: 'shipments/new', ...lazyPage(shared, (m) => m.ShipmentWizardPage) },
  { path: 'shipments/:id', ...lazyPage(shared, (m) => m.ShipmentDetailPage) },
  { path: 'shipments/:id/labels', ...lazyPage(shared, (m) => m.LabelsPage) },
  { path: 'appointments', ...lazyPage(portal, (m) => m.PortalAppointments) },
  { path: 'receipts', ...lazyPage(shared, (m) => m.ReceiptsPage) },
  { path: 'reconciliations', ...lazyPage(shared, (m) => m.ReconList) },
  { path: 'reconciliations/:id', ...lazyPage(shared, (m) => m.ReconDetailPage) },
  { path: 'invoicing', ...lazyPage(portal, (m) => m.Invoicing) },
  { path: 'red-letters', ...lazyPage(shared, (m) => m.RedLettersPage) },
  { path: 'account', ...lazyPage(portal, (m) => m.Account) },
  { path: '*', element: <NotFound /> },
]

export const router = createHashRouter([
  {
    errorElement: <RouteError />,
    hydrateFallbackElement: <BootLoading />,
    children: [
      { path: '/', element: <EntryPage /> },
      { path: '/buyer', element: <BuyerLayout />, children: [{ errorElement: <RouteError />, children: buyerRoutes }] },
      { path: '/portal', element: <PortalLayout />, children: [{ errorElement: <RouteError />, children: portalRoutes }] },
      { path: '*', element: <StandaloneNotFound /> },
    ],
  },
])
