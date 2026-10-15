import { Alert, Anchor, Badge, Card, Group, Paper, Stack, Tabs, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconAlertTriangle } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { useApi } from '../api/hooks'
import { LinkAction } from '../components/ActionButton'
import { Countdown } from '../components/Countdown'
import { Fields } from '../components/Fields'
import { CodeName, DocNo, ErpReadonly, LockHint, Note, PendingTag } from '../components/marks'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { StatusBadge } from '../components/StatusBadge'
import { HeaderActions, StickyActions } from '../components/StickyActions'
import { useUrlValue } from '../components/urlState'
import { fmtDateTime, fmtMoney, fmtPrice, fmtQty, fmtRate } from '../domain/format'
import { round4 } from '../domain/money'
import type { ErpNotice, OrderLine } from '../domain/types'
import type { KittingView, LineQty, OrderDetail, ReturnView, ShipmentView, SuggestionView } from '../domain/views'
import {
  ConfirmationTimeline,
  KittingTable,
  OrderLinesTable,
  OrderRespondActions,
  PendingEffectAlert,
  SuggestionTable,
} from '../shared/orderParts'
import { NoticeTable, ReceiptCards, ReceiptLegend, ReceiptTable, ReturnTable, ShipmentMiniTable, ShipmentStatusPair } from '../shared/shipmentParts'

function MiniCards<T>({ rows, rowKey, empty, children }: { rows: T[]; rowKey: (row: T) => string; empty: string; children: (row: T) => ReactNode }) {
  if (!rows.length) {
    return (
      <Text fz="sm" c="dimmed" ta="center" py="md">
        {empty}
      </Text>
    )
  }
  return (
    <Stack gap="sm">
      {rows.map((row) => (
        <Paper key={rowKey(row)} p="md" radius="lg" withBorder>
          {children(row)}
        </Paper>
      ))}
    </Stack>
  )
}

function LineCard({ line, qty }: { line: OrderLine; qty?: LineQty }) {
  const netPrice = line.netPrice ?? round4(line.price / (1 + line.taxRate / 100))
  return (
    <Stack gap={4}>
      <Group justify="space-between" wrap="nowrap">
        <Text fz="sm">
          第{line.lineNo}行 <span className="qs-mono">{line.skuCode}</span> {line.skuName}
        </Text>
        <Text fz="xs" c="dimmed">
          {line.unit}
        </Text>
      </Group>
      <Text fz="sm">
        采购数量 <b className="qs-num">{fmtQty(line.qty)}</b>
        <LockHint />
      </Text>
      <Text fz="xs" c="dimmed">
        累计入库 <span className="qs-num">{fmtQty(qty?.received)}</span> · 在途 <span className="qs-num">{fmtQty(qty?.inTransit)}</span> · 可下推{' '}
        <span className="qs-num">{fmtQty(qty?.pushable)}</span>
      </Text>
      <Text fz="sm">
        含税单价 <span className="qs-num">{fmtPrice(line.price)}</span>
        <LockHint /> · {fmtRate(line.taxRate)} · 不含税 <span className="qs-num">{fmtPrice(netPrice)}</span>
      </Text>
      <Text fz="sm">
        价税合计 <b className="qs-num">{fmtMoney(line.amount)}</b> · 税额 <span className="qs-num">{fmtMoney(line.tax)}</span> · 金额{' '}
        <span className="qs-num">{fmtMoney(line.netAmount)}</span>
      </Text>
    </Stack>
  )
}

function SuggestionCard({ row }: { row: SuggestionView }) {
  return (
    <Stack gap={4}>
      <Group justify="space-between" wrap="nowrap">
        <DocNo no={row.no} />
        <StatusBadge kind="suggestion" value={row.status} size="xs" />
      </Group>
      <Text fz="sm" className="qs-num">
        {row.currentDate} → <b>{row.suggestedDate}</b>
      </Text>
      <Text fz="sm">{row.reason}</Text>
      {row.handleNote && (
        <Text fz="xs" c="dimmed">
          处理：{row.handleNote}
        </Text>
      )}
    </Stack>
  )
}

