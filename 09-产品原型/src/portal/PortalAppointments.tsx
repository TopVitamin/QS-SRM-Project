import { Alert, Card, Group, SegmentedControl, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useAction, useApi } from '../api/hooks'
import { ActionButton } from '../components/ActionButton'
import { numCell } from '../components/columns'
import { DocNo, Note } from '../components/marks'
import { ReasonModal } from '../components/modals'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { ResponsiveList } from '../components/ResponsiveList'
import { StatusBadge } from '../components/StatusBadge'
import { useUrlValue } from '../components/urlState'
import { fmtQty } from '../domain/format'
import type { AppointmentView, ShipmentView } from '../domain/views'
import { AppointmentHistory, AppointmentModal } from '../shared/shipmentParts'
import { useConfig } from '../stores/config'

type Dialog =
  | { kind: 'appoint'; shipment: ShipmentView }
  | { kind: 'reschedule'; appointment: AppointmentView }
  | { kind: 'cancel'; appointment: AppointmentView }

const filters: { value: string; label: string; match: (a: AppointmentView) => boolean }[] = [
  { value: 'active', label: '进行中', match: (a) => a.status !== 'cancelled' && !a.finished },
  { value: 'finished', label: '已完成', match: (a) => a.finished },
  { value: 'cancelled', label: '已取消', match: (a) => a.status === 'cancelled' },
  { value: 'all', label: '全部', match: () => true },
]

function returnNote(appointment: AppointmentView) {
  return [...appointment.history].reverse().find((h) => h.action === '退回改约')?.note
}

