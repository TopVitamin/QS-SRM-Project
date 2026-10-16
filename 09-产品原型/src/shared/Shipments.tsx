import { Alert, Badge, Button, Card, Grid, Group, Modal, MultiSelect, NumberInput, SegmentedControl, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconSearch, IconUserShare } from '@tabler/icons-react'
import { DataTable } from 'mantine-datatable'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAction, useApi } from '../api/hooks'
import { useEntry } from '../app/entry'
import { ActionButton, LinkAction } from '../components/ActionButton'
import { AuditTable, ReadonlyLogBadge } from '../components/AuditTable'
import { numCell, qtyCell, skuColumn } from '../components/columns'
import { Fields } from '../components/Fields'
import { CodeName, DocNo, ErpReadonly, Note, PendingTag, ProxyBadge, SimBox } from '../components/marks'
import { ReasonModal } from '../components/modals'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { ResponsiveList } from '../components/ResponsiveList'
import { StatusBadge } from '../components/StatusBadge'
import { HeaderActions, StickyActions } from '../components/StickyActions'
import { matchText, useUrlList, useUrlValue } from '../components/urlState'
import { EMPTY, fmtDateTime, fmtQty } from '../domain/format'
import { statusOptions, suggestedPrefixNote } from '../domain/labels'
import { sumBy } from '../domain/money'
import type { AuditLog, Box } from '../domain/types'
import type { AppointmentView, BoxView, ShipmentDetail, ShipmentView } from '../domain/views'
import { PushAttempts, PushJobSummary } from './pushParts'
import { AppointmentHistory, AppointmentModal, ShipmentStatusPair } from './shipmentParts'

function ErpShipCell({ shipment }: { shipment: ShipmentView }) {
  if (shipment.status !== 'submitted') return <Text fz="xs">{EMPTY}</Text>
  return <StatusBadge kind="erpShip" value={shipment.erpStatus} size="xs" />
}

