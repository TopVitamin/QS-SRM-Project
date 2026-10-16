import { Badge, Group, SegmentedControl, Stack, Switch, Tabs, Text } from '@mantine/core'
import { useNavigate } from 'react-router'
import { useApi } from '../api/hooks'
import { DocNo, Note } from '../components/marks'
import { PageHeader } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { ResponsiveList } from '../components/ResponsiveList'
import { StatusBadge } from '../components/StatusBadge'
import { useUrlValue } from '../components/urlState'
import { alertKinds } from '../domain/alerts'
import type { AlertKind, AlertView, KittingView } from '../domain/views'
import { KittingReviewAction, KittingTable } from '../shared/orderParts'
import { useConfig } from '../stores/config'

function DaysLeft({ days }: { days: number }) {
  return (
    <Text fz="sm" className="qs-num" c={days < 0 ? 'red.7' : days <= 3 ? 'orange.8' : undefined} fw={days < 0 ? 650 : undefined}>
      {days < 0 ? `逾期${-days}天` : days === 0 ? '今天到期' : `剩${days}天`}
    </Text>
  )
}

function AlertList({ alerts }: { alerts: AlertView[] }) {
  const navigate = useNavigate()
  const [kind, setKind] = useUrlValue('kind')
  const rows = alerts.filter((a) => !kind || a.kind === kind)
  const count = (k: AlertKind) => alerts.filter((a) => a.kind === k).length
  return (
    <Stack gap="sm">
      <SegmentedControl
        w="fit-content"
        value={kind || 'all'}
        onChange={(value) => setKind(value === 'all' ? '' : value)}
        data={[
          { value: 'all', label: `全部 ${alerts.length}` },
          ...(Object.keys(alertKinds) as AlertKind[]).map((k) => ({ value: k, label: `${alertKinds[k].label} ${count(k)}` })),
        ]}
      />
      <ResponsiveList
        records={rows}
        rowKey={(a) => `${a.orderId}-${a.kind}`}
        onOpen={(a) => navigate(`/buyer/orders/${a.orderId}`)}
        noRecordsText="没有预警"
        rowClassName={(a) => (a.kind === 'nearDue' ? undefined : 'qs-row-warn')}
        columns={[
          {
            accessor: 'kind',
            title: '预警',
            render: (a) => (
              <Badge size="sm" variant="light" color={alertKinds[a.kind].color}>
                {alertKinds[a.kind].label}
              </Badge>
            ),
          },
          { accessor: 'orderNo', title: 'SRM采购订单', render: (a) => <DocNo no={a.orderNo} to={`/buyer/orders/${a.orderId}`} /> },
          { accessor: 'supplierName', title: '供应商' },
          { accessor: 'promisedDate', title: '承诺交期', render: (a) => <Text fz="sm" className="qs-num">{a.promisedDate}</Text> },
          { accessor: 'daysLeft', title: '距交期', render: (a) => <DaysLeft days={a.daysLeft} /> },
          {
            accessor: 'confirmStatus',
            title: '确认 / 入库',
            render: (a) => (
              <Group gap={4} wrap="nowrap">
                <StatusBadge kind="confirm" value={a.confirmStatus} size="xs" />
                <StatusBadge kind="receipt" value={a.receiptStatus} size="xs" />
              </Group>
            ),
          },
          { accessor: 'kittingSummary', title: '齐套', render: (a) => <Text fz="xs">{a.kittingSummary}</Text> },
          { accessor: 'message', title: '说明', render: (a) => <Text fz="xs" c="dimmed">{a.message}</Text> },
        ]}
        card={(a) => (
          <Stack gap={4}>
            <Group justify="space-between" wrap="nowrap">
              <Badge size="sm" variant="light" color={alertKinds[a.kind].color}>
                {alertKinds[a.kind].label}
              </Badge>
              <DaysLeft days={a.daysLeft} />
            </Group>
            <DocNo no={a.orderNo} />
            <Text fz="sm">{a.supplierName}</Text>
            <Text fz="xs" c="dimmed">
              {a.kittingSummary}
            </Text>
          </Stack>
        )}
      />
    </Stack>
  )
}

function KittingPanel({ rows }: { rows: KittingView[] }) {
  const [open, setOpen] = useUrlValue('open')
  const list = open === '1' ? rows.filter((r) => r.status === '缺料' && !r.review) : rows
  return (
    <Stack gap="sm">
      <Switch label="只看缺料、未复核" checked={open === '1'} onChange={(event) => setOpen(event.currentTarget.checked ? '1' : '')} />
      <KittingTable rows={list} showOrder orderBase="/buyer/orders" actions={(row) => <KittingReviewAction row={row} />} />
      <Note>齐套节点名称由供应商自由填写，清单未定；品质复核记在门户里「20」。</Note>
    </Stack>
  )
}

/** B17 交付预警：距承诺交期N天且未齐套、已逾期、超24小时未确认。只提醒，不提供改单、关单（《3》§3.2）。 */
export function Alerts() {
  const alertDays = useConfig((s) => s.config.alertDays)
  const [tab, setTab] = useUrlValue('tab', 'alerts')
  const alerts = useApi<AlertView[]>('/alerts')
  const kitting = useApi<KittingView[]>(tab === 'kitting' ? '/kitting' : null)
  return (
    <>
      <PageHeader
        title="交付预警"
        subtitle={`距承诺交期${alertDays}天内且齐套未完成、已逾期、下发超24小时未确认的订单。预警只提醒，处理要回到订单上操作。`}
      />
      <Tabs value={tab} onChange={(value) => setTab(value ?? 'alerts')} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="alerts">预警</Tabs.Tab>
          <Tabs.Tab value="kitting">齐套反馈</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="alerts">
          <Stack gap="sm">
            <QueryState query={alerts}>{(rows) => <AlertList alerts={rows} />}</QueryState>
            <Note>提前天数分阶段：阶段4为10天、阶段5为7天（《4》§三），原型配置里切换。消息推送未做。</Note>
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="kitting">
          <QueryState query={kitting}>{(rows) => <KittingPanel rows={rows} />}</QueryState>
        </Tabs.Panel>
      </Tabs>
    </>
  )
}
