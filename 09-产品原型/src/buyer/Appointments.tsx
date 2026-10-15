import { Anchor, Badge, Card, Group, MultiSelect, Paper, SegmentedControl, Select, SimpleGrid, Stack, Switch, Text } from '@mantine/core'
import { useState } from 'react'
import { useAction, useApi, useMeta } from '../api/hooks'
import { ActionButton } from '../components/ActionButton'
import { DocNo, Note, ProxyBadge } from '../components/marks'
import { ReasonModal } from '../components/modals'
import { PageHeader } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { StatusBadge } from '../components/StatusBadge'
import { useUrlList, useUrlValue } from '../components/urlState'
import { addDays, parseBjDate, todayStr } from '../domain/format'
import { statusOptions } from '../domain/labels'
import type { AppointmentView } from '../domain/views'
import { AppointmentHistory, AppointmentModal } from '../shared/shipmentParts'
import { useConfig } from '../stores/config'

const statusTone: Record<AppointmentView['status'], string> = {
  pending: 'var(--mantine-color-orange-5)',
  confirmed: 'var(--mantine-color-green-6)',
  booked: 'var(--mantine-color-green-6)',
  returned: 'var(--mantine-color-red-6)',
  cancelled: 'var(--mantine-color-gray-4)',
}

function dayLabel(date: string) {
  const today = todayStr()
  const suffix = date === today ? ' · 今天' : date === addDays(today, 1) ? ' · 明天' : date < today ? ' · 已过' : ''
  return `${date} ${parseBjDate(date).format('ddd')}${suffix}`
}

type Dialog = { kind: 'return' | 'cancel' | 'reschedule'; appointment: AppointmentView } | null

function AppointmentItem({ appointment, onDialog }: { appointment: AppointmentView; onDialog: (dialog: Dialog) => void }) {
  const run = useAction()
  const [history, setHistory] = useState(false)
  const a = appointment.actions
  return (
    <Paper p="sm" radius="md" withBorder style={{ borderLeft: `3px solid ${statusTone[appointment.status]}` }} className={appointment.status === 'cancelled' ? 'qs-row-muted' : undefined}>
      <Stack gap={4}>
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Text fz="sm" fw={650} className="qs-num">
            {appointment.slot}
          </Text>
          <StatusBadge kind="appointment" value={appointment.status} size="xs" />
        </Group>
        <Group gap={6} wrap="nowrap">
          <Text fz="sm" truncate="end">
            {appointment.supplierName}
          </Text>
          <ProxyBadge info={appointment.proxy} />
        </Group>
        <Text fz="xs" c="dimmed">
          <DocNo no={appointment.shipmentNo} to={`/buyer/shipments/${appointment.shipmentId}`} size="xs" /> · 订单 <span className="qs-mono">{appointment.orderNo}</span>
        </Text>
        <Text fz="xs" c="dimmed">
          {appointment.plateNo} · {appointment.pieces}件 · <span className="qs-num">{appointment.driverPhone}</span>
        </Text>
        <Group gap={6} mt={4} wrap="wrap">
          <ActionButton state={a.confirm} size="compact-xs" onClick={() => run(`/appointments/${appointment.id}/confirm`, {}, { success: '已确认预约' })}>
            确认
          </ActionButton>
          <ActionButton state={a.return} size="compact-xs" variant="light" color="red" onClick={() => onDialog({ kind: 'return', appointment })}>
            退回改约
          </ActionButton>
          <ActionButton state={a.reschedule} size="compact-xs" variant="light" color="cyan" onClick={() => onDialog({ kind: 'reschedule', appointment })}>
            代录改约
          </ActionButton>
          <ActionButton state={a.cancel} size="compact-xs" variant="default" onClick={() => onDialog({ kind: 'cancel', appointment })}>
            代录取消
          </ActionButton>
          <Anchor component="button" type="button" fz={11} c="dimmed" onClick={() => setHistory((v) => !v)}>
            {history ? '收起记录' : `记录 ${appointment.history.length}`}
          </Anchor>
        </Group>
        {history && <AppointmentHistory appointment={appointment} />}
      </Stack>
    </Paper>
  )
}

