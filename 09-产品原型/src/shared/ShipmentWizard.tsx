import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  EmptyState,
  Group,
  NumberInput,
  Paper,
  Radio,
  SimpleGrid,
  Stack,
  Stepper,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useMediaQuery } from '@mantine/hooks'
import { IconPackage, IconTruckOff } from '@tabler/icons-react'
import { DataTable } from 'mantine-datatable'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useAction, useApi } from '../api/hooks'
import { useEntry } from '../app/entry'
import { qtyCell, skuColumn } from '../components/columns'
import { EditableTable } from '../components/EditableTable'
import { editableColumns } from '../components/editableTable'
import { Fields } from '../components/Fields'
import { DocNo, Note, PendingTag } from '../components/marks'
import { ProxyFields, emptyProxy, type ProxyValue } from '../components/modals'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { ErrorBlock, LoadingBlock, QueryState } from '../components/QueryState'
import { fmtQty, todayStr } from '../domain/format'
import { sumBy } from '../domain/money'
import type { Shipment } from '../domain/types'
import type { ShipmentDetail, ShippableOrder } from '../domain/views'

interface LineInput {
  shipQty: number | string
  batchNo: string
  perBox: number | string
}

type ShipRow = ShippableOrder['lines'][number] & LineInput

const emptyInput: LineInput = { shipQty: '', batchNo: '', perBox: '' }

const isActive = (row: LineInput) => row.shipQty !== '' && Number(row.shipQty) !== 0

/** 本次发货不能超过可下推减去已提交未生成通知，不设超发容差（《4》§二）。 */
function lineErrors(row: ShipRow) {
  const qty = Number(row.shipQty)
  const per = Number(row.perBox)
  const active = isActive(row)
  return {
    shipQty: !active ? undefined : !Number.isInteger(qty) || qty < 0 ? '须为正整数' : qty > row.shippable ? `本次最多可发${row.shippable}` : undefined,
    batchNo: active && !row.batchNo.trim() ? '请填供应商批号' : undefined,
    perBox: active && !(Number.isInteger(per) && per >= 1) ? '请填每箱数量' : undefined,
  }
}

const hasError = (row: ShipRow) => Object.values(lineErrors(row)).some(Boolean)

function boxPlan(rows: ShipRow[]) {
  return rows
    .filter((r) => isActive(r) && !hasError(r))
    .map((r) => {
      const qty = Number(r.shipQty)
      const per = Number(r.perBox)
      const full = Math.floor(qty / per)
      const rest = qty % per
      return { ...r, qty, per, full, rest, boxes: full + (rest > 0 ? 1 : 0) }
    })
}

function OrderPicker({
  orders,
  value,
  onChange,
  locked,
  portal,
}: {
  orders: ShippableOrder[]
  value: string | null
  onChange: (id: string) => void
  locked: boolean
  portal: boolean
}) {
  const list = locked ? orders.filter((o) => o.id === value) : orders
  if (!list.length) {
    return (
      <EmptyState
        py={40}
        icon={<IconTruckOff size={26} />}
        title="没有可以发货的订单"
        description={
          portal
            ? '订单确认、ERP接收之后才能发货；已关闭或取消的订单不能发货（《3》§3.1、「19」）。'
            : '代录发货只对门户未开通的供应商。门户已开通的供应商由他们自己在门户发货（《9》§2.4）。'
        }
      />
    )
  }
  return (
    <Radio.Group value={value} onChange={onChange} aria-label="选择采购订单">
      <Stack gap="xs">
        {list.map((o) => {
          const left = sumBy(o.lines, (l) => Math.max(l.shippable, 0))
          return (
            <Radio.Card key={o.id} value={o.id} radius="md" p="sm" disabled={!o.ship.ok || locked} style={!o.ship.ok ? { opacity: 0.65 } : undefined}>
              <Group wrap="nowrap" align="flex-start" gap="sm">
                <Radio.Indicator size="sm" mt={3} disabled={!o.ship.ok} />
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Group gap="xs" justify="space-between">
                    <Group gap="xs">
                      <Text fz="sm" fw={650} className="qs-mono">
                        {o.no}
                      </Text>
                      {!portal && (
                        <Text fz="sm" c="dimmed">
                          {o.supplierName}
                        </Text>
                      )}
                    </Group>
                    <Badge variant="light" color={left > 0 ? 'blue' : 'gray'}>
                      本次可发合计 {fmtQty(left)}
                    </Badge>
                  </Group>
                  <Text fz="xs" c="dimmed" mt={2}>
                    收货仓 {o.warehouseName} · 承诺交期 <span className="qs-num">{o.promisedDate}</span> · {o.lines.length}行
                  </Text>
                  {!o.ship.ok && (
                    <Text fz="xs" c="red.7" mt={2}>
                      {o.ship.reason}
                    </Text>
                  )}
                </Box>
              </Group>
            </Radio.Card>
          )
        })}
      </Stack>
    </Radio.Group>
  )
}

