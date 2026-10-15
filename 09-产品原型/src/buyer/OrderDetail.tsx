import { Alert, Badge, Card, Grid, Group, Select, Stack, Tabs, Text } from '@mantine/core'
import { IconAlertTriangle, IconCloudX, IconUserShare } from '@tabler/icons-react'
import { DataTable } from 'mantine-datatable'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAction, useApi } from '../api/hooks'
import { ActionButton, LinkAction } from '../components/ActionButton'
import { AuditTable, ReadonlyLogBadge } from '../components/AuditTable'
import { Countdown } from '../components/Countdown'
import { Fields } from '../components/Fields'
import { CodeName, DocNo, ErpReadonly, Note, PendingTag, ProxyBadge } from '../components/marks'
import { ReasonModal } from '../components/modals'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { LoadingBlock, QueryState } from '../components/QueryState'
import { StatusBadge } from '../components/StatusBadge'
import { TraceChain } from '../components/TraceChain'
import { useUrlValue } from '../components/urlState'
import { fmtDateTime } from '../domain/format'
import type { AuditLog } from '../domain/types'
import type { ChangeView, OrderDetail, TraceResult } from '../domain/views'
import {
  ChangeItemsText,
  ConfirmationTimeline,
  KittingTable,
  OrderLinesTable,
  OrderRespondActions,
  PendingEffectAlert,
  SuggestionActions,
  SuggestionTable,
} from '../shared/orderParts'
import { CheckResultView, PushAttempts, PushJobSummary } from '../shared/pushParts'
import { NoticeTable, ReceiptLegend, ReceiptTable, ReturnTable, ShipmentMiniTable } from '../shared/shipmentParts'

function ChangesTab({ changes }: { changes: ChangeView[] }) {
  return (
    <DataTable
      records={changes}
      idAccessor="id"
      withTableBorder
      borderRadius="md"
      minHeight={changes.length ? undefined : 120}
      noRecordsText="还没有订单变更"
      columns={[
        { accessor: 'no', title: '变更单号', render: (c) => <DocNo no={c.no} to={`/buyer/changes/${c.id}`} /> },
        { accessor: 'items', title: '变更内容', render: (c) => <ChangeItemsText change={c} /> },
        { accessor: 'reason', title: '原因', render: (c) => <Text fz="sm">{c.reason}</Text> },
        { accessor: 'source', title: '来源', render: (c) => <Text fz="sm">{c.source === 'suggestion' ? '交期建议' : '采购发起'}</Text> },
        { accessor: 'status', title: '状态', render: (c) => <StatusBadge kind="change" value={c.status} /> },
        { accessor: 'createdAt', title: '发起', render: (c) => <Text fz="xs">{c.createdBy} · {fmtDateTime(c.createdAt)}</Text> },
      ]}
    />
  )
}

function LogsTab({ orderId }: { orderId: string }) {
  const query = useApi<AuditLog[]>(`/orders/${orderId}/logs`)
  return <QueryState query={query}>{(logs) => <AuditTable logs={logs} />}</QueryState>
}

function TraceTab({ order }: { order: OrderDetail }) {
  const receiptNo = order.receipts[0]?.no
  const query = useApi<TraceResult>(receiptNo ? `/trace?receipt=${encodeURIComponent(receiptNo)}` : null)
  if (!receiptNo) {
    return (
      <Text fz="sm" c="dimmed">
        还没有采购入库单。发货后可以在 <Link to="/buyer/trace">箱码追溯</Link> 里按箱码查。
      </Text>
    )
  }
  if (query.isPending) return <LoadingBlock />
  return (
    <Stack gap="sm">
      <Text fz="xs" c="dimmed">
        从第一张采购入库单 {receiptNo} 出发，沿《5》§四的关系往上下游追。
      </Text>
      {query.data && <TraceChain nodes={query.data.nodes} />}
    </Stack>
  )
}

