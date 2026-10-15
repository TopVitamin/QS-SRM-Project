import { Alert, Button, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { DataTable } from 'mantine-datatable'
import { useState, type ReactNode } from 'react'
import { useAction } from '../api/hooks'
import { numCell } from '../components/columns'
import { DocNo, Note, PendingTag, ProxyBadge } from '../components/marks'
import { ProxyFields, emptyProxy, type ProxyValue } from '../components/modals'
import { StatusBadge } from '../components/StatusBadge'
import { EMPTY, fmtDate, fmtDateTime, fmtMoney, fmtQty, todayStr } from '../domain/format'
import { timeSlots } from '../domain/labels'
import { sumBy } from '../domain/money'
import type { Appointment, ErpNotice, ErpReceipt } from '../domain/types'
import type { ReturnView, ShipmentView } from '../domain/views'

/** SRM发货单状态和ERP回传分开显示：发货单不是收货指令（《5》§五）。 */
export function ShipmentStatusPair({ shipment }: { shipment: ShipmentView }) {
  return (
    <Group gap={4} wrap="nowrap">
      <StatusBadge kind="shipment" value={shipment.status} size="xs" />
      {shipment.status === 'submitted' && <StatusBadge kind="erpShip" value={shipment.erpStatus} size="xs" />}
    </Group>
  )
}

export function ShipmentMiniTable({ rows, base }: { rows: ShipmentView[]; base: string }) {
  return (
    <DataTable
      records={rows}
      idAccessor="id"
      withTableBorder
      borderRadius="md"
      minHeight={rows.length ? undefined : 120}
      noRecordsText="还没有发货单"
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
        { accessor: 'status', title: 'SRM状态 / ERP回传', render: (s) => <ShipmentStatusPair shipment={s} /> },
        { accessor: 'expectedDate', title: '预计到货', render: (s) => <Text fz="sm" className="qs-num">{s.expectedDate}</Text> },
        { accessor: 'totalQty', title: '发货数量', textAlign: 'right', render: (s) => numCell(fmtQty(s.totalQty)) },
        { accessor: 'boxCount', title: '有效箱数', textAlign: 'right', render: (s) => numCell(fmtQty(s.boxCount)) },
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
      ]}
    />
  )
}

export function NoticeTable({ rows }: { rows: ErpNotice[] }) {
  return (
    <DataTable
      records={rows}
      idAccessor="id"
      withTableBorder
      borderRadius="md"
      minHeight={rows.length ? undefined : 100}
      noRecordsText="ERP还没有生成采购收货通知单"
      columns={[
        { accessor: 'no', title: '采购收货通知单', render: (n) => <DocNo no={n.no} /> },
        { accessor: 'shipmentNo', title: '来源发货单', render: (n) => <DocNo no={n.shipmentNo} /> },
        { accessor: 'erpOrderNo', title: 'ERP采购订单', render: (n) => <DocNo no={n.erpOrderNo} /> },
        { accessor: 'qty', title: '通知数量', textAlign: 'right', render: (n) => numCell(fmtQty(sumBy(n.lines, (l) => l.qty))) },
        { accessor: 'status', title: '状态', render: (n) => <StatusBadge kind="notice" value={n.status} size="xs" /> },
        { accessor: 'createdAt', title: '下发WMS', render: (n) => <Text fz="xs" className="qs-num">{fmtDateTime(n.createdAt)}</Text> },
        { accessor: 'resultAt', title: '收货结果', render: (n) => <Text fz="xs" className="qs-num">{fmtDateTime(n.resultAt)}</Text> },
      ]}
    />
  )
}

