import { Alert, Badge, Button, Group, Modal, SegmentedControl, Select, Stack, Text, TextInput, Textarea, Timeline } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { IconCalendarEvent, IconCheck, IconPackage, IconTruckDelivery, IconX } from '@tabler/icons-react'
import { DataTable, type DataTableColumn } from 'mantine-datatable'
import { useState, type ReactNode } from 'react'
import { useAction } from '../api/hooks'
import { ActionButton, LinkAction } from '../components/ActionButton'
import { moneyColumns, numCell, qtyCell, skuColumn } from '../components/columns'
import { DocNo, LockHint, Note, ProxyBadge } from '../components/marks'
import { ProxyFields, ReasonModal } from '../components/modals'
import { StatusBadge } from '../components/StatusBadge'
import { EMPTY, fmtDate, fmtDateTime, fmtMoney, fmtQty, todayStr } from '../domain/format'
import { emptyProxy, type ProxyValue } from '../domain/labels'
import type { ChangeItem, ConfirmRecord, OrderLine } from '../domain/types'
import type { KittingView, LineQty, OrderView, SuggestionView } from '../domain/views'

type LineRow = OrderLine & Partial<LineQty>

/** 订单明细。供应商视角数量、单价旁有锁：不能改，有异议只能拒绝。 */
export function OrderLinesTable({ order, supplier = false }: { order: OrderView; supplier?: boolean }) {
  const rows: LineRow[] = order.lines.map((line) => ({ ...line, ...order.lineQty.find((q) => q.lineNo === line.lineNo), qty: line.qty }))
  const columns: DataTableColumn<LineRow>[] = [
    { accessor: 'lineNo', title: '行', width: 48 },
    skuColumn<LineRow>(),
    { accessor: 'unit', title: '单位', width: 56 },
    {
      accessor: 'qty',
      title: supplier ? (
        <>
          采购数量
          <LockHint />
        </>
      ) : (
        '采购数量'
      ),
      textAlign: 'right',
      render: (r) => numCell(fmtQty(r.qty), true),
    },
    { accessor: 'received', title: '累计入库', textAlign: 'right', render: (r) => qtyCell(r.received) },
    { accessor: 'inTransit', title: '在途通知', textAlign: 'right', render: (r) => qtyCell(r.inTransit) },
    { accessor: 'pushable', title: '可下推', textAlign: 'right', render: (r) => qtyCell(r.pushable, r.pushable ? 'jade.8' : 'dimmed') },
    ...moneyColumns<LineRow>(supplier),
    {
      accessor: 'priceSource',
      title: '价格来源',
      hidden: supplier,
      render: (r) => (
        <Text fz="xs" c="dimmed">
          {r.priceSource}
        </Text>
      ),
    },
  ]
  return (
    <Stack gap="xs">
      <DataTable records={rows} columns={columns} idAccessor="lineNo" withTableBorder borderRadius="md" verticalSpacing="xs" />
      <Group gap="lg" justify="flex-end" fz="sm">
        <Text fz="sm" c="dimmed">
          合计 数量 <b className="qs-num">{fmtQty(order.totals.qty)}</b>
        </Text>
        <Text fz="sm" c="dimmed">
          价税合计 <b className="qs-num">{fmtMoney(order.totals.amount)}</b>
        </Text>
        <Text fz="sm" c="dimmed">
          税额 <span className="qs-num">{fmtMoney(order.totals.tax)}</span>
        </Text>
        <Text fz="sm" c="dimmed">
          金额 <span className="qs-num">{fmtMoney(order.totals.netAmount)}</span>
        </Text>
      </Group>
      <Note>可下推 = 采购数量 − 累计入库 − 在途通知，和ERP采购订单字段同名。发货不超过可下推，不设容差（《4》§二）。</Note>
    </Stack>
  )
}

/** 变更已在SRM接受、ERP还没更新时，订单头同时显示当前有效值和待生效的新值（《9》§2.1）。 */
export function PendingEffectAlert({ order, changeLink }: { order: OrderView; changeLink?: string }) {
  const effect = order.pendingEffect
  if (!effect) return null
  return (
    <Alert color="violet" variant="light" title="SRM已接受、ERP尚未更新" icon={<IconCalendarEvent size={18} />}>
      <Stack gap={4}>
        <Text fz="sm">
          {effect.changeNo ? (
            <>
              订单变更 <DocNo no={effect.changeNo} to={changeLink} /> 正在
              {effect.status === 'failed' ? '等待重推（上次推送失败）' : '推送ERP'}。
            </>
          ) : (
            '采购方的订单变更正在同步ERP。'
          )}
          推送成功之前，以当前有效值为准。
        </Text>
        {effect.items.map((item, index) => (
          <Text key={index} fz="sm">
            {item.label}：当前有效 <b>{String(item.before)}</b>，待生效 <b>{String(item.after)}</b>
          </Text>
        ))}
      </Stack>
    </Alert>
  )
}