/** B15 预约看板：按日期、仓库看预约。仓储确认或退回改约；未开通门户的供应商由采购代录改约、取消。 */
export function AppointmentBoard() {
  const query = useApi<AppointmentView[]>('/appointments')
  const warehouses = useMeta().data?.warehouses ?? []
  const needsConfirm = useConfig((s) => s.config.appointmentNeedsConfirm)
  const run = useAction()
  const [warehouse, setWarehouse] = useUrlValue('warehouse')
  const [status, setStatus] = useUrlList('status')
  const [range, setRange] = useUrlValue('range', 'upcoming')
  const [pendingOnly, setPendingOnly] = useUrlValue('pending')
  const [dialog, setDialog] = useState<Dialog>(null)
  const today = todayStr()

  return (
    <>
      <PageHeader
        title="预约看板"
        subtitle={`供应商在门户预约送货。当前演示：${needsConfirm ? '预约须仓库人工确认，仓储角色确认或退回改约' : '提交即已预约，不需仓库确认'}（「24」）。`}
      />
      <Group gap="sm" mb="md" align="flex-end" wrap="wrap">
        <Select
          label="收货仓"
          placeholder="全部"
          clearable
          data={warehouses.map((w) => ({ value: w.code, label: w.name }))}
          value={warehouse || null}
          onChange={(value) => setWarehouse(value ?? '')}
          w={{ base: '100%', xs: 200 }}
        />
        <MultiSelect label="状态" placeholder="全部" data={statusOptions('appointment')} value={status} onChange={setStatus} clearable w={{ base: '100%', xs: 260 }} />
        <SegmentedControl
          value={range}
          onChange={setRange}
          data={[
            { value: 'upcoming', label: '今天及以后' },
            { value: 'all', label: '全部日期' },
          ]}
        />
        <Switch label="只看待仓库确认" checked={pendingOnly === '1'} onChange={(event) => setPendingOnly(event.currentTarget.checked ? '1' : '')} mb={6} />
      </Group>
      <QueryState query={query}>
        {(appointments) => {
          const rows = appointments.filter(
            (a) =>
              (!warehouse || a.warehouseCode === warehouse) &&
              (!status.length || status.includes(a.status)) &&
              (range === 'all' || a.date >= today) &&
              (pendingOnly !== '1' || a.status === 'pending'),
          )
          const dates = [...new Set(rows.map((a) => a.date))].sort()
          const columns = warehouses.filter((w) => !warehouse || w.code === warehouse)
          if (!dates.length) {
            return (
              <Card>
                <Text fz="sm" c="dimmed" ta="center" py="lg">
                  没有符合条件的预约
                </Text>
              </Card>
            )
          }
          return (
            <Stack gap="md">
              {dates.map((date) => {
                const ofDay = rows.filter((a) => a.date === date)
                const pending = ofDay.filter((a) => a.status === 'pending').length
                return (
                  <Card key={date} className={date < today ? 'qs-row-muted' : undefined}>
                    <Group justify="space-between" mb="sm">
                      <Text className="qs-section-title">{dayLabel(date)}</Text>
                      <Group gap={6}>
                        <Badge variant="light" color="gray">
                          {ofDay.length}个预约
                        </Badge>
                        {pending > 0 && (
                          <Badge variant="light" color="orange">
                            {pending}个待确认
                          </Badge>
                        )}
                      </Group>
                    </Group>
                    <SimpleGrid cols={{ base: 1, sm: Math.min(columns.length, 2), lg: Math.min(columns.length, 3) }} spacing="md">
                      {columns.map((w) => {
                        const items = ofDay.filter((a) => a.warehouseCode === w.code)
                        return (
                          <Stack key={w.code} gap="xs">
                            <Text fz="xs" fw={650} c="dimmed">
                              {w.name}
                              {w.note ? ` · ${w.note}` : ''}
                            </Text>
                            {items.length ? (
                              items.map((a) => <AppointmentItem key={a.id} appointment={a} onDialog={setDialog} />)
                            ) : (
                              <Text fz="xs" c="dimmed">
                                -
                              </Text>
                            )}
                          </Stack>
                        )
                      })}
                    </SimpleGrid>
                  </Card>
                )
              })}
            </Stack>
          )
        }}
      </QueryState>
      <Note>可预约的仓库、时段、爽约宽限见「21」「24」；爽约不计算。看板按北京时间分日。</Note>

      <ReasonModal
        opened={dialog?.kind === 'return'}
        onClose={() => setDialog(null)}
        title={`退回改约 · ${dialog?.appointment.no ?? ''}`}
        label="退回原因"
        placeholder="例如：当天该时段卸货口已满，请改到下午"
        color="red"
        confirmLabel="退回"
        description="退回后供应商在门户改约，改约后重新等仓库确认。"
        onSubmit={({ reason }) => run(`/appointments/${dialog!.appointment.id}/return`, { note: reason }, { success: '已退回改约' })}
      />
      <ReasonModal
        opened={dialog?.kind === 'cancel'}
        onClose={() => setDialog(null)}
        title={`代录取消预约 · ${dialog?.appointment.no ?? ''}`}
        label="取消原因"
        required={false}
        proxy
        color="red"
        confirmLabel="取消预约"
        onSubmit={({ reason, proxy }) => run(`/appointments/${dialog!.appointment.id}/cancel`, { reason, proxy }, { success: '已取消预约' })}
      />
      {dialog?.kind === 'reschedule' && (
        <AppointmentModal
          opened
          proxy
          onClose={() => setDialog(null)}
          appointment={dialog.appointment}
          shipment={{ id: dialog.appointment.shipmentId, no: dialog.appointment.shipmentNo, warehouseName: dialog.appointment.warehouseName }}
        />
      )}
    </>
  )
}
