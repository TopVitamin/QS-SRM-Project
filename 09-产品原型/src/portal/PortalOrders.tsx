import { Badge, Group, ScrollArea, Stack, Tabs, Text, TextInput, Tooltip } from '@mantine/core'
import { IconCalendarEvent, IconClockExclamation, IconMessage2Question, IconSearch } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useApi } from '../api/hooks'
import { numCell } from '../components/columns'
import { Countdown } from '../components/Countdown'
import { DocNo, Note } from '../components/marks'
import { PageHeader } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { ResponsiveList } from '../components/ResponsiveList'
import { StatusBadge } from '../components/StatusBadge'
import { matchText, useUrlValue } from '../components/urlState'
import { EMPTY, fmtDateTime, fmtMoney, fmtQty } from '../domain/format'
import type { OrderView } from '../domain/views'

const tabs: { value: string; label: string; match: (o: OrderView) => boolean }[] = [
  { value: 'pending', label: '待确认', match: (o) => o.confirmStatus === 'pending' && o.bizStatus === 'open' },
  { value: 'ship', label: '可发货', match: (o) => o.actions.ship.ok },
  { value: 'open', label: '执行中', match: (o) => o.confirmStatus === 'confirmed' && o.bizStatus === 'open' },
  { value: 'done', label: '已拒绝或结束', match: (o) => o.confirmStatus === 'rejected' || o.bizStatus !== 'open' },
  { value: 'all', label: '全部', match: () => true },
]

function OrderMarks({ order, empty = true }: { order: OrderView; empty?: boolean }) {
  const marks = [
    order.overdue24h && { key: '24h', label: '下发超过24小时仍未确认', icon: <IconClockExclamation size={16} color="var(--mantine-color-red-7)" /> },
    order.pendingSuggestions > 0 && {
      key: 'sg',
      label: `${order.pendingSuggestions}条交期建议等采购处理`,
      icon: <IconMessage2Question size={16} color="var(--mantine-color-violet-6)" />,
    },
    order.pendingEffect && { key: 'effect', label: '订单变更SRM已接受、ERP尚未更新', icon: <IconCalendarEvent size={16} color="var(--mantine-color-violet-6)" /> },
  ].filter(Boolean) as { key: string; label: string; icon: ReactNode }[]
  if (!marks.length) return empty ? <Text fz="xs">{EMPTY}</Text> : null
  return (
    <Group gap={4} wrap="nowrap">
      {marks.map((mark) => (
        <Tooltip key={mark.key} label={mark.label} events={{ hover: true, focus: true, touch: true }}>
          <span style={{ display: 'inline-flex' }}>{mark.icon}</span>
        </Tooltip>
      ))}
    </Group>
  )
}

function PromisedDate({ order }: { order: OrderView }) {
  return (
    <Stack gap={0}>
      <Text fz="sm" className="qs-num">
        {order.promisedDate}
      </Text>
      {order.pendingEffect?.promisedDate && (
        <Text fz={11} c="violet.7" className="qs-num">
          待生效 {order.pendingEffect.promisedDate}
        </Text>
      )}
    </Stack>
  )
}

function ConfirmCell({ order }: { order: OrderView }) {
  return (
    <Stack gap={2}>
      <StatusBadge kind="confirm" value={order.confirmStatus} size="xs" />
      {order.confirmStatus === 'pending' && order.bizStatus === 'open' && <Countdown deadline={order.confirmDeadline} variant="text" />}
    </Stack>
  )
}

