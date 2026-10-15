import { Button, Card, Chip, Group, MultiSelect, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { IconAlertTriangle, IconClockExclamation, IconCloudX, IconMessage2Question, IconPlus, IconSearch, IconUserShare } from '@tabler/icons-react'
import { DataTable } from 'mantine-datatable'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useApi } from '../api/hooks'
import { numCell } from '../components/columns'
import { DocNo, Note } from '../components/marks'
import { PageHeader } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { StatusBadge } from '../components/StatusBadge'
import { matchText, useUrlList, useUrlValue } from '../components/urlState'
import { fmtDateTime, fmtMoney } from '../domain/format'
import { statusOptions } from '../domain/labels'
import { can } from '../domain/permissions'
import type { OrderView } from '../domain/views'
import { useSession } from '../stores/session'

const flagOptions = [
  { value: 'pushFailed', label: '推送失败' },
  { value: 'overdue24h', label: '超24小时未确认' },
  { value: 'suggestions', label: '交期建议待处理' },
  { value: 'pendingEffect', label: '变更待生效' },
  { value: 'proxy', label: '有代录' },
  { value: 'alerts', label: '交付预警' },
]

function hasFlag(order: OrderView, flag: string) {
  switch (flag) {
    case 'pushFailed':
      return order.pushStatus === 'failed' || order.pendingEffect?.status === 'failed'
    case 'overdue24h':
      return order.overdue24h
    case 'suggestions':
      return order.pendingSuggestions > 0
    case 'pendingEffect':
      return !!order.pendingEffect
    case 'proxy':
      return order.proxy
    case 'alerts':
      return order.alerts.length > 0
    default:
      return true
  }
}

function OrderFlags({ order }: { order: OrderView }) {
  const icons = [
    hasFlag(order, 'pushFailed') && { key: 'push', label: '推送ERP失败', icon: <IconCloudX size={16} color="var(--mantine-color-red-7)" /> },
    order.overdue24h && { key: '24h', label: '下发超过24小时未确认', icon: <IconClockExclamation size={16} color="var(--mantine-color-red-7)" /> },
    order.pendingSuggestions > 0 && { key: 'sg', label: `${order.pendingSuggestions}条交期建议待处理`, icon: <IconMessage2Question size={16} color="var(--mantine-color-violet-6)" /> },
    order.proxy && { key: 'proxy', label: '有代录记录（供应商门户未开通）', icon: <IconUserShare size={16} color="var(--mantine-color-cyan-7)" /> },
    order.alerts.length > 0 && { key: 'alert', label: '交付预警', icon: <IconAlertTriangle size={16} color="var(--mantine-color-orange-6)" /> },
  ].filter(Boolean) as { key: string; label: string; icon: ReactNode }[]
  if (!icons.length) return <Text fz="xs">-</Text>
  return (
    <Group gap={4} wrap="nowrap">
      {icons.map((item) => (
        <Tooltip key={item.key} label={item.label}>
          <span style={{ display: 'inline-flex' }}>{item.icon}</span>
        </Tooltip>
      ))}
    </Group>
  )
}