function OrderDetailContent({ order }: { order: OrderDetail }) {
  const run = useAction()
  const [tab, setTab] = useUrlValue('tab', 'lines')
  const [modal, setModal] = useState<'reject' | 'close' | null>(null)
  const [closeKind, setCloseKind] = useState<'close' | 'cancel'>('close')
  const a = order.actions
  const proxyActions = (['confirm', 'refuse', 'suggest', 'kitting', 'ship'] as const).some((key) => !a[key].hidden)
  const lastFail = order.pushJob?.status === 'failed' ? order.pushJob.attempts.at(-1)?.message : undefined

  return (
    <>
      <PageHeader
        back={{ to: '/buyer/orders', label: '采购订单' }}
        title={<span className="qs-mono">{order.no}</span>}
        badges={
          <Group gap={4}>
            <StatusBadge kind="audit" value={order.auditStatus} />
            <StatusBadge kind="push" value={order.pushStatus} />
            <StatusBadge kind="confirm" value={order.confirmStatus} />
            <StatusBadge kind="biz" value={order.bizStatus} />
            <StatusBadge kind="receipt" value={order.receiptStatus} />
            <ProxyBadge info={order.proxy} />
          </Group>
        }
        subtitle={`${order.supplierCode} ${order.supplierName} · 收货仓 ${order.warehouseName} · 承诺交期 ${order.promisedDate}`}
        actions={
          <>
            <LinkAction state={a.edit} to={`/buyer/orders/${order.id}/edit`} variant="default">
              编辑
            </LinkAction>
            <ActionButton state={a.submit} onClick={() => run(`/orders/${order.id}/submit`, {}, { success: '已提交审核' })}>
              提交审核
            </ActionButton>
            <ActionButton state={a.withdraw} variant="default" onClick={() => run(`/orders/${order.id}/withdraw`, {}, { success: '已撤回为草稿' })}>
              撤回
            </ActionButton>
            <ActionButton state={a.approve} onClick={() => run(`/orders/${order.id}/approve`, {}, { success: '审核通过' })}>
              审核通过
            </ActionButton>
            <ActionButton state={a.reject} color="red" variant="light" onClick={() => setModal('reject')}>
              驳回
            </ActionButton>
            <ActionButton state={a.retryPush} color="red" onClick={() => order.pushJob && run(`/push-jobs/${order.pushJob.id}/retry`, {}, { success: '已重推同一笔' })}>
              重推ERP
            </ActionButton>
            <ActionButton state={a.check} variant="default" onClick={() => run(`/orders/${order.id}/check`, {}, { success: '核对完成' })}>
              核对ERP
            </ActionButton>
            <LinkAction state={a.change} to={`/buyer/orders/${order.id}/change`} variant="light" color="violet">
              发起变更
            </LinkAction>
            <ActionButton
              state={a.close}
              variant="default"
              onClick={() => {
                setCloseKind('close')
                setModal('close')
              }}
            >
              关闭
            </ActionButton>
            <ActionButton
              state={a.cancel}
              variant="default"
              onClick={() => {
                setCloseKind('cancel')
                setModal('close')
              }}
            >
              取消
            </ActionButton>
          </>
        }
      />

      <Stack gap="md">
        {order.auditStatus === 'draft' && order.rejectComment && (
          <Alert color="orange" title="审核驳回，已退回草稿">
            {order.rejectComment}
          </Alert>
        )}
        {order.confirmStatus === 'rejected' && order.bizStatus === 'open' && (
          <Alert color="red" icon={<IconAlertTriangle size={18} />} title="供应商拒绝接单">
            <Text fz="sm">原因：{order.refuseReason}</Text>
            <Text fz="xs" c="dimmed" mt={4}>
              可以发起变更后重新下发，或关闭、取消订单；关闭和取消由谁发起见 <PendingTag n={4} />。
            </Text>
          </Alert>
        )}
        {order.overdue24h && (
          <Alert color="red" icon={<IconAlertTriangle size={18} />} title="下发超过24小时仍未确认">
            不会自动视为接受 <PendingTag n={19} />，请联系供应商在门户里确认或拒绝。
            {order.suggestions.length > 0 && (
              <>
                供应商提交过交期建议，算不算按时响应见 <PendingTag n={45} />。
              </>
            )}
          </Alert>
        )}
        {order.pushStatus === 'failed' && (
          <Alert color="red" icon={<IconCloudX size={18} />} title="推送ERP失败">
            {lastFail ?? '模拟ERP返回失败'}。重推沿用这一张SRM订单，不复制成新单（「06」）。
          </Alert>
        )}
        <PendingEffectAlert order={order} changeLink={order.pendingEffect ? `/buyer/changes/${order.pendingEffect.changeId}` : undefined} />
        {order.unfinishedChange && !order.pendingEffect && (
          <Alert color="gray" p="xs">
            <Text fz="sm">
              有一笔未完成的订单变更 <DocNo no={order.unfinishedChange.no} to={`/buyer/changes/${order.unfinishedChange.id}`} />（
              <StatusBadge kind="change" value={order.unfinishedChange.status} size="xs" />
              ）。一张订单同时只允许一笔未完成的变更。
            </Text>
          </Alert>
        )}
        {order.closeInfo && (
          <Alert color="dark" title={order.closeInfo.kind === 'cancel' ? '订单已取消' : '订单已关闭'}>
            {order.closeInfo.reason} · {order.closeInfo.by} · {fmtDateTime(order.closeInfo.at)}
          </Alert>
        )}

        {proxyActions && (
          <Card bg="cyan.0" style={{ borderColor: 'var(--mantine-color-cyan-2)' }}>
            <Group gap="xs" mb="xs">
              <IconUserShare size={18} color="var(--mantine-color-cyan-8)" />
              <Text fw={650} fz="sm">
                代录：这家供应商门户未开通
              </Text>
            </Group>
            <Text fz="xs" c="dimmed" mb="sm">
              采购员替供应商接单、提交交期建议、反馈齐套和发货，每次都要填写代录依据；数量、价格和关闭校验与供应商自己操作相同（《9》§2.4）。
            </Text>
            <Group gap="xs">
              <OrderRespondActions order={order} proxy shipTo={`/buyer/shipments/new?order=${order.id}`} />
            </Group>
          </Card>
        )}

        <Grid gap="md">
          <Grid.Col span={{ base: 12, lg: 7 }}>
            <Card h="100%">
              <SectionTitle>单头</SectionTitle>
              <Fields
                cols={3}
                items={[
                  { label: 'SRM采购订单号', value: <DocNo no={order.no} /> },
                  {
                    label: '供应商',
                    value: (
                      <Group gap={4}>
                        <Link to={`/buyer/suppliers/${order.supplierCode}`}>
                          <CodeName code={order.supplierCode} name={order.supplierName} />
                        </Link>
                        <StatusBadge kind="tier" value={order.supplier.tier} size="xs" />
                      </Group>
                    ),
                    span: 2,
                  },
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
                  { label: '创建', value: `${order.createdBy} · ${fmtDateTime(order.createdAt)}` },
                  { label: '提交审核', value: order.submittedAt ? `${order.submittedBy} · ${fmtDateTime(order.submittedAt)}` : undefined },
                  { label: '审核', value: order.approvedAt ? `${order.approvedBy} · ${fmtDateTime(order.approvedAt)}` : undefined },
                  { label: '下发供应商', value: order.sentAt ? fmtDateTime(order.sentAt) : undefined },
                  {
                    label: '供应商确认',
                    value:
                      order.confirmStatus === 'pending' ? (
                        <Countdown deadline={order.confirmDeadline} />
                      ) : order.confirmedAt ? (
                        `${order.confirmBy ?? ''} · ${fmtDateTime(order.confirmedAt)}`
                      ) : undefined,
                  },
                  { label: '备注', value: order.remark, span: 3 },
                ]}
              />
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 5 }}>
            <ErpReadonly
              extra={
                <Text fz={11} c="dimmed">
                  ERP里不能改，改动在SRM发起变更后推送
                </Text>
              }
            >
              {order.erp ? (
                <Fields
                  cols={2}
                  items={[
                    {
                      label: (
                        <>
                          ERP采购订单号 <PendingTag n={5} />
                        </>
                      ),
                      value: <DocNo no={order.erp.no} />,
                    },
                    { label: '来源单号（SRM）', value: <DocNo no={order.erp.sourceNo} /> },
                    { label: 'ERP接收时间', value: fmtDateTime(order.erp.receivedAt) },
                    { label: 'ERP承诺交期', value: order.erp.promisedDate },
                    { label: 'ERP业务状态', value: <StatusBadge kind="biz" value={order.erp.bizStatus} size="xs" /> },
                    { label: '推送', value: <PushJobSummary job={order.pushJob} /> },
                  ]}
                />
              ) : (
                <Text fz="sm" c="dimmed">
                  还没有ERP副本。审核通过并推送成功后，这里显示ERP接收的内容。
                </Text>
              )}
              <Text fz="xs" fw={650} c="dimmed" mt="md" mb={6}>
                最近一次核对
              </Text>
              <CheckResultView check={order.lastCheck} />
            </ErpReadonly>
          </Grid.Col>
        </Grid>

        <Card p={0}>
          <Tabs value={tab} onChange={(value) => setTab(value ?? 'lines')}>
            <Tabs.List px="md" pt="xs">
              <Tabs.Tab value="lines">明细</Tabs.Tab>
              <Tabs.Tab value="confirm" rightSection={order.pendingSuggestions ? <Badge size="xs" color="violet">{order.pendingSuggestions}</Badge> : undefined}>
                确认与交期
              </Tabs.Tab>
              <Tabs.Tab value="changes">变更 {order.changes.length || ''}</Tabs.Tab>
              <Tabs.Tab value="delivery">发货与收货</Tabs.Tab>
              <Tabs.Tab value="push">ERP推送</Tabs.Tab>
              <Tabs.Tab value="logs">操作日志</Tabs.Tab>
              <Tabs.Tab value="trace">追溯</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="lines" p="md">
              <OrderLinesTable order={order} />
            </Tabs.Panel>
            <Tabs.Panel value="confirm" p="md">
              <Grid gap="lg">
                <Grid.Col span={{ base: 12, md: 4 }}>
                  <SectionTitle>下发和确认</SectionTitle>
                  <ConfirmationTimeline records={order.confirmations} />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 8 }}>
                  <Stack gap="lg">
                    <div>
                      <SectionTitle>交期建议</SectionTitle>
                      <SuggestionTable rows={order.suggestions} actions={(row) => <SuggestionActions row={row} />} />
                    </div>
                    <div>
                      <SectionTitle>齐套反馈</SectionTitle>
                      <KittingTable rows={order.kitting} />
                    </div>
                  </Stack>
                </Grid.Col>
              </Grid>
            </Tabs.Panel>
            <Tabs.Panel value="changes" p="md">
              <ChangesTab changes={order.changes} />
            </Tabs.Panel>
            <Tabs.Panel value="delivery" p="md">
              <Stack gap="lg">
                <div>
                  <SectionTitle>发货单（SRM）</SectionTitle>
                  <ShipmentMiniTable rows={order.shipments} base="/buyer" />
                </div>
                <ErpReadonly title="ERP回传（只读）：采购收货通知单、采购入库单">
                  <Stack gap="md">
                    <NoticeTable rows={order.notices} />
                    <ReceiptTable rows={order.receipts} />
                    <ReceiptLegend />
                  </Stack>
                </ErpReadonly>
                <div>
                  <SectionTitle>采购退货</SectionTitle>
                  <ReturnTable rows={order.returns} />
                </div>
              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="push" p="md">
              {order.pushJobs.length === 0 ? (
                <Text fz="sm" c="dimmed">
                  还没有推送记录
                </Text>
              ) : (
                <Stack gap="lg">
                  {order.pushJobs.map((job) => (
                    <div key={job.id}>
                      <Group gap="xs" mb="xs">
                        <Badge variant="default">{job.kind}</Badge>
                        <DocNo no={job.objectNo} />
                        <PushJobSummary job={job} />
                      </Group>
                      <PushAttempts job={job} />
                    </div>
                  ))}
                  <Note>重试次数、间隔和能否手工重推未定「06」。原型不模拟自动重试。</Note>
                </Stack>
              )}
            </Tabs.Panel>
            <Tabs.Panel value="logs" p="md">
              <Group justify="flex-end" mb="xs">
                <ReadonlyLogBadge />
              </Group>
              <LogsTab orderId={order.id} />
            </Tabs.Panel>
            <Tabs.Panel value="trace" p="md">
              <TraceTab order={order} />
            </Tabs.Panel>
          </Tabs>
        </Card>
      </Stack>

      <ReasonModal
        opened={modal === 'reject'}
        onClose={() => setModal(null)}
        title="驳回采购订单"
        label="驳回意见"
        color="red"
        confirmLabel="驳回"
        description="驳回后订单退回草稿，采购员修改后重新提交。单级审核，不禁止本人审核（《4》§四）。"
        onSubmit={({ reason }) => run(`/orders/${order.id}/reject`, { comment: reason }, { success: '已驳回' })}
      />
      <ReasonModal
        opened={modal === 'close'}
        onClose={() => setModal(null)}
        title={closeKind === 'cancel' ? '取消采购订单' : '关闭采购订单'}
        label="原因"
        color="red"
        confirmLabel={closeKind === 'cancel' ? '取消订单' : '关闭订单'}
        description={
          <Stack gap="xs">
            <Select
              label="动作"
              data={[
                { value: 'close', label: '关闭：不再收货，已收部分保留', disabled: !a.close.ok },
                { value: 'cancel', label: '取消：还没有任何收货', disabled: !a.cancel.ok },
              ]}
              value={closeKind}
              onChange={(value) => setCloseKind(value === 'cancel' ? 'cancel' : 'close')}
            />
            <Note>演示由SRM采购员发起，同步ERP关闭。关闭后在途通知是否仍按ERP旧文执行见「04」。</Note>
          </Stack>
        }
        onSubmit={({ reason }) => run(`/orders/${order.id}/close`, { kind: closeKind, reason }, { success: closeKind === 'cancel' ? '订单已取消' : '订单已关闭' })}
      />
    </>
  )
}

/** B05 采购订单详情。 */
export function OrderDetailPage() {
  const { id = '' } = useParams()
  const query = useApi<OrderDetail>(`/orders/${id}`)
  return <QueryState query={query}>{(order) => <OrderDetailContent key={order.id} order={order} />}</QueryState>
}