function KittingCard({ row }: { row: KittingView }) {
  return (
    <Stack gap={4}>
      <Group justify="space-between" wrap="nowrap">
        <Text fz="sm">
          第{row.lineNo}行 {row.skuName} · {row.nodeName}
        </Text>
        <Badge color={row.status === '缺料' ? 'red' : 'green'} variant="light" size="sm">
          {row.status}
        </Badge>
      </Group>
      {row.status === '缺料' && (
        <Text fz="sm">
          {row.materialName}，预计 {row.expectedDate} 到料
        </Text>
      )}
      {row.impact && <Text fz="xs">{row.impact}</Text>}
      {row.review ? (
        <Text fz="xs" c="dimmed">
          品质复核 {row.review.by}：{row.review.note}
        </Text>
      ) : (
        row.status === '缺料' && (
          <Text fz="xs" c="dimmed">
            待品质复核
          </Text>
        )
      )}
    </Stack>
  )
}

function ShipmentCard({ shipment }: { shipment: ShipmentView }) {
  return (
    <Stack gap={4}>
      <Group justify="space-between" wrap="nowrap">
        <DocNo no={shipment.no} to={`/portal/shipments/${shipment.id}`} />
        <ShipmentStatusPair shipment={shipment} />
      </Group>
      <Text fz="xs" c="dimmed">
        预计到货 <span className="qs-num">{shipment.expectedDate}</span> · 数量 <span className="qs-num">{fmtQty(shipment.totalQty)}</span> · {shipment.boxCount}箱
      </Text>
      {shipment.appointment && (
        <Group gap={6}>
          <Text fz="xs" className="qs-num">
            预约 {shipment.appointment.date} {shipment.appointment.slot}
          </Text>
          <StatusBadge kind="appointment" value={shipment.appointment.status} size="xs" />
        </Group>
      )}
    </Stack>
  )
}

function NoticeCard({ notice }: { notice: ErpNotice }) {
  return (
    <Stack gap={4}>
      <Group justify="space-between" wrap="nowrap">
        <DocNo no={notice.no} />
        <StatusBadge kind="notice" value={notice.status} size="xs" />
      </Group>
      <Text fz="xs" c="dimmed">
        来源发货单 <span className="qs-mono">{notice.shipmentNo}</span>
      </Text>
      <Text fz="sm">
        通知数量 <b className="qs-num">{fmtQty(notice.lines.reduce((t, l) => t + l.qty, 0))}</b>
      </Text>
    </Stack>
  )
}

function ReturnCard({ item }: { item: ReturnView }) {
  return (
    <Stack gap={4}>
      <Group justify="space-between" wrap="nowrap">
        <DocNo no={item.returnNo} />
        <StatusBadge kind="returnAck" value={item.ack} size="xs" />
      </Group>
      {item.lines.map((l) => (
        <Text key={l.lineNo} fz="sm">
          第{l.lineNo}行 {l.skuName} × <b className="qs-num">{fmtQty(l.qty)}</b>
        </Text>
      ))}
      <Text fz="sm">原因：{item.reason}</Text>
      <Text fz="xs" c="dimmed">
        {item.erpStatus}
        {item.outboundDate ? ` · 出库 ${item.outboundDate}` : ''}
      </Text>
    </Stack>
  )
}