/** B12 / P04 发货单：SRM状态和ERP回传分两列。发货单不是收货指令（《5》§五）。 */
export function ShipmentList() {
  const { base, portal } = useEntry()
  const navigate = useNavigate()
  const query = useApi<ShipmentView[]>('/shipments')
  const [q, setQ] = useUrlValue('q')
  const [status, setStatus] = useUrlList('status')
  const [erp, setErp] = useUrlList('erp')
  const open = (s: ShipmentView) => navigate(`${base}/shipments/${s.id}`)

  return (
    <>
      <PageHeader
        title="发货单"
        subtitle={
          portal
            ? '按一张订单、一个收货仓填写。提交后推送ERP，ERP生成采购收货通知单才算收货指令。'
            : '供应商在门户填写；门户未开通的供应商由采购代录。ERP回传一列只读（《5》§五）。'
        }
        actions={
          portal ? (
            <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/portal/shipments/new')}>
              新建发货单
            </Button>
          ) : (
            <Tooltip label="只对门户未开通的供应商，代录依据必填（《9》§2.4）">
              <Button variant="light" color="cyan" leftSection={<IconUserShare size={16} />} onClick={() => navigate('/buyer/shipments/new')}>
                代录发货
              </Button>
            </Tooltip>
          )
        }
      />
      <Group gap="sm" mb="md" align="flex-end" wrap="wrap">
        <TextInput
          label="搜索"
          leftSection={<IconSearch size={14} />}
          placeholder={portal ? '发货单号、订单号、SKU' : '发货单号、订单号、供应商、SKU'}
          value={q}
          onChange={(event) => setQ(event.currentTarget.value)}
          w={{ base: '100%', xs: 240 }}
        />
        <MultiSelect label="SRM状态" placeholder="全部" data={statusOptions('shipment')} value={status} onChange={setStatus} clearable w={{ base: '100%', xs: 200 }} />
        <MultiSelect
          label="ERP回传"
          placeholder="全部"
          data={statusOptions('erpShip').filter((o) => o.value !== 'none')}
          value={erp}
          onChange={setErp}
          clearable
          w={{ base: '100%', xs: 240 }}
        />
      </Group>
      <QueryState query={query}>
        {(shipments) => {
          const rows = shipments.filter(
            (s) =>
              matchText(q, s.no, s.orderNo, s.supplierName, ...s.lines.flatMap((l) => [l.skuCode, l.skuName])) &&
              (!status.length || status.includes(s.status)) &&
              (!erp.length || (s.status === 'submitted' && erp.includes(s.erpStatus))),
          )
          return (
            <ResponsiveList
              records={rows}
              rowKey={(s) => s.id}
              onOpen={open}
              noRecordsText="没有符合条件的发货单"
              rowClassName={(s) => (s.erpStatus === 'pushFailed' ? 'qs-row-warn' : undefined)}
              columns={[
                {
                  accessor: 'no',
                  title: '发货单',
                  render: (s) => (
                    <Group gap={6} wrap="nowrap">
                      <DocNo no={s.no} to={`${base}/shipments/${s.id}`} />
                      <ProxyBadge info={s.proxy} />
                    </Group>
                  ),
                },
                { accessor: 'orderNo', title: 'SRM采购订单', render: (s) => <DocNo no={s.orderNo} to={`${base}/orders/${s.orderId}`} /> },
                {
                  accessor: 'supplierName',
                  title: '供应商',
                  hidden: portal,
                  render: (s) => (
                    <Stack gap={0}>
                      <Text fz="sm">{s.supplierName}</Text>
                      {s.supplierPortal === '未开通' && (
                        <Text fz={11} c="cyan.8">
                          门户未开通 · 采购代录
                        </Text>
                      )}
                    </Stack>
                  ),
                },
                { accessor: 'warehouseName', title: '收货仓' },
                { accessor: 'expectedDate', title: '预计到货', render: (s) => <Text fz="sm" className="qs-num">{s.expectedDate}</Text> },
                { accessor: 'totalQty', title: '发货数量', textAlign: 'right', render: (s) => qtyCell(s.totalQty) },
                { accessor: 'boxCount', title: '有效箱数', textAlign: 'right', render: (s) => qtyCell(s.boxCount) },
                { accessor: 'status', title: 'SRM状态', render: (s) => <StatusBadge kind="shipment" value={s.status} size="xs" /> },
                { accessor: 'erpStatus', title: 'ERP回传（只读）', render: (s) => <ErpShipCell shipment={s} /> },
                {
                  accessor: 'appointment',
                  title: '预约',
                  render: (s) =>
                    s.appointment ? (
                      <Group gap={4} wrap="nowrap">
                        <Text fz="xs" className="qs-num">
                          {s.appointment.date} {s.appointment.slot}
                        </Text>
                        <StatusBadge kind="appointment" value={s.appointment.status} size="xs" />
                      </Group>
                    ) : (
                      <Text fz="xs">{EMPTY}</Text>
                    ),
                },
                { accessor: 'updatedAt', title: '更新', render: (s) => <Text fz="xs" c="dimmed" className="qs-num">{fmtDateTime(s.updatedAt)}</Text> },
              ]}
              card={(s) => (
                <Stack gap={6}>
                  <Group justify="space-between" wrap="nowrap">
                    <DocNo no={s.no} />
                    <ShipmentStatusPair shipment={s} />
                  </Group>
                  <Text fz="sm">
                    订单 <span className="qs-mono">{s.orderNo}</span> · {s.warehouseName}
                  </Text>
                  <Group gap="md">
                    <Text fz="xs" c="dimmed">
                      预计到货 <span className="qs-num">{s.expectedDate}</span>
                    </Text>
                    <Text fz="xs" c="dimmed">
                      {fmtQty(s.totalQty)}件 · {s.boxCount}箱
                    </Text>
                  </Group>
                  {s.appointment && (
                    <Group gap={6}>
                      <Text fz="xs" className="qs-num">
                        预约 {s.appointment.date} {s.appointment.slot}
                      </Text>
                      <StatusBadge kind="appointment" value={s.appointment.status} size="xs" />
                    </Group>
                  )}
                </Stack>
              )}
            />
          )
        }}
      </QueryState>
    </>
  )
}

type ReceiptMode = 'full' | 'short' | 'zero'

