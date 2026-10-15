import { Alert, Anchor, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Link, useNavigate } from 'react-router'
import { useApi } from '../api/hooks'
import { numCell } from '../components/columns'
import { Countdown } from '../components/Countdown'
import { DocNo, Note, PendingTag } from '../components/marks'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { ResponsiveList } from '../components/ResponsiveList'
import { StatCard } from '../components/StatCard'
import { fmtDateTime, fmtMoney, fmtQty } from '../domain/format'
import type { OrderView, PortalDashboard } from '../domain/views'
import { useSession } from '../stores/session'

const hints: Record<string, string> = {
  confirm: '下发后24小时内确认交期',
  ship: '还有本次可发数量',
  appoint: '已提交、还没预约送货',
  returned: '仓库退回，请改约',
  returns: 'ERP发起的采购退货',
  recon: '核对后确认，或提出差异',
  invoice: '待开票，或红冲后待重开',
  red: '购买方发起，72小时内确认',
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

/** P01 门户首页：本公司的待办和待确认订单（《4》§三、§四）。 */
export function PortalHome() {
  const userName = useSession((s) => s.identity?.userName)
  const navigate = useNavigate()
  const query = useApi<PortalDashboard>('/portal/dashboard')
  return (
    <QueryState query={query}>
      {(data) => {
        const pending = [...data.pendingOrders].sort((a, b) => (a.confirmDeadline ?? 0) - (b.confirmDeadline ?? 0))
        const overdue = pending.filter((o) => o.overdue24h).length
        return (
          <>
            <PageHeader title={data.supplier.name} subtitle={`${userName ?? ''} · 只显示本公司的订单、发货、对账和税票（《4》§四）。`} />
            <Stack gap="md">
              {overdue > 0 && (
                <Alert color="red" icon={<IconAlertTriangle size={18} />} title={`${overdue}张订单下发已超过24小时，仍未确认`}>
                  <Text fz="sm">
                    超时不会自动视为接受 <PendingTag n={19} />，请尽快确认或拒绝。只提交了交期建议算不算按时响应见 <PendingTag n={45} />。
                  </Text>
                </Alert>
              )}
              <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }} spacing="sm">
                {data.cards.map((card) => (
                  <StatCard key={card.key} card={card} hint={hints[card.key]} />
                ))}
              </SimpleGrid>
              <Card>
                <SectionTitle
                  extra={
                    <Anchor component={Link} to="/portal/orders" fz="sm">
                      全部订单
                    </Anchor>
                  }
                >
                  待确认订单
                </SectionTitle>
                <ResponsiveList
                  records={pending}
                  rowKey={(o) => o.id}
                  onOpen={(o) => navigate(`/portal/orders/${o.id}`)}
                  noRecordsText="没有待确认的订单"
                  rowClassName={(o) => (o.overdue24h ? 'qs-row-warn' : undefined)}
                  columns={[
                    { accessor: 'no', title: '采购订单', render: (o) => <DocNo no={o.no} to={`/portal/orders/${o.id}`} /> },
                    { accessor: 'warehouseName', title: '收货仓' },
                    { accessor: 'promisedDate', title: '承诺交期', render: (o) => <PromisedDate order={o} /> },
                    {
                      accessor: 'lines',
                      title: '行数 / 数量',
                      textAlign: 'right',
                      render: (o) => numCell(`${o.lines.length}行 / ${fmtQty(o.totals.qty)}`),
                    },
                    { accessor: 'totals.amount', title: '价税合计', textAlign: 'right', render: (o) => numCell(fmtMoney(o.totals.amount), true) },
                    { accessor: 'sentAt', title: '下发', render: (o) => <Text fz="xs" c="dimmed" className="qs-num">{fmtDateTime(o.sentAt)}</Text> },
                    { accessor: 'confirmDeadline', title: '确认时限', render: (o) => <Countdown deadline={o.confirmDeadline} /> },
                  ]}
                  card={(o) => (
                    <Stack gap={6}>
                      <Group justify="space-between" wrap="nowrap" gap="xs">
                        <DocNo no={o.no} />
                        <Countdown deadline={o.confirmDeadline} />
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
                    </Stack>
                  )}
                />
                <Stack mt="sm">
                  <Note>按订单接单：数量、单价、交期以订单为准，不提供带条件接受「19」。对数量或价格有异议请拒绝并写明原因；对交期有异议可以先提交交期建议。</Note>
                </Stack>
              </Card>
            </Stack>
          </>
        )
      }}
    </QueryState>
  )
}