/** P08 门户预约送货：已提交、还没预约的发货单在上面，下面是预约记录（《3》§3.3）。 */
export function PortalAppointments() {
  const run = useAction()
  const shipments = useApi<ShipmentView[]>('/shipments')
  const appointments = useApi<AppointmentView[]>('/appointments')
  const needsConfirm = useConfig((s) => s.config.appointmentNeedsConfirm)
  const [filter, setFilter] = useUrlValue('filter', 'active')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const current = filters.find((f) => f.value === filter) ?? filters[0]

  return (
    <>
      <PageHeader
        title="预约送货"
        subtitle={`发货单提交后预约送货。当前演示：${needsConfirm ? '预约须仓库人工确认，退回后请改约' : '提交即已预约，不需仓库确认'}（「24」）。`}
      />
      <Stack gap="md">
        <Card>
          <SectionTitle>待预约的发货单</SectionTitle>
          <QueryState query={shipments}>
            {(rows) => {
              const waiting = rows.filter((s) => s.actions.appoint.ok)
              return (
                <ResponsiveList
                  records={waiting}
                  rowKey={(s) => s.id}
                  noRecordsText="没有待预约的发货单"
                  columns={[
                    { accessor: 'no', title: '发货单', render: (s) => <DocNo no={s.no} to={`/portal/shipments/${s.id}`} /> },
                    { accessor: 'orderNo', title: '采购订单', render: (s) => <DocNo no={s.orderNo} to={`/portal/orders/${s.orderId}`} /> },
                    { accessor: 'warehouseName', title: '收货仓' },
                    { accessor: 'expectedDate', title: '预计到货', render: (s) => <Text fz="sm" className="qs-num">{s.expectedDate}</Text> },
                    { accessor: 'totalQty', title: '发货数量', textAlign: 'right', render: (s) => numCell(fmtQty(s.totalQty)) },
                    { accessor: 'boxCount', title: '有效箱数', textAlign: 'right', render: (s) => numCell(fmtQty(s.boxCount)) },
                    { accessor: 'erpStatus', title: 'ERP回传', render: (s) => <StatusBadge kind="erpShip" value={s.erpStatus} size="xs" /> },
                    {
                      accessor: 'actions',
                      title: '',
                      textAlign: 'right',
                      render: (s) => (
                        <ActionButton state={s.actions.appoint} size="compact-sm" onClick={() => setDialog({ kind: 'appoint', shipment: s })}>
                          预约送货
                        </ActionButton>
                      ),
                    },
                  ]}
                  card={(s) => (
                    <Stack gap={6}>
                      <Group justify="space-between" wrap="nowrap">
                        <DocNo no={s.no} to={`/portal/shipments/${s.id}`} />
                        <StatusBadge kind="erpShip" value={s.erpStatus} size="xs" />
                      </Group>
                      <Text fz="sm">
                        订单 <span className="qs-mono">{s.orderNo}</span> · {s.warehouseName}
                      </Text>
                      <Text fz="xs" c="dimmed">
                        预计到货 <span className="qs-num">{s.expectedDate}</span> · {fmtQty(s.totalQty)} · {s.boxCount}箱
                      </Text>
                      {s.erpStatus === 'pushFailed' && (
                        <Text fz="xs" c="orange.8">
                          ERP还没接收这张发货单，仍可预约；仓库要等ERP通知单才能收货
                        </Text>
                      )}
                      <ActionButton state={s.actions.appoint} fullWidth onClick={() => setDialog({ kind: 'appoint', shipment: s })}>
                        预约送货
                      </ActionButton>
                    </Stack>
                  )}
                />
              )
            }}
          </QueryState>
        </Card>

        <Card>
          <SectionTitle
            extra={
              <SegmentedControl
                size="xs"
                value={current.value}
                onChange={setFilter}
                data={filters.map((f) => ({ value: f.value, label: f.label }))}
              />
            }
          >
            预约记录
          </SectionTitle>
          <QueryState query={appointments}>
            {(rows) => {
              const list = rows.filter(current.match)
              return (
                <ResponsiveList
                  records={list}
                  rowKey={(a) => a.id}
                  noRecordsText={`没有${current.value === 'all' ? '' : current.label}的预约`}
                  rowClassName={(a) => (a.status === 'returned' ? 'qs-row-warn' : a.status === 'cancelled' || a.finished ? 'qs-row-muted' : undefined)}
                  columns={[
                    { accessor: 'no', title: '预约', render: (a) => <DocNo no={a.no} /> },
                    { accessor: 'shipmentNo', title: '发货单', render: (a) => <DocNo no={a.shipmentNo} to={`/portal/shipments/${a.shipmentId}`} /> },
                    { accessor: 'orderNo', title: '采购订单', render: (a) => <DocNo no={a.orderNo} /> },
                    { accessor: 'warehouseName', title: '收货仓' },
                    {
                      accessor: 'date',
                      title: '送货时段',
                      render: (a) => (
                        <Text fz="sm" className="qs-num">
                          {a.date} {a.slot}
                        </Text>
                      ),
                    },
                    { accessor: 'plateNo', title: '车牌 / 件数', render: (a) => <Text fz="sm">{a.plateNo} · {a.pieces}件</Text> },
                    {
                      accessor: 'status',
                      title: '状态',
                      render: (a) => (
                        <Stack gap={2}>
                          <Group gap={4} wrap="nowrap">
                            <StatusBadge kind="appointment" value={a.status} size="xs" />
                            {a.finished && (
                              <Text fz={11} c="dimmed">
                                已有收货结果
                              </Text>
                            )}
                          </Group>
                          {a.status === 'returned' && returnNote(a) && (
                            <Text fz="xs" c="red.7">
                              {returnNote(a)}
                            </Text>
                          )}
                        </Stack>
                      ),
                    },
                    {
                      accessor: 'actions',
                      title: '',
                      textAlign: 'right',
                      render: (a) => (
                        <Group gap={6} justify="flex-end" wrap="nowrap">
                          <ActionButton state={a.actions.reschedule} size="compact-sm" variant="light" onClick={() => setDialog({ kind: 'reschedule', appointment: a })}>
                            改约
                          </ActionButton>
                          <ActionButton state={a.actions.cancel} size="compact-sm" variant="default" color="red" onClick={() => setDialog({ kind: 'cancel', appointment: a })}>
                            取消
                          </ActionButton>
                        </Group>
                      ),
                    },
                  ]}
                  card={(a) => (
                    <Stack gap={6}>
                      <Group justify="space-between" wrap="nowrap">
                        <DocNo no={a.no} />
                        <StatusBadge kind="appointment" value={a.status} size="xs" />
                      </Group>
                      <Text fz="sm" className="qs-num">
                        {a.date} {a.slot} · {a.warehouseName}
                      </Text>
                      <Text fz="xs" c="dimmed">
                        发货单 <span className="qs-mono">{a.shipmentNo}</span> · {a.plateNo} · {a.pieces}件
                      </Text>
                      {a.status === 'returned' && returnNote(a) && (
                        <Alert color="red" p="xs">
                          <Text fz="sm">{returnNote(a)}</Text>
                        </Alert>
                      )}
                      {a.finished && (
                        <Text fz="xs" c="dimmed">
                          这批货已有收货结果，不能再改约或取消
                        </Text>
                      )}
                      <AppointmentHistory appointment={a} />
                      <Group gap={6} grow>
                        <ActionButton state={a.actions.reschedule} variant="light" onClick={() => setDialog({ kind: 'reschedule', appointment: a })}>
                          改约
                        </ActionButton>
                        <ActionButton state={a.actions.cancel} variant="default" color="red" onClick={() => setDialog({ kind: 'cancel', appointment: a })}>
                          取消
                        </ActionButton>
                      </Group>
                    </Stack>
                  )}
                />
              )
            }}
          </QueryState>
        </Card>
        <Note>可预约的仓库、时段、是否必须由仓库确认、爽约宽限见「21」「24」。ERP接收失败时仍可预约，仓库要等ERP通知单才能收货。</Note>
      </Stack>

      {dialog?.kind === 'appoint' && (
        <AppointmentModal
          opened
          onClose={() => setDialog(null)}
          shipment={{
            id: dialog.shipment.id,
            no: dialog.shipment.no,
            warehouseName: dialog.shipment.warehouseName,
            boxCount: dialog.shipment.boxCount,
            plateNo: dialog.shipment.plateNo,
          }}
        />
      )}
      {dialog?.kind === 'reschedule' && (
        <AppointmentModal
          opened
          onClose={() => setDialog(null)}
          appointment={dialog.appointment}
          shipment={{ id: dialog.appointment.shipmentId, no: dialog.appointment.shipmentNo, warehouseName: dialog.appointment.warehouseName }}
        />
      )}
      <ReasonModal
        opened={dialog?.kind === 'cancel'}
        onClose={() => setDialog(null)}
        title={`取消预约 · ${dialog?.kind === 'cancel' ? dialog.appointment.no : ''}`}
        label="取消原因"
        required={false}
        color="red"
        confirmLabel="取消预约"
        onSubmit={({ reason }) =>
          run(`/appointments/${dialog?.kind === 'cancel' ? dialog.appointment.id : ''}/cancel`, { reason }, { success: '预约已取消' })
        }
      />
    </>
  )
}