/** 模拟WMS回传最终结果：全收、缺量、零收。实收超过通知数量会被拒绝（《4》§二、「10」）。 */
function ReceiptSimModal({ shipment, opened, onClose }: { shipment: ShipmentDetail; opened: boolean; onClose: () => void }) {
  const run = useAction()
  const lines = shipment.notice?.lines ?? []
  const [mode, setMode] = useState<ReceiptMode>('full')
  const [qty, setQty] = useState<Record<number, number | string>>(() => Object.fromEntries(lines.map((l) => [l.lineNo, Math.max(l.qty - 1, 0)])))
  const [busy, setBusy] = useState(false)
  const labels: Record<ReceiptMode, string> = { full: '全收', short: '缺量', zero: '零收' }

  const submit = async () => {
    setBusy(true)
    const body = mode === 'short' ? { mode, lines: lines.map((l) => ({ lineNo: l.lineNo, qty: Number(qty[l.lineNo] ?? 0) })) } : { mode }
    const result = await run(`/shipments/${shipment.id}/simulate-receipt`, body, { success: `已模拟WMS${labels[mode]}` })
    setBusy(false)
    if (result !== undefined) onClose()
  }

  return (
    <Modal opened={opened} onClose={onClose} title={`模拟WMS收货结果 · ${shipment.notice?.no ?? ''}`} size="lg">
      <Stack gap="sm">
        <Text fz="sm">一张通知单只有一次最终结果。缺量和零收会把差额还回订单行的可下推数量；零收不生成采购入库单（《5》§三）。</Text>
        <SegmentedControl
          value={mode}
          onChange={(value) => setMode(value as ReceiptMode)}
          data={[
            { value: 'full', label: '全收' },
            { value: 'short', label: '缺量' },
            { value: 'zero', label: '零收' },
          ]}
        />
        {mode === 'short' && (
          <DataTable
            records={lines}
            idAccessor="lineNo"
            withTableBorder
            borderRadius="md"
            columns={[
              { accessor: 'lineNo', title: '行', width: 48 },
              skuColumn(),
              { accessor: 'qty', title: '通知数量', textAlign: 'right', render: (l) => qtyCell(l.qty) },
              {
                accessor: 'got',
                title: '实收数量',
                width: 140,
                render: (l) => (
                  <NumberInput
                    size="xs"
                    min={0}
                    allowDecimal={false}
                    allowNegative={false}
                    value={qty[l.lineNo] ?? ''}
                    onChange={(value) => setQty((prev) => ({ ...prev, [l.lineNo]: value }))}
                    styles={{ input: { textAlign: 'right' } }}
                  />
                ),
              },
            ]}
          />
        )}
        <Note>实收填得比通知数量多，模拟ERP会拒绝；多出来的货怎么处理见「10」。拒收、质检、扫码明细是否回传见「09」。</Note>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            取消
          </Button>
          <Button color="gray" loading={busy} onClick={submit}>
            回传{labels[mode]}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function BoxesTable({ boxes, proxy }: { boxes: BoxView[]; proxy: boolean }) {
  const run = useAction()
  const [voiding, setVoiding] = useState<BoxView | null>(null)
  return (
    <>
      <DataTable
        records={boxes}
        idAccessor="code"
        withTableBorder
        borderRadius="md"
        minHeight={boxes.length ? undefined : 120}
        noRecordsText="还没有箱码"
        rowClassName={(b) => (b.status === 'void' ? 'qs-row-muted' : '')}
        columns={[
          {
            accessor: 'code',
            title: '箱码',
            render: (b) => (
              <Stack gap={0}>
                <Text fz="sm" className="qs-mono" td={b.status === 'void' ? 'line-through' : undefined}>
                  {b.code}
                </Text>
                {b.replaces && (
                  <Text fz={11} c="dimmed">
                    替换 <span className="qs-mono">{b.replaces}</span>
                  </Text>
                )}
                {b.replacedBy && (
                  <Text fz={11} c="red.7">
                    已换成 <span className="qs-mono">{b.replacedBy}</span>
                  </Text>
                )}
              </Stack>
            ),
          },
          { accessor: 'lineNo', title: '订单行', render: (b) => <Text fz="sm">第{b.lineNo}行 {b.skuName}</Text> },
          { accessor: 'batchNo', title: '供应商批号', render: (b) => <Text fz="sm" className="qs-mono">{b.batchNo}</Text> },
          { accessor: 'qty', title: '本箱数量', textAlign: 'right', render: (b) => numCell(`${fmtQty(b.qty)} ${b.unit}`) },
          { accessor: 'seq', title: '箱序', render: (b) => <Text fz="sm" className="qs-num">{b.seq}/{b.total}</Text> },
          {
            accessor: 'status',
            title: '状态',
            render: (b) => (
              <Stack gap={0}>
                <StatusBadge kind="box" value={b.status} size="xs" />
                {b.voidReason && (
                  <Text fz={11} c="dimmed">
                    {b.voidReason}
                  </Text>
                )}
              </Stack>
            ),
          },
          { accessor: 'printCount', title: '打印次数', textAlign: 'right', render: (b) => qtyCell(b.printCount) },
          {
            accessor: 'actions',
            title: '',
            textAlign: 'right',
            render: (b) => (
              <Group gap={6} justify="flex-end" wrap="nowrap">
                <ActionButton state={b.actions.reprint} size="compact-xs" variant="default" onClick={() => run(`/boxes/${b.code}/reprint`, {}, { success: `已记录补打 ${b.code}` })}>
                  补打
                </ActionButton>
                <ActionButton state={b.actions.void} size="compact-xs" color="red" variant="light" onClick={() => setVoiding(b)}>
                  作废并换码
                </ActionButton>
              </Group>
            ),
          },
        ]}
      />
      <ReasonModal
        opened={!!voiding}
        onClose={() => setVoiding(null)}
        title={`${proxy ? '代录' : ''}作废并换码 · ${voiding?.code ?? ''}`}
        label="作废原因"
        placeholder="例如：标签贴错箱"
        color="red"
        confirmLabel="作废并生成新码"
        proxy={proxy}
        description="原箱码作废，系统生成一个新码，沿用同一箱内容。作废码在追溯里显示作废，不能再收（《6》§三）。"
        onSubmit={async ({ reason, proxy: proxyValue }) => {
          const box = await run<Box>(`/boxes/${voiding!.code}/void`, { reason, proxy: proxyValue }, { success: false })
          if (box) notifications.show({ color: 'jade', message: `已作废，新箱码 ${box.code}，请补贴新标签` })
          return box
        }}
      />
    </>
  )
}

function AppointmentCard({ shipment, proxy }: { shipment: ShipmentDetail; proxy: boolean }) {
  const run = useAction()
  const appointment = shipment.appointment
  const list = useApi<AppointmentView[]>(appointment ? '/appointments' : null)
  const view = list.data?.find((a) => a.id === appointment?.id)
  const [modal, setModal] = useState<'new' | 'reschedule' | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const target = { id: shipment.id, no: shipment.no, warehouseName: shipment.warehouseName, boxCount: shipment.boxCount, plateNo: shipment.plateNo }

  return (
    <Card h="100%">
      <SectionTitle
        extra={
          <Group gap={6}>
            {!appointment && (
              <ActionButton state={shipment.actions.appoint} size="compact-sm" onClick={() => setModal('new')}>
                {proxy ? '代录预约' : '预约送货'}
              </ActionButton>
            )}
            {view && (
              <>
                <ActionButton state={view.actions.reschedule} size="compact-sm" variant="light" onClick={() => setModal('reschedule')}>
                  改约
                </ActionButton>
                <ActionButton state={view.actions.cancel} size="compact-sm" variant="default" onClick={() => setCancelling(true)}>
                  取消预约
                </ActionButton>
              </>
            )}
          </Group>
        }
      >
        预约送货
      </SectionTitle>
      {appointment ? (
        <Stack gap="xs">
          <Group gap="xs">
            <DocNo no={appointment.no} />
            <StatusBadge kind="appointment" value={appointment.status} />
            <ProxyBadge info={appointment.proxy} />
          </Group>
          <Text fz="sm" className="qs-num">
            {appointment.date} {appointment.slot} · 车牌 {appointment.plateNo} · {appointment.pieces}件 · 司机 {appointment.driverPhone}
          </Text>
          {appointment.status === 'returned' && (
            <Alert color="red" p="xs">
              <Text fz="sm">仓库退回了这次预约，请改约。</Text>
            </Alert>
          )}
          <AppointmentHistory appointment={appointment} />
        </Stack>
      ) : (
        <Text fz="sm" c="dimmed">
          {shipment.status === 'submitted' ? '还没有预约' : '发货单提交后才能预约'}
        </Text>
      )}
      <Stack gap={4} mt="sm">
        <Note>可预约的仓库、是否必须仓库确认、爽约宽限见「21」「24」。</Note>
      </Stack>
      {modal && (
        <AppointmentModal
          opened
          shipment={target}
          appointment={modal === 'reschedule' ? appointment : undefined}
          onClose={() => setModal(null)}
          proxy={proxy}
        />
      )}
      {appointment && (
        <ReasonModal
          opened={cancelling}
          onClose={() => setCancelling(false)}
          title={`${proxy ? '代录' : ''}取消预约 · ${appointment.no}`}
          label="取消原因"
          required={false}
          proxy={proxy}
          confirmLabel="取消预约"
          onSubmit={({ reason, proxy: proxyValue }) => run(`/appointments/${appointment.id}/cancel`, { reason, proxy: proxyValue }, { success: '预约已取消' })}
        />
      )}
    </Card>
  )
}

function ErpBlock({ shipment }: { shipment: ShipmentDetail }) {
  const { notice, receipt } = shipment
  const got = receipt ? sumBy(receipt.lines, (l) => l.qty) : 0
  const noticed = notice ? sumBy(notice.lines, (l) => l.qty) : 0
  return (
    <ErpReadonly title="ERP回传（只读）" extra={shipment.status === 'submitted' ? <StatusBadge kind="erpShip" value={shipment.erpStatus} /> : undefined}>
      {shipment.status !== 'submitted' ? (
        <Text fz="sm" c="dimmed">
          {shipment.status === 'draft' ? '草稿不推送ERP。提交后ERP才会按发货单生成采购收货通知单。' : '发货单已取消。'}
        </Text>
      ) : (
        <Stack gap="sm">
          <Fields
            cols={2}
            items={[
              { label: '采购收货通知单', value: notice ? <DocNo no={notice.no} /> : '等ERP生成' },
              { label: '通知单状态', value: notice ? <StatusBadge kind="notice" value={notice.status} size="xs" /> : undefined },
              { label: '下发WMS', value: notice ? fmtDateTime(notice.createdAt) : undefined },
              { label: '通知数量', value: notice ? fmtQty(noticed) : undefined },
              { label: '采购入库单', value: receipt ? <DocNo no={receipt.no} /> : notice?.status === 'cancelled' ? '零收，不生成' : undefined },
              { label: '入库日期', value: receipt?.date },
              {
                label: '实收 / 通知',
                value: receipt ? (
                  <Text fz="sm" className="qs-num" c={got < noticed ? 'orange.8' : undefined}>
                    {fmtQty(got)} / {fmtQty(noticed)}
                    {got < noticed ? ' 缺量' : ' 全收'}
                  </Text>
                ) : undefined,
              },
              { label: '收货结果时间', value: notice?.resultAt ? fmtDateTime(notice.resultAt) : undefined },
            ]}
          />
          {shipment.pushJob && (
            <Group gap="xs">
              <Text fz="xs" c="dimmed">
                推送ERP
              </Text>
              <PushJobSummary job={shipment.pushJob} />
            </Group>
          )}
        </Stack>
      )}
      <Text fz="xs" c="dimmed" mt="sm">
        发货单不是收货指令，收货只看ERP的通知单和入库单。拒收、质检、扫码明细是否回传见 <PendingTag n={9} />
      </Text>
    </ErpReadonly>
  )
}

function ShipmentDetailContent({ shipment }: { shipment: ShipmentDetail }) {
  const { base, portal } = useEntry()
  const navigate = useNavigate()
  const run = useAction()
  const proxy = !portal && shipment.supplierPortal === '未开通'
  const [cancelling, setCancelling] = useState(false)
  const [receiving, setReceiving] = useState(false)
  const logs = useApi<AuditLog[]>(portal ? null : `/shipments/${shipment.id}/logs`)
  const a = shipment.actions
  const draft = shipment.status === 'draft'
  const boxesOf = (lineNo: number) => shipment.boxes.filter((b) => b.lineNo === lineNo && b.status === 'valid').length

  const buttons = (
    <>
      <LinkAction state={a.edit} to={`${base}/shipments/new?id=${shipment.id}`} variant="default">
        编辑草稿
      </LinkAction>
      <ActionButton state={a.regenerate} variant="default" onClick={() => run(`/shipments/${shipment.id}/regenerate`, {}, { success: '已重新装箱，箱码重新生成' })}>
        重新装箱
      </ActionButton>
      <LinkAction state={a.print} to={`${base}/shipments/${shipment.id}/labels`} variant="light">
        打印箱码
      </LinkAction>
      <ActionButton state={a.submit} onClick={() => run(`/shipments/${shipment.id}/submit`, {}, { success: '已提交，正在推送ERP' })}>
        提交发货单
      </ActionButton>
      <ActionButton state={a.retryPush} color="red" onClick={() => shipment.pushJob && run(`/push-jobs/${shipment.pushJob.id}/retry`, {}, { success: '已重推同一笔' })}>
        重推ERP
      </ActionButton>
      <ActionButton state={a.cancel} variant="default" color="red" onClick={() => setCancelling(true)}>
        取消发货单
      </ActionButton>
    </>
  )

  return (
    <>
      <PageHeader
        back={{ to: `${base}/shipments`, label: '发货单' }}
        title={<span className="qs-mono">{shipment.no}</span>}
        badges={
          <Group gap={6}>
            <ShipmentStatusPair shipment={shipment} />
            <ProxyBadge info={shipment.proxy} />
            <Text span fz={11} c="dimmed">
              {suggestedPrefixNote}
            </Text>
          </Group>
        }
        subtitle={`${portal ? '' : `${shipment.supplierName} · `}订单 ${shipment.orderNo} · ${shipment.warehouseName}`}
        actions={<HeaderActions portal={portal}>{buttons}</HeaderActions>}
      />
      <Stack gap="md">
        {shipment.status === 'cancelled' && (
          <Alert color="dark" title="发货单已取消">
            {shipment.cancelReason}（{fmtDateTime(shipment.cancelledAt)}）。原箱码随之作废。
          </Alert>
        )}
        {draft && (
          <Alert color="gray" p="sm">
            <Text fz="sm">草稿可以改数量、重新装箱、提前打印。提交后推送ERP，箱码只能补打或作废换码（《6》§三）。</Text>
          </Alert>
        )}
        {proxy && (
          <Alert color="cyan" icon={<IconUserShare size={16} />} p="sm">
            <Text fz="sm">这家供应商门户未开通，由采购代录。编辑、取消、作废换码、预约都要填代录依据。</Text>
          </Alert>
        )}

        <Card>
          <SectionTitle>SRM发货单</SectionTitle>
          <Fields
            items={[
              { label: 'SRM采购订单', value: <DocNo no={shipment.orderNo} to={`${base}/orders/${shipment.orderId}`} /> },
              { label: '供应商', value: <CodeName code={shipment.supplierCode} name={shipment.supplierName} /> },
              { label: '收货仓', value: shipment.warehouseName },
              { label: '预计到货', value: shipment.expectedDate },
              { label: '承运商', value: shipment.carrier },
              { label: '运单号', value: shipment.waybillNo },
              { label: '车牌号', value: shipment.plateNo },
              { label: '备注', value: shipment.remark },
              { label: '创建', value: `${shipment.createdBy} · ${fmtDateTime(shipment.createdAt)}` },
              { label: '提交', value: shipment.submittedAt ? fmtDateTime(shipment.submittedAt) : undefined },
              { label: '代录依据', value: shipment.proxy ? `${shipment.proxy.basisType}：${shipment.proxy.basisNote}` : undefined, hidden: !shipment.proxy, span: 2 },
            ]}
          />
          <Note>一张发货单只对应一张订单、一个收货仓「07」。</Note>
        </Card>

        <Grid gap="md">
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Stack gap="md">
              <ErpBlock shipment={shipment} />
              {(!a.simulateNotice.hidden || !a.simulateReceipt.hidden) && (
                <SimBox note="真实环境里通知单由ERP生成并下发WMS，收货结果由WMS回传ERP。这里按按钮模拟。">
                  <ActionButton state={a.simulateNotice} size="xs" variant="default" onClick={() => run(`/shipments/${shipment.id}/simulate-notice`, {}, { success: 'ERP已生成采购收货通知单并下发WMS' })}>
                    模拟ERP生成收货通知单
                  </ActionButton>
                  <ActionButton state={a.simulateReceipt} size="xs" variant="default" onClick={() => setReceiving(true)}>
                    模拟WMS收货结果
                  </ActionButton>
                </SimBox>
              )}
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 5 }}>
            <AppointmentCard shipment={shipment} proxy={proxy} />
          </Grid.Col>
        </Grid>

        <Card>
          <SectionTitle>发货行</SectionTitle>
          <DataTable
            records={shipment.lines}
            idAccessor="lineNo"
            withTableBorder
            borderRadius="md"
            columns={[
              { accessor: 'lineNo', title: '行', width: 48 },
              skuColumn(),
              { accessor: 'qty', title: '发货数量', textAlign: 'right', render: (l) => numCell(`${fmtQty(l.qty)} ${l.unit}`, true) },
              {
                accessor: 'batchNo',
                title: (
                  <Tooltip label="供应商自己的批号，不是ERP库存批次（A13）">
                    <span>供应商批号</span>
                  </Tooltip>
                ),
                render: (l) => <Text fz="sm" className="qs-mono">{l.batchNo}</Text>,
              },
              { accessor: 'perBox', title: '每箱数量', textAlign: 'right', render: (l) => qtyCell(l.perBox) },
              { accessor: 'boxes', title: '有效箱数', textAlign: 'right', render: (l) => qtyCell(boxesOf(l.lineNo)) },
              {
                accessor: 'shippable',
                title: '订单行本次可发',
                textAlign: 'right',
                hidden: !draft,
                render: (l) => {
                  const q = shipment.lineQty.find((x) => x.lineNo === l.lineNo)
                  const over = !!q && l.qty > q.shippable
                  return (
                    <Tooltip label={q ? `可下推${q.pushable}，已提交未生成通知${q.pendingShip}` : ''}>
                      <Text fz="sm" className="qs-num" c={over ? 'red.7' : undefined} fw={over ? 650 : undefined}>
                        {fmtQty(q?.shippable)}
                        {over ? ' 超出' : ''}
                      </Text>
                    </Tooltip>
                  )
                },
              },
            ]}
          />
          {draft && <Note>提交时按订单行重新校验：本次发货不超过可下推减去已提交未生成通知的数量，不设超发容差（《4》§二）。</Note>}
        </Card>

        <Card>
          <SectionTitle extra={<Badge variant="light" color="gray">{shipment.boxCount}箱有效</Badge>}>箱码</SectionTitle>
          <BoxesTable boxes={shipment.boxes} proxy={proxy} />
          <Note>箱码用内部流水的演示格式，码制和标签版式见「23」。一箱一种SKU，尾数单独成一箱。</Note>
        </Card>

        {!portal && shipment.pushJob && (
          <Card>
            <SectionTitle extra={<PushJobSummary job={shipment.pushJob} />}>推送ERP</SectionTitle>
            <PushAttempts job={shipment.pushJob} />
          </Card>
        )}

        {!portal && (
          <Card>
            <SectionTitle extra={<ReadonlyLogBadge />}>操作日志</SectionTitle>
            <QueryState query={logs}>{(rows) => <AuditTable logs={rows} withObject />}</QueryState>
          </Card>
        )}
      </Stack>

      {portal && <StickyActions>{buttons}</StickyActions>}

      <ReasonModal
        opened={cancelling}
        onClose={() => setCancelling(false)}
        title={`${proxy ? '代录' : ''}取消发货单 · ${shipment.no}`}
        label="取消原因"
        required={!draft}
        color="red"
        confirmLabel="取消发货单"
        proxy={proxy}
        description={
          draft
            ? '草稿取消后不再使用，箱码随之作废。'
            : 'ERP还没生成收货通知单，可以取消；箱码和预约随之作废。生成通知单之后能否取消、怎样联动见待确认-42。'
        }
        onSubmit={async ({ reason, proxy: proxyValue }) => {
          const result = await run(`/shipments/${shipment.id}/cancel`, { reason, proxy: proxyValue }, { success: '发货单已取消' })
          if (result !== undefined && draft) navigate(`${base}/shipments`)
          return result
        }}
      />
      {shipment.notice && <ReceiptSimModal key={shipment.notice.id} shipment={shipment} opened={receiving} onClose={() => setReceiving(false)} />}
    </>
  )
}

/** B13 / P06 发货单详情：SRM发货单和ERP回传分两块；箱码补打、作废换码；预约。 */
export function ShipmentDetailPage() {
  const { id = '' } = useParams()
  const query = useApi<ShipmentDetail>(`/shipments/${id}`)
  return <QueryState query={query}>{(shipment) => <ShipmentDetailContent key={shipment.id} shipment={shipment} />}</QueryState>
}