function PortalOrderDetail({ order }: { order: OrderDetail }) {
  const mobile = useMediaQuery('(max-width: 48em)')
  const [tab, setTab] = useUrlValue('tab', 'lines')
  const a = order.actions
  const respondVisible = (['confirm', 'refuse', 'suggest', 'kitting', 'ship'] as const).some((key) => !a[key].hidden)
  const shipTo = `/portal/shipments/new?order=${order.id}`

  return (
    <>
      <PageHeader
        back={{ to: '/portal/orders', label: '采购订单' }}
        title={<span className="qs-mono">{order.no}</span>}
        badges={
          <Group gap={4}>
            <StatusBadge kind="confirm" value={order.confirmStatus} />
            <StatusBadge kind="biz" value={order.bizStatus} />
            <StatusBadge kind="receipt" value={order.receiptStatus} />
          </Group>
        }
        subtitle={`收货仓 ${order.warehouseName} · 承诺交期 ${order.promisedDate} · 价税合计 ${fmtMoney(order.totals.amount)}`}
        actions={
          respondVisible ? (
            <HeaderActions portal>
              <OrderRespondActions order={order} shipTo={shipTo} size="sm" />
            </HeaderActions>
          ) : undefined
        }
      />

      <Stack gap="md">
        {order.confirmStatus === 'pending' && order.bizStatus === 'open' && (
          <Alert color={order.overdue24h ? 'red' : 'orange'} icon={<IconAlertTriangle size={18} />} title={order.overdue24h ? '下发超过24小时仍未确认' : '请确认这张订单'}>
            <Stack gap={6}>
              <Countdown deadline={order.confirmDeadline} />
              <Text fz="sm">
                按订单接单：数量、单价、交期以订单为准，不提供带条件接受 <PendingTag n={19} />。对数量或价格有异议请拒绝并写明原因；对交期有异议可以先提交交期建议。
              </Text>
              {order.overdue24h && (
                <Text fz="sm">
                  超时不会自动视为接受。只提交了交期建议算不算按时响应见 <PendingTag n={45} />。
                </Text>
              )}
            </Stack>
          </Alert>
        )}
        {order.confirmStatus === 'rejected' && (
          <Alert color="red" title="已拒绝接单">
            原因：{order.refuseReason}
          </Alert>
        )}
        <PendingEffectAlert order={order} />
        {order.closeInfo && (
          <Alert color="dark" title={order.closeInfo.kind === 'cancel' ? '订单已取消' : '订单已关闭'}>
            {order.closeInfo.reason} · {fmtDateTime(order.closeInfo.at)}。关闭后不能再发货（《3》§3.1）。
          </Alert>
        )}

        <Card>
          <SectionTitle>订单信息</SectionTitle>
          <Fields
            cols={3}
            items={[
              { label: 'SRM采购订单号', value: <DocNo no={order.no} /> },
              { label: '收货仓', value: <CodeName code={order.warehouseCode} name={order.warehouseName} /> },
              {
                label: '承诺交期',
                value: (
                  <Stack gap={0}>
                    <Text fz="sm" fw={600} className="qs-num">
                      {order.promisedDate}
                    </Text>
                    {order.firstPromisedDate !== order.promisedDate && (
                      <Text fz="xs" c="dimmed">
                        首次承诺 {order.firstPromisedDate}
                      </Text>
                    )}
                  </Stack>
                ),
              },
              { label: '币种', value: order.currency },
              { label: '下发', value: order.sentAt ? fmtDateTime(order.sentAt) : undefined },
              {
                label: '确认',
                value:
                  order.confirmStatus === 'pending' ? (
                    <Countdown deadline={order.confirmDeadline} />
                  ) : order.confirmedAt ? (
                    `${order.confirmBy ?? ''} · ${fmtDateTime(order.confirmedAt)}`
                  ) : undefined,
              },
              { label: '价税合计', value: <b className="qs-num">{fmtMoney(order.totals.amount)}</b> },
              { label: '备注', value: order.remark, span: 2 },
            ]}
          />
        </Card>

        <Card p={0}>
          <Tabs value={tab} onChange={(value) => setTab(value ?? 'lines')} keepMounted={false}>
            <Tabs.List px="md" pt="xs">
              <Tabs.Tab value="lines">明细</Tabs.Tab>
              <Tabs.Tab value="confirm" rightSection={order.pendingSuggestions ? <Badge size="xs" color="violet">{order.pendingSuggestions}</Badge> : undefined}>
                确认与交期
              </Tabs.Tab>
              <Tabs.Tab value="delivery">发货与收货</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="lines" p="md">
              {mobile ? (
                <Stack gap="sm">
                  <MiniCards rows={order.lines} rowKey={(l) => String(l.lineNo)} empty="没有明细行">
                    {(line) => <LineCard line={line} qty={order.lineQty.find((q) => q.lineNo === line.lineNo)} />}
                  </MiniCards>
                  <Text fz="sm" ta="right">
                    合计 数量 <b className="qs-num">{fmtQty(order.totals.qty)}</b> · 价税合计 <b className="qs-num">{fmtMoney(order.totals.amount)}</b>
                  </Text>
                  <Note>可下推 = 采购数量 − 累计入库 − 在途通知。发货不超过可下推，不设容差（《4》§二）。</Note>
                </Stack>
              ) : (
                <OrderLinesTable order={order} supplier />
              )}
            </Tabs.Panel>
            <Tabs.Panel value="confirm" p="md">
              <Stack gap="lg">
                <div>
                  <SectionTitle>下发和确认</SectionTitle>
                  <ConfirmationTimeline records={order.confirmations} />
                </div>
                <div>
                  <SectionTitle>交期建议</SectionTitle>
                  {mobile ? (
                    <MiniCards rows={order.suggestions} rowKey={(r) => r.id} empty="没有交期建议">
                      {(row) => <SuggestionCard row={row} />}
                    </MiniCards>
                  ) : (
                    <SuggestionTable rows={order.suggestions} />
                  )}
                </div>
                <div>
                  <SectionTitle>齐套反馈</SectionTitle>
                  {mobile ? (
                    <MiniCards rows={order.kitting} rowKey={(r) => r.id} empty="还没有齐套反馈">
                      {(row) => <KittingCard row={row} />}
                    </MiniCards>
                  ) : (
                    <KittingTable rows={order.kitting} />
                  )}
                  <Note>节点名称先自由填写，清单和必报项见「20」。缺料会进入交付预警，品质可以复核；复核记录放在门户还是品质系统没有定（《3》§3.2）。</Note>
                </div>
              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="delivery" p="md">
              <Stack gap="lg">
                <div>
                  <SectionTitle extra={<LinkAction state={a.ship} to={`/portal/shipments/new?order=${order.id}`} size="compact-sm" variant="light">新建发货单</LinkAction>}>
                    发货单（SRM）
                  </SectionTitle>
                  {mobile ? (
                    <MiniCards rows={order.shipments} rowKey={(s) => s.id} empty="还没有发货单">
                      {(s) => <ShipmentCard shipment={s} />}
                    </MiniCards>
                  ) : (
                    <ShipmentMiniTable rows={order.shipments} base="/portal" />
                  )}
                </div>
                <ErpReadonly title="ERP回传（只读）：采购收货通知单、采购入库单">
                  <Stack gap="md">
                    {mobile ? (
                      <>
                        <MiniCards rows={order.notices} rowKey={(n) => n.id} empty="ERP还没有生成采购收货通知单">
                          {(n) => <NoticeCard notice={n} />}
                        </MiniCards>
                        <ReceiptCards receipts={order.receipts} />
                      </>
                    ) : (
                      <>
                        <NoticeTable rows={order.notices} />
                        <ReceiptTable rows={order.receipts} />
                      </>
                    )}
                    <ReceiptLegend />
                  </Stack>
                </ErpReadonly>
                <div>
                  <SectionTitle
                    extra={
                      <Anchor component={Link} to="/portal/receipts?tab=returns" fz="sm">
                        全部退货
                      </Anchor>
                    }
                  >
                    采购退货
                  </SectionTitle>
                  {mobile ? (
                    <MiniCards rows={order.returns} rowKey={(r) => r.id} empty="没有采购退货">
                      {(r) => <ReturnCard item={r} />}
                    </MiniCards>
                  ) : (
                    <ReturnTable rows={order.returns} showSupplier={false} orderBase="/portal/orders" />
                  )}
                </div>
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Card>
      </Stack>

      {respondVisible && (
        <StickyActions>
          <OrderRespondActions order={order} shipTo={shipTo} size="md" />
        </StickyActions>
      )}
    </>
  )
}

/** P03 门户订单详情：数量和价格只读，按订单接单、交期建议、齐套、发货（《3》§3.1、§3.2）。 */
export function PortalOrderDetailPage() {
  const { id = '' } = useParams()
  const query = useApi<OrderDetail>(`/orders/${id}`)
  return <QueryState query={query}>{(order) => <PortalOrderDetail key={order.id} order={order} />}</QueryState>
}
