import { Badge, Card, Group, Tabs, Text } from '@mantine/core'
import { DataTable } from 'mantine-datatable'
import { useState } from 'react'
import { useAction, useApi } from '../api/hooks'
import { ActionButton } from '../components/ActionButton'
import { numCell } from '../components/columns'
import { DocNo, Note } from '../components/marks'
import { ReasonModal } from '../components/modals'
import { PageHeader } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { useUrlValue } from '../components/urlState'
import { fmtDateTime, fmtMoney } from '../domain/format'
import type { ActionState, ChangeView, OrderView } from '../domain/views'
import { ChangeItemsText } from '../shared/orderParts'
import { useConfig } from '../stores/config'

function ApproveButtons({ approve, reject, base, title }: { approve: ActionState; reject: ActionState; base: string; title: string }) {
  const run = useAction()
  const [opened, setOpened] = useState(false)
  return (
    <Group gap={6} wrap="nowrap" justify="flex-end">
      <ActionButton state={approve} size="compact-sm" onClick={() => run(`${base}/approve`, {}, { success: '审核通过' })}>
        通过
      </ActionButton>
      <ActionButton state={reject} size="compact-sm" variant="light" color="red" onClick={() => setOpened(true)}>
        驳回
      </ActionButton>
      <ReasonModal
        opened={opened}
        onClose={() => setOpened(false)}
        title={title}
        label="驳回意见"
        color="red"
        confirmLabel="驳回"
        onSubmit={({ reason }) => run(`${base}/reject`, { comment: reason }, { success: '已驳回' })}
      />
    </Group>
  )
}

/** B07 审核中心：单级审核，不禁止本人审核（《4》§四、「41」）。 */
export function Approvals() {
  const [tab, setTab] = useUrlValue('tab', 'orders')
  const orders = useApi<OrderView[]>('/orders')
  const changes = useApi<ChangeView[]>('/changes')
  const needApproval = useConfig((s) => s.config.changeNeedsApproval)
  const pendingOrders = (orders.data ?? []).filter((o) => o.auditStatus === 'pending')
  const pendingChanges = (changes.data ?? []).filter((c) => c.status === 'pending')
  return (
    <>
      <PageHeader title="审核中心" subtitle="采购订单和订单变更都是单级审核，不禁止本人审核（《4》§四）。审核通过即按「02」的时点推送ERP、下发供应商。" />
      <Card p={0}>
        <Tabs value={tab} onChange={(value) => setTab(value ?? 'orders')}>
          <Tabs.List px="md" pt="xs">
            <Tabs.Tab value="orders" rightSection={pendingOrders.length ? <Badge size="xs" color="orange">{pendingOrders.length}</Badge> : undefined}>
              采购订单
            </Tabs.Tab>
            <Tabs.Tab value="changes" rightSection={pendingChanges.length ? <Badge size="xs" color="orange">{pendingChanges.length}</Badge> : undefined}>
              订单变更
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="orders" p="md">
            <QueryState query={orders}>
              {() => (
                <DataTable
                  records={pendingOrders}
                  idAccessor="id"
                  withTableBorder
                  borderRadius="md"
                  minHeight={pendingOrders.length ? undefined : 180}
                  noRecordsText="没有待审核的采购订单"
                  columns={[
                    { accessor: 'no', title: '采购订单号', render: (o) => <DocNo no={o.no} to={`/buyer/orders/${o.id}`} /> },
                    { accessor: 'supplierName', title: '供应商' },
                    { accessor: 'warehouseName', title: '收货仓' },
                    { accessor: 'promisedDate', title: '承诺交期', render: (o) => <Text fz="sm" className="qs-num">{o.promisedDate}</Text> },
                    { accessor: 'lines', title: '行数', textAlign: 'right', render: (o) => numCell(String(o.lines.length)) },
                    { accessor: 'amount', title: '价税合计', textAlign: 'right', render: (o) => numCell(fmtMoney(o.totals.amount), true) },
                    { accessor: 'submittedAt', title: '提交', render: (o) => <Text fz="xs">{o.submittedBy} · {fmtDateTime(o.submittedAt)}</Text> },
                    {
                      accessor: 'actions',
                      title: '',
                      textAlign: 'right',
                      render: (o) => <ApproveButtons approve={o.actions.approve} reject={o.actions.reject} base={`/orders/${o.id}`} title={`驳回 ${o.no}`} />,
                    },
                  ]}
                />
              )}
            </QueryState>
          </Tabs.Panel>
          <Tabs.Panel value="changes" p="md">
            <QueryState query={changes}>
              {() => (
                <DataTable
                  records={pendingChanges}
                  idAccessor="id"
                  withTableBorder
                  borderRadius="md"
                  minHeight={pendingChanges.length ? undefined : 180}
                  noRecordsText={needApproval ? '没有待审核的订单变更' : '当前演示为变更提交即推送，不进审核'}
                  columns={[
                    { accessor: 'no', title: '变更单号', render: (c) => <DocNo no={c.no} to={`/buyer/changes/${c.id}`} /> },
                    { accessor: 'orderNo', title: '采购订单', render: (c) => <DocNo no={c.orderNo} to={`/buyer/orders/${c.orderId}`} /> },
                    { accessor: 'supplierName', title: '供应商' },
                    { accessor: 'items', title: '变更内容', render: (c) => <ChangeItemsText change={c} /> },
                    { accessor: 'reason', title: '原因', render: (c) => <Text fz="sm">{c.reason}</Text> },
                    { accessor: 'source', title: '来源', render: (c) => <Text fz="sm">{c.source === 'suggestion' ? '交期建议' : '采购发起'}</Text> },
                    { accessor: 'createdAt', title: '发起', render: (c) => <Text fz="xs">{c.createdBy} · {fmtDateTime(c.createdAt)}</Text> },
                    {
                      accessor: 'actions',
                      title: '',
                      textAlign: 'right',
                      render: (c) => <ApproveButtons approve={c.actions.approve} reject={c.actions.reject} base={`/changes/${c.id}`} title={`驳回 ${c.no}`} />,
                    },
                  ]}
                />
              )}
            </QueryState>
            <Note>变更提交后要不要审核、由谁审核未定「41」。原型默认要审核，和采购订单一样单级。</Note>
          </Tabs.Panel>
        </Tabs>
      </Card>
    </>
  )
}