export function ConfirmationTimeline({ records }: { records: ConfirmRecord[] }) {
  if (!records.length) return <Text fz="sm" c="dimmed">还没有下发或确认记录</Text>
  return (
    <Timeline bulletSize={18} lineWidth={2} active={records.length}>
      {records.map((record) => (
        <Timeline.Item
          key={record.id}
          color={record.action === '拒绝接单' ? 'red' : record.action === '确认接单' ? 'green' : 'gray'}
          title={
            <Group gap={6}>
              <Text fz="sm" fw={600}>
                {record.action}
              </Text>
              <ProxyBadge info={record.proxy} />
            </Group>
          }
        >
          <Text fz="xs" c="dimmed">
            {record.by} · {fmtDateTime(record.at)}
          </Text>
          {record.reason && <Text fz="sm">原因：{record.reason}</Text>}
        </Timeline.Item>
      ))}
    </Timeline>
  )
}

export function SuggestionTable({
  rows,
  showOrder = false,
  orderBase,
  actions,
}: {
  rows: SuggestionView[]
  showOrder?: boolean
  orderBase?: string
  actions?: (row: SuggestionView) => ReactNode
}) {
  return (
    <DataTable
      records={rows}
      idAccessor="id"
      withTableBorder
      borderRadius="md"
      minHeight={rows.length ? undefined : 140}
      noRecordsText="没有交期建议"
      columns={[
        { accessor: 'no', title: '建议单号', render: (r) => <DocNo no={r.no} /> },
        { accessor: 'orderNo', title: '采购订单', hidden: !showOrder, render: (r) => <DocNo no={r.orderNo} to={orderBase ? `${orderBase}/${r.orderId}` : undefined} /> },
        { accessor: 'supplierName', title: '供应商', hidden: !showOrder },
        {
          accessor: 'suggestedDate',
          title: '交期',
          render: (r) => (
            <Stack gap={0}>
              <Text fz="sm" className="qs-num">
                {r.currentDate} → <b>{r.suggestedDate}</b>
              </Text>
              <Text fz="xs" c={r.delayDays > 0 ? 'orange.8' : 'teal.8'}>
                {r.delayDays > 0 ? `推迟${r.delayDays}天` : `提前${-r.delayDays}天`}
              </Text>
            </Stack>
          ),
        },
        { accessor: 'reason', title: '原因', render: (r) => <Text fz="sm">{r.reason}</Text> },
        {
          accessor: 'submittedAt',
          title: '提交',
          render: (r) => (
            <Stack gap={2}>
              <Group gap={4}>
                <Text fz="xs">{r.submittedBy}</Text>
                <ProxyBadge info={r.proxy} />
              </Group>
              <Text fz="xs" c="dimmed" className="qs-num">
                {fmtDateTime(r.submittedAt)}
              </Text>
            </Stack>
          ),
        },
        { accessor: 'status', title: '状态', render: (r) => <StatusBadge kind="suggestion" value={r.status} /> },
        {
          accessor: 'handleNote',
          title: '处理',
          render: (r) =>
            r.handledBy ? (
              <Stack gap={0}>
                <Text fz="xs">
                  {r.handledBy} · {fmtDateTime(r.handledAt)}
                </Text>
                {r.handleNote && (
                  <Text fz="xs" c="dimmed">
                    {r.handleNote}
                  </Text>
                )}
              </Stack>
            ) : (
              <Text fz="xs">{EMPTY}</Text>
            ),
        },
        { accessor: 'actions', title: '', hidden: !actions, textAlign: 'right', render: (r) => actions?.(r) },
      ]}
    />
  )
}