export function ReceiptTable({ rows, extra }: { rows: (ErpReceipt & { supplierName?: string; warehouseName?: string })[]; extra?: (row: ErpReceipt) => ReactNode }) {
  return (
    <DataTable
      records={rows}
      idAccessor="id"
      withTableBorder
      borderRadius="md"
      minHeight={rows.length ? undefined : 100}
      noRecordsText="还没有ERP已审核的采购入库单"
      columns={[
        { accessor: 'no', title: '采购入库单', render: (r) => <DocNo no={r.no} /> },
        { accessor: 'noticeNo', title: '收货通知单', render: (r) => <DocNo no={r.noticeNo} /> },
        { accessor: 'orderNo', title: 'SRM采购订单', render: (r) => <DocNo no={r.orderNo} /> },
        { accessor: 'supplierName', title: '供应商', hidden: !rows.some((r) => r.supplierName) },
        { accessor: 'date', title: '入库日期', render: (r) => <Text fz="sm" className="qs-num">{fmtDate(r.date)}</Text> },
        {
          accessor: 'qty',
          title: '实收 / 通知',
          textAlign: 'right',
          render: (r) => {
            const got = sumBy(r.lines, (l) => l.qty)
            const notice = sumBy(r.lines, (l) => l.noticeQty)
            return (
              <Text fz="sm" className="qs-num" c={got < notice ? 'orange.8' : undefined}>
                {fmtQty(got)} / {fmtQty(notice)}
                {got < notice ? ' 缺量' : ''}
              </Text>
            )
          },
        },
        { accessor: 'amount', title: '价税合计', textAlign: 'right', render: (r) => numCell(fmtMoney(sumBy(r.lines, (l) => l.amount))) },
        {
          accessor: 'reject',
          title: (
            <Group gap={4} wrap="nowrap">
              拒收 / 质检 / 扫码 <PendingTag n={9} />
            </Group>
          ),
          render: () => <Text fz="sm">{EMPTY}</Text>,
        },
        { accessor: 'extra', title: '', hidden: !extra, textAlign: 'right', render: (r) => extra?.(r) },
      ]}
    />
  )
}

export function ReturnTable({
  rows,
  actions,
  orderBase,
  showSupplier = true,
}: {
  rows: ReturnView[]
  actions?: (row: ReturnView) => ReactNode
  orderBase?: string
  showSupplier?: boolean
}) {
  return (
    <DataTable
      records={rows}
      idAccessor="id"
      withTableBorder
      borderRadius="md"
      minHeight={rows.length ? undefined : 100}
      noRecordsText="没有采购退货"
      columns={[
        {
          accessor: 'returnNo',
          title: '采购退货 / 采退通知 / 采退出库',
          render: (r) => (
            <Stack gap={0}>
              <DocNo no={r.returnNo} />
              <DocNo no={r.noticeNo} size="xs" />
              <DocNo no={r.outboundNo} size="xs" />
            </Stack>
          ),
        },
        { accessor: 'orderNo', title: 'SRM采购订单', render: (r) => <DocNo no={r.orderNo} to={orderBase ? `${orderBase}/${r.orderId}` : undefined} /> },
        { accessor: 'supplierName', title: '供应商', hidden: !showSupplier },
        {
          accessor: 'lines',
          title: '退货行',
          render: (r) => (
            <Stack gap={0}>
              {r.lines.map((l) => (
                <Text key={l.lineNo} fz="xs">
                  第{l.lineNo}行 {l.skuName} × {fmtQty(l.qty)}
                </Text>
              ))}
            </Stack>
          ),
        },
        { accessor: 'reason', title: '原因', render: (r) => <Text fz="sm">{r.reason}</Text> },
        {
          accessor: 'erpStatus',
          title: 'ERP',
          render: (r) => (
            <Stack gap={0}>
              <Text fz="xs">{r.erpStatus}</Text>
              {r.outboundDate && (
                <Text fz="xs" c="dimmed" className="qs-num">
                  出库 {r.outboundDate}
                </Text>
              )}
            </Stack>
          ),
        },
        {
          accessor: 'ack',
          title: '供应商确认',
          render: (r) => (
            <Stack gap={0}>
              <StatusBadge kind="returnAck" value={r.ack} size="xs" />
              {r.ackBy && (
                <Text fz={11} c="dimmed">
                  {r.ackBy} · {fmtDateTime(r.ackAt)}
                </Text>
              )}
            </Stack>
          ),
        },
        { accessor: 'actions', title: '', hidden: !actions, textAlign: 'right', render: (r) => actions?.(r) },
      ]}
    />
  )
}

interface AppointmentModalProps {
  /** 从预约看板改约时拿不到当前箱数，不显示箱数提示。 */
  shipment: Pick<ShipmentView, 'id' | 'no' | 'warehouseName'> & { boxCount?: number; plateNo?: string }
  appointment?: Appointment
  opened: boolean
  onClose: () => void
  proxy?: boolean
}