/** P02 门户采购订单：只列下发给本公司的订单，手机上是卡片（《4》§四）。 */
export function PortalOrders() {
  const navigate = useNavigate()
  const query = useApi<OrderView[]>('/orders')
  const [tab, setTab] = useUrlValue('tab', 'all')
  const [q, setQ] = useUrlValue('q')
  const current = tabs.find((t) => t.value === tab) ?? tabs[tabs.length - 1]

  return (
    <>
      <PageHeader title="采购订单" subtitle="数量和单价以订单为准，门户里不能修改；有异议只能拒绝并写明原因，交期有异议可以提交交期建议。" />
      <QueryState query={query}>
        {(orders) => {
          const searched = orders.filter((o) => matchText(q, o.no, ...o.lines.flatMap((l) => [l.skuCode, l.skuName])))
          const rows = searched.filter(current.match)
          return (
            <Stack gap="sm">
              <Group gap="sm" align="flex-end" wrap="wrap" justify="space-between">
                <ScrollArea type="never" style={{ flex: '1 1 360px', minWidth: 0 }}>
                  <Tabs value={current.value} onChange={(value) => setTab(value ?? 'all')}>
                    <Tabs.List style={{ flexWrap: 'nowrap' }}>
                      {tabs.map((t) => {
                        const count = searched.filter(t.match).length
                        return (
                          <Tabs.Tab
                            key={t.value}
                            value={t.value}
                            style={{ whiteSpace: 'nowrap' }}
                            rightSection={
                              t.value !== 'all' && count > 0 ? (
                                <Badge size="xs" variant="light" color={t.value === 'pending' ? 'orange' : 'gray'} circle={count < 10}>
                                  {count}
                                </Badge>
                              ) : undefined
                            }
                          >
                            {t.label}
                          </Tabs.Tab>
                        )
                      })}
                    </Tabs.List>
                  </Tabs>
                </ScrollArea>
                <TextInput
                  aria-label="搜索订单"
                  leftSection={<IconSearch size={14} />}
                  placeholder="订单号、SKU"
                  value={q}
                  onChange={(event) => setQ(event.currentTarget.value)}
                  w={{ base: '100%', xs: 220 }}
                />
              </Group>
              <ResponsiveList
                records={rows}
                rowKey={(o) => o.id}
                onOpen={(o) => navigate(`/portal/orders/${o.id}`)}
                noRecordsText={q ? '没有符合条件的订单' : `没有${current.value === 'all' ? '' : current.label}的订单`}
                rowClassName={(o) => (o.overdue24h ? 'qs-row-warn' : o.bizStatus !== 'open' ? 'qs-row-muted' : undefined)}
                columns={[
                  { accessor: 'no', title: '采购订单', render: (o) => <DocNo no={o.no} to={`/portal/orders/${o.id}`} /> },
                  { accessor: 'warehouseName', title: '收货仓' },
                  { accessor: 'promisedDate', title: '承诺交期', render: (o) => <PromisedDate order={o} /> },
                  { accessor: 'lines', title: '行数 / 数量', textAlign: 'right', render: (o) => numCell(`${o.lines.length}行 / ${fmtQty(o.totals.qty)}`) },
                  { accessor: 'totals.amount', title: '价税合计', textAlign: 'right', render: (o) => numCell(fmtMoney(o.totals.amount), true) },
                  { accessor: 'confirmStatus', title: '确认', render: (o) => <ConfirmCell order={o} /> },
                  {
                    accessor: 'bizStatus',
                    title: '业务 / 入库',
                    render: (o) => (
                      <Group gap={4} wrap="nowrap">
                        <StatusBadge kind="biz" value={o.bizStatus} size="xs" />
                        <StatusBadge kind="receipt" value={o.receiptStatus} size="xs" />
                      </Group>
                    ),
                  },
                  { accessor: 'marks', title: '标记', render: (o) => <OrderMarks order={o} /> },
                  { accessor: 'sentAt', title: '下发', render: (o) => <Text fz="xs" c="dimmed" className="qs-num">{fmtDateTime(o.sentAt)}</Text> },
                ]}
                card={(o) => (
                  <Stack gap={6}>
                    <Group justify="space-between" wrap="nowrap" gap="xs">
                      <DocNo no={o.no} />
                      <StatusBadge kind="confirm" value={o.confirmStatus} size="xs" />
                    </Group>
                    <Text fz="sm">
                      {o.warehouseName} · 交期 <span className="qs-num">{o.promisedDate}</span>
                      {o.pendingEffect?.promisedDate && (
                        <Text span fz="xs" c="violet.7" className="qs-num">
                          {' '}
                          待生效 {o.pendingEffect.promisedDate}
                        </Text>
                      )}
                    </Text>
                    <Text fz="xs" c="dimmed">
                      {o.lines.length}行 · 数量 <span className="qs-num">{fmtQty(o.totals.qty)}</span> · 价税合计{' '}
                      <b className="qs-num">{fmtMoney(o.totals.amount)}</b>
                    </Text>
                    <Group justify="space-between" wrap="nowrap" gap="xs">
                      <Group gap={4} wrap="nowrap">
                        <StatusBadge kind="biz" value={o.bizStatus} size="xs" />
                        <StatusBadge kind="receipt" value={o.receiptStatus} size="xs" />
                        <OrderMarks order={o} empty={false} />
                      </Group>
                      {o.confirmStatus === 'pending' && o.bizStatus === 'open' && <Countdown deadline={o.confirmDeadline} variant="text" />}
                    </Group>
                  </Stack>
                )}
              />
              <Note>只列下发给本公司的订单；审核和推送ERP是企业侧的过程，门户不显示。单号「待定-」是占位，规则见「05」。</Note>
            </Stack>
          )
        }}
      </QueryState>
    </>
  )
}