/** B02 采购订单列表：多维状态分开显示，筛选可多选（《4》§一）。 */
export function OrderList() {
  const role = useSession((s) => s.identity?.role)
  const navigate = useNavigate()
  const query = useApi<OrderView[]>('/orders')
  const [q, setQ] = useUrlValue('q')
  const [audit, setAudit] = useUrlList('audit')
  const [push, setPush] = useUrlList('push')
  const [confirm, setConfirm] = useUrlList('confirm')
  const [biz, setBiz] = useUrlList('biz')
  const [receipt, setReceipt] = useUrlList('receipt')
  const [flags, setFlags] = useUrlList('flag')

  const filters = [
    { label: '审核', kind: 'audit' as const, value: audit, set: setAudit },
    { label: '推送ERP', kind: 'push' as const, value: push, set: setPush },
    { label: '供应商确认', kind: 'confirm' as const, value: confirm, set: setConfirm },
    { label: '业务', kind: 'biz' as const, value: biz, set: setBiz },
    { label: '入库', kind: 'receipt' as const, value: receipt, set: setReceipt },
  ]

  return (
    <>
      <PageHeader
        title="采购订单"
        subtitle="在SRM创建、审核，一张对一张推送ERP；ERP里的采购订单只读（《4》§一）。"
        actions={
          can(role, 'order.write') && (
            <Button leftSection={<IconPlus size={16} />} component={Link} to="/buyer/orders/new">
              新建采购订单
            </Button>
          )
        }
      />
      <Card p="sm" mb="md">
        <Stack gap="sm">
          <Group gap="sm" align="flex-end" wrap="wrap">
            <TextInput
              label="搜索"
              leftSection={<IconSearch size={14} />}
              placeholder="单号、ERP单号、供应商、SKU"
              value={q}
              onChange={(event) => setQ(event.currentTarget.value)}
              w={240}
            />
            {filters.map((filter) => (
              <MultiSelect
                key={filter.kind}
                label={filter.label}
                placeholder="全部"
                data={statusOptions(filter.kind)}
                value={filter.value}
                onChange={filter.set}
                clearable
                w={170}
              />
            ))}
          </Group>
          <Chip.Group multiple value={flags} onChange={setFlags}>
            <Group gap={6}>
              {flagOptions.map((flag) => (
                <Chip key={flag.value} value={flag.value} size="xs" variant="outline">
                  {flag.label}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </Stack>
      </Card>
      <QueryState query={query}>
        {(orders) => {
          const rows = orders.filter(
            (o) =>
              matchText(q, o.no, o.erp?.no, o.supplierName, o.supplierCode, ...o.lines.flatMap((l) => [l.skuCode, l.skuName])) &&
              (!audit.length || audit.includes(o.auditStatus)) &&
              (!push.length || push.includes(o.pushStatus)) &&
              (!confirm.length || confirm.includes(o.confirmStatus)) &&
              (!biz.length || biz.includes(o.bizStatus)) &&
              (!receipt.length || receipt.includes(o.receiptStatus)) &&
              flags.every((flag) => hasFlag(o, flag)),
          )
          return (
            <Stack gap="xs">
              <Text fz="xs" c="dimmed">
                共{rows.length}张{rows.length !== orders.length ? `（全部${orders.length}张）` : ''}
              </Text>
              <DataTable
                records={rows}
                idAccessor="id"
                withTableBorder
                borderRadius="lg"
                highlightOnHover
                minHeight={rows.length ? undefined : 200}
                noRecordsText="没有符合条件的采购订单"
                onRowClick={({ record }) => navigate(`/buyer/orders/${record.id}`)}
                rowClassName={(o) => (o.overdue24h || o.pushStatus === 'failed' ? 'qs-row-warn' : '')}
                columns={[
                  {
                    accessor: 'no',
                    title: '采购订单号',
                    render: (o) => (
                      <Stack gap={0}>
                        <DocNo no={o.no} to={`/buyer/orders/${o.id}`} />
                        <Text fz={11} c="dimmed" className="qs-mono">
                          {o.erp ? `ERP ${o.erp.no}` : 'ERP -'}
                        </Text>
                      </Stack>
                    ),
                  },
                  {
                    accessor: 'supplierName',
                    title: '供应商',
                    render: (o) => (
                      <Stack gap={0}>
                        <Text fz="sm">{o.supplierName}</Text>
                        <Text fz={11} c="dimmed">
                          {o.supplier.portalStatus === '未开通' ? '门户未开通 · 采购代录' : o.supplier.tier}
                        </Text>
                      </Stack>
                    ),
                  },
                  { accessor: 'warehouseName', title: '收货仓' },
                  {
                    accessor: 'promisedDate',
                    title: '承诺交期',
                    render: (o) => (
                      <Stack gap={0}>
                        <Text fz="sm" className="qs-num">
                          {o.promisedDate}
                        </Text>
                        {o.pendingEffect?.promisedDate && (
                          <Text fz={11} c="violet.7" className="qs-num">
                            待生效 {o.pendingEffect.promisedDate}
                          </Text>
                        )}
                      </Stack>
                    ),
                  },
                  { accessor: 'totals.amount', title: '价税合计', textAlign: 'right', render: (o) => numCell(fmtMoney(o.totals.amount)) },
                  {
                    accessor: 'status',
                    title: '审核 / 推送 / 确认 / 业务 / 入库',
                    render: (o) => (
                      <Group gap={4} wrap="nowrap">
                        <StatusBadge kind="audit" value={o.auditStatus} size="xs" />
                        <StatusBadge kind="push" value={o.pushStatus} size="xs" />
                        <StatusBadge kind="confirm" value={o.confirmStatus} size="xs" />
                        <StatusBadge kind="biz" value={o.bizStatus} size="xs" />
                        <StatusBadge kind="receipt" value={o.receiptStatus} size="xs" />
                      </Group>
                    ),
                  },
                  { accessor: 'flags', title: '标记', render: (o) => <OrderFlags order={o} /> },
                  { accessor: 'updatedAt', title: '更新', render: (o) => <Text fz="xs" c="dimmed" className="qs-num">{fmtDateTime(o.updatedAt)}</Text> },
                ]}
              />
              <Note>历史未结采购订单怎样进入SRM见「36」。单号「待定-」是占位，ERP采购订单号规则见「05」。</Note>
            </Stack>
          )
        }}
      </QueryState>
    </>
  )
}