/** 预约送货：选日期、时段、车牌、件数；需不需要仓库确认按「24」开关。 */
export function AppointmentModal({ shipment, appointment, opened, onClose, proxy }: AppointmentModalProps) {
  const run = useAction()
  const [proxyValue, setProxyValue] = useState<ProxyValue>(emptyProxy)
  const [proxyError, setProxyError] = useState<string>()
  const form = useForm({
    initialValues: {
      date: (appointment?.date ?? null) as string | null,
      slot: (appointment?.slot ?? null) as string | null,
      plateNo: appointment?.plateNo ?? shipment.plateNo ?? '',
      pieces: (appointment?.pieces ?? shipment.boxCount) || ('' as number | string),
      driverPhone: appointment?.driverPhone ?? '',
    },
    validate: {
      date: (v) => (v ? null : '请选择送货日期'),
      slot: (v) => (v ? null : '请选择时段'),
      plateNo: (v) => (v.trim() ? null : '请填写车牌号'),
      pieces: (v) => (Number(v) > 0 ? null : '件数要大于0'),
      driverPhone: (v) => (/^1\d{10}$/.test(v.trim()) ? null : '请填写11位手机号'),
    },
  })
  const close = () => {
    form.reset()
    setProxyValue(emptyProxy)
    setProxyError(undefined)
    onClose()
  }
  const submit = form.onSubmit(async (values) => {
    if (proxy && !proxyValue.basisNote.trim()) return setProxyError('请填写代录依据说明')
    const body = { shipmentId: shipment.id, ...values, plateNo: values.plateNo.trim(), driverPhone: values.driverPhone.trim(), pieces: Number(values.pieces), proxy: proxy ? proxyValue : undefined }
    const result = appointment
      ? await run(`/appointments/${appointment.id}`, body, { method: 'PUT', success: '已改约' })
      : await run('/appointments', body, { success: '预约已提交' })
    if (result !== undefined) close()
  })
  return (
    <Modal opened={opened} onClose={close} title={`${proxy ? '代录' : ''}${appointment ? '改约' : '预约送货'} · ${shipment.no}`} size="lg">
      <form onSubmit={submit}>
        <Stack gap="sm">
          <Text fz="sm">
            收货仓：{shipment.warehouseName}。{appointment?.status === 'returned' ? '仓库退回了上一次预约，请换一个时段。' : ''}
          </Text>
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            <DateInput label="送货日期" withAsterisk minDate={todayStr()} {...form.getInputProps('date')} />
            <Select label="时段" withAsterisk data={timeSlots} {...form.getInputProps('slot')} />
            <TextInput label="车牌号" withAsterisk placeholder="例如：粤S·A1234" {...form.getInputProps('plateNo')} />
            <NumberInput
              label="件数"
              withAsterisk
              min={1}
              allowDecimal={false}
              {...form.getInputProps('pieces')}
              description={shipment.boxCount !== undefined ? `当前有效箱数 ${shipment.boxCount}` : undefined}
            />
            <TextInput label="司机手机" withAsterisk placeholder="11位手机号" inputMode="tel" {...form.getInputProps('driverPhone')} />
          </SimpleGrid>
          <Note>可预约的仓库、预约是否必须由仓库人工确认、爽约宽限见「21」「24」。</Note>
          {proxy && <ProxyFields value={proxyValue} onChange={setProxyValue} error={proxyError} />}
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={close}>
              取消
            </Button>
            <Button type="submit">{appointment ? '提交改约' : '提交预约'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

export function AppointmentHistory({ appointment }: { appointment: Appointment }) {
  return (
    <Stack gap={2}>
      {appointment.history.map((h, index) => (
        <Text key={index} fz="xs" c="dimmed">
          {fmtDateTime(h.at)} {h.by} {h.action}
          {h.note ? `：${h.note}` : ''}
        </Text>
      ))}
    </Stack>
  )
}

export function ReceiptLegend() {
  return (
    <Alert color="gray" variant="light" p="xs">
      <Note>
        「拒收 / 质检 / 扫码」三列显示「-」：回传SRM的入库内容包括哪些未定「09」。一批发货一张通知、一次最终结果：全收、缺量或零收；零收不生成入库单（《4》§二、《5》§三）。
      </Note>
    </Alert>
  )
}