function LineCards({ rows, update, showErrors }: { rows: ShipRow[]; update: (lineNo: number, patch: Partial<LineInput>) => void; showErrors: boolean }) {
  return (
    <Stack gap="sm">
      {rows.map((row) => {
        const errors = lineErrors(row)
        return (
          <Paper key={row.lineNo} withBorder radius="lg" p="sm">
            <Text fz="sm" fw={650}>
              第{row.lineNo}行 <span className="qs-mono">{row.skuCode}</span> {row.skuName}
            </Text>
            <SimpleGrid cols={3} spacing={4} my={8}>
              {[
                ['可下推', row.pushable],
                ['已提交未生成通知', row.pendingShip],
                ['本次可发', row.shippable],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <Text fz={11} c="dimmed">
                    {label}
                  </Text>
                  <Text fz="sm" className="qs-num" fw={label === '本次可发' ? 650 : undefined}>
                    {fmtQty(value as number)}
                  </Text>
                </div>
              ))}
            </SimpleGrid>
            <Stack gap="xs">
              <NumberInput
                label={`本次发货（${row.unit}）`}
                min={0}
                allowDecimal={false}
                allowNegative={false}
                inputMode="numeric"
                value={row.shipQty}
                error={errors.shipQty}
                onChange={(value) => update(row.lineNo, { shipQty: value })}
              />
              <TextInput
                label="供应商批号"
                description="供应商自己的批号，不是ERP库存批次（A13）"
                value={row.batchNo}
                error={showErrors ? errors.batchNo : undefined}
                onChange={(event) => update(row.lineNo, { batchNo: event.currentTarget.value })}
              />
              <NumberInput
                label="每箱数量"
                min={1}
                allowDecimal={false}
                allowNegative={false}
                inputMode="numeric"
                value={row.perBox}
                error={showErrors ? errors.perBox : undefined}
                onChange={(value) => update(row.lineNo, { perBox: value })}
              />
            </Stack>
          </Paper>
        )
      })}
    </Stack>
  )
}