export function KittingTable({
  rows,
  showOrder = false,
  orderBase,
  actions,
}: {
  rows: KittingView[]
  showOrder?: boolean
  orderBase?: string
  actions?: (row: KittingView) => ReactNode
}) {
  return (
    <DataTable
      records={rows}
      idAccessor="id"
      withTableBorder
      borderRadius="md"
      minHeight={rows.length ? undefined : 140}
      noRecordsText="还没有齐套反馈"
      rowClassName={(r) => (r.status === '缺料' && !r.review ? 'qs-row-warn' : '')}
      columns={[
        { accessor: 'orderNo', title: '采购订单', hidden: !showOrder, render: (r) => <DocNo no={r.orderNo} to={orderBase ? `${orderBase}/${r.orderId}` : undefined} /> },
        { accessor: 'supplierName', title: '供应商', hidden: !showOrder },
        { accessor: 'lineNo', title: '订单行', render: (r) => <Text fz="sm">第{r.lineNo}行 {r.skuName}</Text> },
        { accessor: 'nodeName', title: '节点' },
        {
          accessor: 'status',
          title: '齐套',
          render: (r) => (
            <Badge color={r.status === '缺料' ? 'red' : 'green'} variant="light">
              {r.status}
            </Badge>
          ),
        },
        {
          accessor: 'materialName',
          title: '缺料和预计到料',
          render: (r) =>
            r.status === '缺料' ? (
              <Stack gap={0}>
                <Text fz="sm">{r.materialName}</Text>
                <Text fz="xs" c="dimmed">
                  预计 {fmtDate(r.expectedDate)} 到料
                </Text>
              </Stack>
            ) : (
              <Text fz="sm">{EMPTY}</Text>
            ),
        },
        { accessor: 'impact', title: '影响', render: (r) => <Text fz="sm">{r.impact || EMPTY}</Text> },
        {
          accessor: 'reportedAt',
          title: '反馈',
          render: (r) => (
            <Stack gap={2}>
              <Group gap={4}>
                <Text fz="xs">{r.reportedBy}</Text>
                <ProxyBadge info={r.proxy} />
              </Group>
              <Text fz="xs" c="dimmed" className="qs-num">
                {fmtDateTime(r.reportedAt)}
              </Text>
            </Stack>
          ),
        },
        {
          accessor: 'review',
          title: '品质复核',
          render: (r) =>
            r.review ? (
              <Stack gap={0}>
                <Text fz="xs">
                  {r.review.by} · {fmtDateTime(r.review.at)}
                </Text>
                <Text fz="xs" c="dimmed">
                  {r.review.note}
                </Text>
              </Stack>
            ) : (
              <Text fz="xs">{r.status === '缺料' ? '待复核' : EMPTY}</Text>
            ),
        },
        { accessor: 'actions', title: '', hidden: !actions, textAlign: 'right', render: (r) => actions?.(r) },
      ]}
    />
  )
}

interface OrderModalProps {
  order: OrderView
  opened: boolean
  onClose: () => void
  proxy?: boolean
}