function Wizard({ orders, existing, initialOrderId }: { orders: ShippableOrder[]; existing?: ShipmentDetail; initialOrderId: string | null }) {
  const { base, portal } = useEntry()
  const navigate = useNavigate()
  const run = useAction()
  const mobile = useMediaQuery('(max-width: 48em)')
  const proxy = !portal
  const initialOrder = orders.find((o) => o.id === initialOrderId)
  const [active, setActive] = useState(existing || initialOrder?.ship.ok ? 1 : 0)
  const [orderId, setOrderId] = useState<string | null>(initialOrder?.id ?? null)
  const [inputs, setInputs] = useState<Record<number, LineInput>>(() =>
    Object.fromEntries((existing?.lines ?? []).map((l) => [l.lineNo, { shipQty: l.qty, batchNo: l.batchNo, perBox: l.perBox }])),
  )
  const [logistics, setLogistics] = useState({
    expectedDate: (existing?.expectedDate ?? null) as string | null,
    carrier: existing?.carrier ?? '',
    waybillNo: existing?.waybillNo ?? '',
    plateNo: existing?.plateNo ?? '',
    remark: existing?.remark ?? '',
  })
  const [proxyValue, setProxyValue] = useState<ProxyValue>(emptyProxy)
  const [showErrors, setShowErrors] = useState(false)
  const [stepError, setStepError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const order = orders.find((o) => o.id === orderId)
  const rows = useMemo<ShipRow[]>(() => (order?.lines ?? []).map((l) => ({ ...l, ...(inputs[l.lineNo] ?? emptyInput) })), [order, inputs])
  const plan = boxPlan(rows)
  const totalBoxes = sumBy(plan, (p) => p.boxes)
  const totalQty = sumBy(plan, (p) => p.qty)

  const update = useCallback(
    (lineNo: number, patch: Partial<LineInput>) => setInputs((prev) => ({ ...prev, [lineNo]: { ...(prev[lineNo] ?? emptyInput), ...patch } })),
    [],
  )

  const columns = useMemo(() => {
    const col = editableColumns<ShipRow>()
    const num = (value: number, strong = false) => (
      <Text fz="sm" className="qs-num" fw={strong ? 650 : undefined} c={strong ? undefined : 'dimmed'}>
        {fmtQty(value)}
      </Text>
    )
    return [
      col.accessor('lineNo', { header: '行', meta: { width: 40 }, cell: ({ row }) => <Text fz="sm">{row.original.lineNo}</Text> }),
      col.accessor('skuCode', {
        header: 'SKU',
        cell: ({ row }) => (
          <Text fz="sm">
            <span className="qs-mono">{row.original.skuCode}</span> {row.original.skuName}
          </Text>
        ),
      }),
      col.accessor('qty', { header: '采购数量', meta: { align: 'right' }, cell: ({ row }) => num(row.original.qty) }),
      col.accessor('received', { header: '累计入库', meta: { align: 'right' }, cell: ({ row }) => num(row.original.received) }),
      col.accessor('inTransit', { header: '在途通知', meta: { align: 'right' }, cell: ({ row }) => num(row.original.inTransit) }),
      col.accessor('pendingShip', { header: '已提交未生成通知', meta: { align: 'right' }, cell: ({ row }) => num(row.original.pendingShip) }),
      col.accessor('shippable', { header: '本次可发', meta: { align: 'right' }, cell: ({ row }) => num(row.original.shippable, true) }),
      col.accessor('shipQty', {
        header: '本次发货',
        meta: { width: 120, align: 'right' },
        cell: ({ row }) => (
          <NumberInput
            size="xs"
            min={0}
            allowDecimal={false}
            allowNegative={false}
            value={row.original.shipQty}
            error={lineErrors(row.original).shipQty}
            onChange={(value) => update(row.original.lineNo, { shipQty: value })}
            styles={{ input: { textAlign: 'right' } }}
            aria-label={`第${row.original.lineNo}行本次发货`}
          />
        ),
      }),
      col.accessor('batchNo', {
        header: () => (
          <Tooltip label="供应商自己的批号，不是ERP库存批次（A13）">
            <span>供应商批号</span>
          </Tooltip>
        ),
        meta: { width: 150 },
        cell: ({ row }) => (
          <TextInput
            size="xs"
            value={row.original.batchNo}
            error={showErrors ? lineErrors(row.original).batchNo : undefined}
            onChange={(event) => update(row.original.lineNo, { batchNo: event.currentTarget.value })}
            aria-label={`第${row.original.lineNo}行供应商批号`}
          />
        ),
      }),
      col.accessor('perBox', {
        header: '每箱数量',
        meta: { width: 100, align: 'right' },
        cell: ({ row }) => (
          <NumberInput
            size="xs"
            min={1}
            allowDecimal={false}
            allowNegative={false}
            value={row.original.perBox}
            error={showErrors ? lineErrors(row.original).perBox : undefined}
            onChange={(value) => update(row.original.lineNo, { perBox: value })}
            styles={{ input: { textAlign: 'right' } }}
            aria-label={`第${row.original.lineNo}行每箱数量`}
          />
        ),
      }),
    ]
  }, [update, showErrors])

  const stepValid = (step: number): string | undefined => {
    if (step === 0) return !order ? '请选择一张订单' : !order.ship.ok ? order.ship.reason : undefined
    if (step === 1) {
      if (rows.some(hasError)) return '有发货行没填对，请按提示修改'
      if (!plan.length) return '至少填一行本次发货数量'
    }
    if (step === 3) {
      if (!logistics.expectedDate) return '请选择预计到货日期'
      if (proxy && !proxyValue.basisNote.trim()) return '请填写代录依据说明'
    }
    return undefined
  }

  const next = () => {
    const error = stepValid(active)
    setShowErrors(!!error)
    setStepError(error)
    if (!error) setActive((step) => Math.min(step + 1, 4))
  }

  const back = () => {
    setStepError(undefined)
    setActive((step) => Math.max(step - 1, 0))
  }

  const selectOrder = (id: string) => {
    setOrderId(id)
    setInputs({})
    setStepError(undefined)
  }

  const save = async (submit: boolean) => {
    if (!order) return
    setBusy(true)
    const body = {
      orderId: order.id,
      lines: plan.map((p) => ({ lineNo: p.lineNo, qty: p.qty, batchNo: p.batchNo.trim(), perBox: p.per })),
      ...logistics,
      proxy: proxy ? proxyValue : undefined,
      submit,
    }
    const success = submit ? '发货单已提交，正在推送ERP' : '发货单草稿已保存'
    const result = existing
      ? await run<Shipment>(`/shipments/${existing.id}`, body, { method: 'PUT', success })
      : await run<Shipment>('/shipments', body, { success })
    setBusy(false)
    if (result) navigate(`${base}/shipments/${result.id}`)
  }

  return (
    <Stack gap="lg">
      <Stepper active={active} onStepClick={setActive} allowNextStepsSelect={false} size="sm">
        <Stepper.Step label="选订单" />
        <Stepper.Step label="数量和批号" />
        <Stepper.Step label="装箱" />
        <Stepper.Step label="物流" />
        <Stepper.Step label="提交" />
      </Stepper>

      {active === 0 && (
        <Card>
          <SectionTitle>选择采购订单</SectionTitle>
          {initialOrderId && !initialOrder && (
            <Alert color="orange" mb="sm" p="xs">
              <Text fz="sm">链接里的订单现在不能发货，或者不属于当前身份，请重新选择。</Text>
            </Alert>
          )}
          <OrderPicker orders={orders} value={orderId} onChange={selectOrder} locked={!!existing} portal={portal} />
          <Note>一张发货单只对应一张订单、一个收货仓「07」。未确认的订单能否发货见「19」。</Note>
        </Card>
      )}

      {active === 1 && order && (
        <Card>
          <SectionTitle extra={<Text fz="xs" c="dimmed">订单 {order.no} · 收货仓 {order.warehouseName}</Text>}>本次发货数量和供应商批号</SectionTitle>
          {mobile ? (
            <LineCards rows={rows} update={update} showErrors={showErrors} />
          ) : (
            <EditableTable data={rows} columns={columns} getRowId={(row) => String(row.lineNo)} minWidth={1080} />
          )}
          <Stack gap={4} mt="sm">
            <Note>本次可发 = 可下推 − 已提交未生成通知；可下推 = 采购数量 − 累计入库 − 在途通知。超出时这里报错，接口也会拒绝，不设超发容差（《4》§二）。</Note>
            <Note>只填每箱数量，下一步由系统算整箱和尾箱。不发的行留空。</Note>
          </Stack>
        </Card>
      )}

      {active === 2 && (
        <Card>
          <SectionTitle extra={<Badge variant="light">共{totalBoxes}箱 · {fmtQty(totalQty)}件</Badge>}>装箱预览</SectionTitle>
          <DataTable
            records={plan}
            idAccessor="lineNo"
            withTableBorder
            borderRadius="md"
            columns={[
              { accessor: 'lineNo', title: '行', width: 48 },
              skuColumn(),
              { accessor: 'qty', title: '本次发货', textAlign: 'right', render: (p) => qtyCell(p.qty) },
              { accessor: 'per', title: '每箱数量', textAlign: 'right', render: (p) => qtyCell(p.per) },
              {
                accessor: 'full',
                title: '整箱 / 尾箱',
                render: (p) => (
                  <Text fz="sm" className="qs-num">
                    {p.full}箱 × {p.per}
                    {p.rest > 0 ? ` + 1箱 × ${p.rest}` : ''}
                  </Text>
                ),
              },
              { accessor: 'boxes', title: '箱数', textAlign: 'right', render: (p) => qtyCell(p.boxes) },
              { accessor: 'batchNo', title: '供应商批号', render: (p) => <Text fz="sm" className="qs-mono">{p.batchNo}</Text> },
            ]}
          />
          <Group gap="xs" mt="sm" c="dimmed">
            <IconPackage size={14} />
            <Text fz="xs">一箱一种SKU，尾数单独成一箱，箱码数量之和等于发货数量（《6》§三）。箱码保存后生成，提交前可以重新装箱、重打。</Text>
          </Group>
          {order?.warehouseName.includes('电商仓') && (
            <Text fz="xs" c="dimmed" mt={4}>
              {order.warehouseName}的箱唛另有平台规则 <PendingTag n={22} />
            </Text>
          )}
        </Card>
      )}

      {active === 3 && (
        <Card>
          <SectionTitle>物流信息</SectionTitle>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <DateInput
              label="预计到货日期"
              withAsterisk
              minDate={todayStr()}
              value={logistics.expectedDate}
              onChange={(expectedDate) => setLogistics((prev) => ({ ...prev, expectedDate }))}
            />
            <TextInput label="承运商" placeholder="选填" value={logistics.carrier} onChange={(event) => setLogistics((prev) => ({ ...prev, carrier: event.currentTarget.value }))} />
            <TextInput label="运单号" placeholder="选填" value={logistics.waybillNo} onChange={(event) => setLogistics((prev) => ({ ...prev, waybillNo: event.currentTarget.value }))} />
            <TextInput label="车牌号" placeholder="选填，预约时也可以填" value={logistics.plateNo} onChange={(event) => setLogistics((prev) => ({ ...prev, plateNo: event.currentTarget.value }))} />
          </SimpleGrid>
          <Textarea label="备注" mt="sm" minRows={2} value={logistics.remark} onChange={(event) => setLogistics((prev) => ({ ...prev, remark: event.currentTarget.value }))} />
          {proxy && (
            <Box mt="md">
              <ProxyFields value={proxyValue} onChange={setProxyValue} error={showErrors && !proxyValue.basisNote.trim() ? '请填写代录依据说明' : undefined} />
            </Box>
          )}
        </Card>
      )}

      {active === 4 && order && (
        <Card>
          <SectionTitle>确认并提交</SectionTitle>
          <Fields
            items={[
              { label: 'SRM采购订单', value: <DocNo no={order.no} to={`${base}/orders/${order.id}`} /> },
              { label: '供应商', value: order.supplierName, hidden: portal },
              { label: '收货仓', value: order.warehouseName },
              { label: '预计到货', value: logistics.expectedDate },
              { label: '发货行', value: `${plan.length}行` },
              { label: '发货数量', value: fmtQty(totalQty) },
              { label: '箱数', value: `${totalBoxes}箱` },
              { label: '承运商 / 运单号', value: [logistics.carrier, logistics.waybillNo].filter(Boolean).join(' / ') },
              { label: '代录依据', value: `${proxyValue.basisType}：${proxyValue.basisNote}`, hidden: !proxy, span: 2 },
            ]}
          />
          <Alert color="blue" variant="light" mt="md" p="sm">
            <Text fz="sm">提交后推送ERP。ERP按发货单生成采购收货通知单并下发WMS，那张通知单才是收货指令（《5》§五）。提交后箱码只能补打或作废换码。</Text>
          </Alert>
        </Card>
      )}

      {stepError && (
        <Text c="red" fz="sm">
          {stepError}
        </Text>
      )}

      <Box className={portal ? 'qs-sticky-actions' : undefined}>
        <Group justify="space-between" gap="xs">
          <Group gap="xs">
            {active > 0 && (
              <Button variant="default" onClick={back}>
                上一步
              </Button>
            )}
            {active === 0 && (
              <Button variant="default" component={Link} to={existing ? `${base}/shipments/${existing.id}` : `${base}/shipments`}>
                放弃
              </Button>
            )}
          </Group>
          <Group gap="xs">
            {active < 4 && <Button onClick={next}>下一步</Button>}
            {active === 4 && (
              <>
                <Button variant="light" loading={busy} onClick={() => save(false)}>
                  保存草稿
                </Button>
                <Button loading={busy} onClick={() => save(true)}>
                  提交发货单
                </Button>
              </>
            )}
          </Group>
        </Group>
      </Box>
    </Stack>
  )
}

/** P05 新建发货单 / B14 代录发货：分步填写，本次可发实时校验（《4》§二、《6》§三）。 */
export function ShipmentWizardPage() {
  const { base, portal } = useEntry()
  const [params] = useSearchParams()
  const id = params.get('id')
  const existing = useApi<ShipmentDetail>(id ? `/shipments/${id}` : null)
  const orders = useApi<ShippableOrder[]>('/shippable-orders')
  const title = id ? '编辑发货单草稿' : portal ? '新建发货单' : '代录发货'

  const body = () => {
    if (id && existing.isPending) return <LoadingBlock />
    if (id && existing.isError) return <ErrorBlock error={existing.error} />
    if (existing.data && existing.data.status !== 'draft') {
      return (
        <Alert color="gray" title="只有草稿可以编辑">
          这张发货单已经{existing.data.status === 'submitted' ? '提交' : '取消'}。提交后箱码用补打、作废换码处理。
        </Alert>
      )
    }
    return (
      <QueryState query={orders}>
        {(list) => <Wizard key={id ?? 'new'} orders={list} existing={existing.data} initialOrderId={existing.data?.orderId ?? params.get('order')} />}
      </QueryState>
    )
  }

  return (
    <>
      <PageHeader
        back={id ? { to: `${base}/shipments/${id}`, label: '发货单详情' } : { to: `${base}/shipments`, label: '发货单' }}
        title={title}
        subtitle={portal ? '选订单、填数量和供应商批号、装箱、填物流，最后提交。' : '只对门户未开通的供应商。数量和超量校验与供应商自己操作相同，代录依据必填（《9》§2.4）。'}
      />
      {body()}
    </>
  )
}