export function SuggestionModal({ order, opened, onClose, proxy }: OrderModalProps) {
  const run = useAction()
  const [proxyValue, setProxyValue] = useState<ProxyValue>(emptyProxy)
  const [proxyError, setProxyError] = useState<string>()
  const form = useForm({
    initialValues: { suggestedDate: null as string | null, reason: '' },
    validate: {
      suggestedDate: (value) => (!value ? '请选择建议交期' : value === order.promisedDate ? '和当前承诺交期相同' : null),
      reason: (value) => (value.trim() ? null : '请写明原因'),
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
    const result = await run(
      `/orders/${order.id}/suggestions`,
      { suggestedDate: values.suggestedDate, reason: values.reason.trim(), proxy: proxy ? proxyValue : undefined },
      { success: '交期建议已提交，等采购处理' },
    )
    if (result !== undefined) close()
  })
  return (
    <Modal opened={opened} onClose={close} title={proxy ? '代录交期建议' : '提交交期建议'} size="lg">
      <form onSubmit={submit}>
        <Stack gap="sm">
          <Text fz="sm">
            当前承诺交期 <b className="qs-num">{order.promisedDate}</b>。建议只是申请：采购接受后生成订单变更，推送ERP成功才算新交期；驳回则交期不变。同一订单可以提多条。
          </Text>
          <DateInput label="建议交期" withAsterisk minDate={todayStr()} {...form.getInputProps('suggestedDate')} />
          <Textarea label="原因" withAsterisk placeholder="例如：主料到厂推迟，组装排产顺延" minRows={3} {...form.getInputProps('reason')} />
          {proxy && <ProxyFields value={proxyValue} onChange={setProxyValue} error={proxyError} />}
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={close}>
              取消
            </Button>
            <Button type="submit" color="violet">
              提交建议
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

export function KittingModal({ order, opened, onClose, proxy }: OrderModalProps) {
  const run = useAction()
  const [proxyValue, setProxyValue] = useState<ProxyValue>(emptyProxy)
  const [proxyError, setProxyError] = useState<string>()
  const form = useForm({
    initialValues: {
      lineNo: String(order.lines[0]?.lineNo ?? 1),
      nodeName: '',
      status: '已齐套' as '已齐套' | '缺料',
      materialName: '',
      expectedDate: null as string | null,
      impact: '',
    },
    validate: {
      nodeName: (value) => (value.trim() ? null : '请填写节点名称'),
      materialName: (value, values) => (values.status === '缺料' && !value.trim() ? '缺料时请写缺什么料' : null),
      expectedDate: (value, values) => (values.status === '缺料' && !value ? '缺料时请填预计到料日期' : null),
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
    const shortage = values.status === '缺料'
    const result = await run(
      `/orders/${order.id}/kitting`,
      {
        lineNo: Number(values.lineNo),
        nodeName: values.nodeName.trim(),
        status: values.status,
        materialName: shortage ? values.materialName.trim() : undefined,
        expectedDate: shortage ? values.expectedDate : undefined,
        impact: values.impact.trim() || undefined,
        proxy: proxy ? proxyValue : undefined,
      },
      { success: '齐套情况已反馈' },
    )
    if (result !== undefined) close()
  })
  const shortage = form.values.status === '缺料'
  return (
    <Modal opened={opened} onClose={close} title={proxy ? '代录齐套反馈' : '齐套反馈'} size="lg">
      <form onSubmit={submit}>
        <Stack gap="sm">
          <Select
            label="订单行"
            data={order.lines.map((l) => ({ value: String(l.lineNo), label: `第${l.lineNo}行 ${l.skuCode} ${l.skuName}` }))}
            {...form.getInputProps('lineNo')}
          />
          <TextInput label="节点名称" withAsterisk placeholder="自由填写，例如：主料到厂、组装完成" description={<Note icon={false}>节点清单和必报项未定「20」</Note>} {...form.getInputProps('nodeName')} />
          <div>
            <Text fz="sm" fw={500} mb={4}>
              齐套情况
            </Text>
            <SegmentedControl data={['已齐套', '缺料']} color={shortage ? 'red' : 'green'} {...form.getInputProps('status')} />
          </div>
          {shortage && (
            <>
              <TextInput label="缺什么料" withAsterisk placeholder="例如：电芯、外壳" {...form.getInputProps('materialName')} />
              <DateInput label="预计到料日期" withAsterisk minDate={todayStr()} {...form.getInputProps('expectedDate')} />
            </>
          )}
          <Textarea label="影响说明" placeholder="对交期有没有影响，影响多少" {...form.getInputProps('impact')} />
          {shortage && <Note>缺料会进入交付预警，品质可以复核。预警只提醒，不自动改单、关单（《3》§3.2）。</Note>}
          {proxy && <ProxyFields value={proxyValue} onChange={setProxyValue} error={proxyError} />}
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={close}>
              取消
            </Button>
            <Button type="submit">提交反馈</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

/**
 * 接单、拒绝、交期建议、齐套反馈、去发货。门户里供应商自己操作；
 * 工作台里只对门户未开通的供应商出现，由采购代录（proxy）。
 */
export function OrderRespondActions({ order, proxy = false, shipTo, size }: { order: OrderView; proxy?: boolean; shipTo: string; size?: 'sm' | 'md' }) {
  const run = useAction()
  const [modal, setModal] = useState<'confirm' | 'refuse' | 'suggest' | 'kitting' | null>(null)
  const close = () => setModal(null)
  const prefix = proxy ? '代录' : ''
  const a = order.actions
  return (
    <>
      <ActionButton state={a.confirm} size={size} leftSection={<IconCheck size={16} />} onClick={() => setModal('confirm')}>
        {prefix}确认接单
      </ActionButton>
      <ActionButton state={a.refuse} size={size} color="red" variant="light" leftSection={<IconX size={16} />} onClick={() => setModal('refuse')}>
        {prefix}拒绝接单
      </ActionButton>
      <ActionButton state={a.suggest} size={size} color="violet" variant="light" leftSection={<IconCalendarEvent size={16} />} onClick={() => setModal('suggest')}>
        {prefix}交期建议
      </ActionButton>
      <ActionButton state={a.kitting} size={size} variant="default" leftSection={<IconPackage size={16} />} onClick={() => setModal('kitting')}>
        {prefix}齐套反馈
      </ActionButton>
      <LinkAction state={a.ship} to={shipTo} size={size} variant="light" leftSection={<IconTruckDelivery size={16} />}>
        {prefix}发货
      </LinkAction>

      <ReasonModal
        opened={modal === 'confirm'}
        onClose={close}
        title={`${prefix}确认接单`}
        label={null}
        proxy={proxy}
        confirmLabel="按订单接单"
        description={
          <Stack gap="xs">
            <Text fz="sm">
              订单 <DocNo no={order.no} />，承诺交期 <b className="qs-num">{order.promisedDate}</b>，共{order.lines.length}行，价税合计{' '}
              <b className="qs-num">{fmtMoney(order.totals.amount)}</b>。
            </Text>
            <Alert color="gray" variant="light" p="xs">
              <Text fz="sm" fw={600}>
                接单方式：按订单接单
              </Text>
              <Text fz="xs" c="dimmed" mt={2}>
                数量、单价、交期以订单为准，不提供带条件接受。对数量或价格有异议，请拒绝并写明原因；对交期有异议，可以先提交交期建议。
              </Text>
            </Alert>
            <Note>超过24小时未确认不会自动视为接受「19」</Note>
          </Stack>
        }
        onSubmit={({ proxy: proxyValue }) => run(`/orders/${order.id}/confirm`, { proxy: proxyValue }, { success: '已确认接单' })}
      />
      <ReasonModal
        opened={modal === 'refuse'}
        onClose={close}
        title={`${prefix}拒绝接单`}
        label="拒绝原因"
        placeholder="例如：单价和报价不一致；数量超出产能"
        color="red"
        proxy={proxy}
        confirmLabel="拒绝接单"
        description="拒绝后采购会看到原因。供应商不能在门户里改数量和价格。"
        onSubmit={({ reason, proxy: proxyValue }) => run(`/orders/${order.id}/refuse`, { reason, proxy: proxyValue }, { success: '已拒绝接单' })}
      />
      <SuggestionModal order={order} opened={modal === 'suggest'} onClose={close} proxy={proxy} />
      <KittingModal order={order} opened={modal === 'kitting'} onClose={close} proxy={proxy} />
    </>
  )
}

/** 交期建议的接受和驳回。接受会生成订单变更并推送ERP，驳回必须写原因（《5》§三）。 */
export function SuggestionActions({ row }: { row: SuggestionView }) {
  const run = useAction()
  const [modal, setModal] = useState<'accept' | 'reject' | null>(null)
  return (
    <Group gap={6} wrap="nowrap" justify="flex-end">
      <ActionButton state={row.actions.accept} size="compact-sm" onClick={() => setModal('accept')}>
        接受
      </ActionButton>
      <ActionButton state={row.actions.reject} size="compact-sm" variant="light" color="red" onClick={() => setModal('reject')}>
        驳回
      </ActionButton>
      <ReasonModal
        opened={modal === 'accept'}
        onClose={() => setModal(null)}
        title={`接受交期建议 ${row.no}`}
        label="处理说明"
        required={false}
        description={`承诺交期 ${row.currentDate} → ${row.suggestedDate}。接受后生成一笔订单变更（来源：交期建议），按「41」的开关决定是否先审核，再推送ERP；推送成功后新交期才生效。`}
        confirmLabel="接受并生成变更"
        onSubmit={({ reason }) => run(`/suggestions/${row.id}/accept`, { note: reason || undefined }, { success: '已接受，生成了订单变更' })}
      />
      <ReasonModal
        opened={modal === 'reject'}
        onClose={() => setModal(null)}
        title={`驳回交期建议 ${row.no}`}
        label="驳回原因"
        color="red"
        confirmLabel="驳回"
        description="驳回后承诺交期不变，供应商在门户里能看到原因。"
        onSubmit={({ reason }) => run(`/suggestions/${row.id}/reject`, { note: reason }, { success: '已驳回' })}
      />
    </Group>
  )
}

/** 品质复核缺料反馈，复核意见记在门户「20」。 */
export function KittingReviewAction({ row }: { row: KittingView }) {
  const run = useAction()
  const [opened, setOpened] = useState(false)
  return (
    <>
      <ActionButton state={row.actions.review} size="compact-sm" variant="light" onClick={() => setOpened(true)}>
        复核
      </ActionButton>
      <ReasonModal
        opened={opened}
        onClose={() => setOpened(false)}
        title="品质复核"
        label="复核意见"
        placeholder="例如：已电话核实到料计划，风险可控"
        description={`${row.orderNo} 第${row.lineNo}行，${row.status}${row.materialName ? `：${row.materialName}，预计${row.expectedDate}到料` : ''}。复核只留痕，不改订单。`}
        onSubmit={({ reason }) => run(`/kitting/${row.id}/review`, { note: reason }, { success: '复核意见已记录' })}
      />
    </>
  )
}

export function ChangeItemsText({ change }: { change: { items: ChangeItem[] } }) {
  return (
    <Stack gap={0}>
      {change.items.map((item, index) => (
        <Text key={index} fz="xs">
          {item.label}：{String(item.before)} → <b>{String(item.after)}</b>
        </Text>
      ))}
    </Stack>
  )
}
