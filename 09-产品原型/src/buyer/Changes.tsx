import { Alert, Badge, Button, Card, Grid, Group, MultiSelect, NumberInput, Select, Stack, Text, Textarea } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { DataTable } from 'mantine-datatable'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAction, useApi, useMeta } from '../api/hooks'
import { ActionButton, LinkAction } from '../components/ActionButton'
import { EditableTable } from '../components/EditableTable'
import { editableColumns } from '../components/editableTable'
import { Fields } from '../components/Fields'
import { CodeName, DocNo, Note, PendingTag } from '../components/marks'
import { ReasonModal } from '../components/modals'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { StatusBadge } from '../components/StatusBadge'
import { useUrlList } from '../components/urlState'
import { fmtDateTime, fmtMoney, fmtPrice, fmtQty, todayStr } from '../domain/format'
import { statusOptions } from '../domain/labels'
import { calcAmounts } from '../domain/money'
import type { OrderChange } from '../domain/types'
import type { ChangeDetail, ChangeView, OrderDetail } from '../domain/views'
import { ChangeItemsText } from '../shared/orderParts'
import { PushAttempts, PushJobSummary } from '../shared/pushParts'
import { useConfig } from '../stores/config'

interface ChangeLine {
  lineNo: number
  skuCode: string
  skuName: string
  qty: number
  price: number
  taxRate: number
  floor: number
  newQty: number | string
  newPrice: number | string
}

function ChangeFormView({ order }: { order: OrderDetail }) {
  const navigate = useNavigate()
  const run = useAction()
  const meta = useMeta()
  const config = useConfig((s) => s.config)
  const draft = order.changes.find((c) => c.id === order.unfinishedChange?.id && c.status === 'draft')
  const draftValue = (field: string, lineNo?: number) => draft?.items.find((i) => i.field === field && i.lineNo === lineNo)?.after
  const [promisedDate, setPromisedDate] = useState<string | null>((draftValue('promisedDate') as string) ?? order.promisedDate)
  const [warehouseCode, setWarehouseCode] = useState<string | null>((draftValue('warehouse') as string) ?? order.warehouseCode)
  const [reason, setReason] = useState(draft?.reason ?? '')
  const [error, setError] = useState<string>()
  const [lines, setLines] = useState<ChangeLine[]>(() =>
    order.lines.map((l) => {
      const q = order.lineQty.find((x) => x.lineNo === l.lineNo)
      return {
        lineNo: l.lineNo,
        skuCode: l.skuCode,
        skuName: l.skuName,
        qty: l.qty,
        price: l.price,
        taxRate: l.taxRate,
        floor: (q?.received ?? 0) + (q?.inTransit ?? 0) + (q?.pendingShip ?? 0),
        newQty: Number(draftValue('qty', l.lineNo) ?? l.qty),
        newPrice: Number(draftValue('price', l.lineNo) ?? l.price),
      }
    }),
  )
  const update = useCallback((lineNo: number, patch: Partial<ChangeLine>) => setLines((prev) => prev.map((l) => (l.lineNo === lineNo ? { ...l, ...patch } : l))), [])
  const qtyOn = config.changeFields.qty
  const priceOn = config.changeFields.price

  const columns = useMemo(() => {
    const col = editableColumns<ChangeLine>()
    const num = (text: string, c?: string) => (
      <Text fz="sm" className="qs-num" c={c}>
        {text}
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
      col.accessor('qty', { header: '当前数量', meta: { align: 'right' }, cell: ({ row }) => num(fmtQty(row.original.qty), 'dimmed') }),
      col.accessor('newQty', {
        header: '变更后数量',
        meta: { width: 130, align: 'right' },
        cell: ({ row }) => (
          <NumberInput
            size="xs"
            disabled={!qtyOn}
            min={row.original.floor}
            allowDecimal={false}
            allowNegative={false}
            value={row.original.newQty}
            onChange={(value) => update(row.original.lineNo, { newQty: value })}
            styles={{ input: { textAlign: 'right' } }}
          />
        ),
      }),
      col.accessor('floor', { header: '不能低于', meta: { align: 'right' }, cell: ({ row }) => num(fmtQty(row.original.floor), 'dimmed') }),
      col.accessor('price', { header: '当前含税单价', meta: { align: 'right' }, cell: ({ row }) => num(fmtPrice(row.original.price), 'dimmed') }),
      col.accessor('newPrice', {
        header: '变更后含税单价',
        meta: { width: 150, align: 'right' },
        cell: ({ row }) => (
          <NumberInput
            size="xs"
            disabled={!priceOn}
            min={0}
            decimalScale={4}
            fixedDecimalScale
            value={row.original.newPrice}
            onChange={(value) => update(row.original.lineNo, { newPrice: value })}
            styles={{ input: { textAlign: 'right' } }}
          />
        ),
      }),
      col.display({
        id: 'amount',
        header: '变更后价税合计',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const qty = Number(row.original.newQty)
          const price = Number(row.original.newPrice)
          return num(qty > 0 && price >= 0 ? fmtMoney(calcAmounts(qty, price, row.original.taxRate).amount) : '-')
        },
      }),
    ]
  }, [qtyOn, priceOn, update])

  const save = async (submit: boolean) => {
    const changedLines = lines
      .map((l) => ({
        lineNo: l.lineNo,
        qty: qtyOn && Number(l.newQty) !== l.qty ? Number(l.newQty) : undefined,
        price: priceOn && Number(l.newPrice) !== l.price ? Number(l.newPrice) : undefined,
      }))
      .filter((l) => l.qty !== undefined || l.price !== undefined)
    const body = {
      promisedDate: promisedDate !== order.promisedDate ? promisedDate : undefined,
      warehouseCode: config.changeFields.warehouse && warehouseCode !== order.warehouseCode ? warehouseCode : undefined,
      lines: changedLines,
      reason: reason.trim(),
      submit,
    }
    if (!body.promisedDate && !body.warehouseCode && !changedLines.length) return setError('没有改动任何字段')
    if (!body.reason) return setError('请写明变更原因')
    setError(undefined)
    const result = await run<OrderChange>(`/orders/${order.id}/changes`, body, { success: submit ? '变更已提交' : '变更草稿已保存' })
    if (result) navigate(`/buyer/changes/${result.id}`)
  }

  const disabledNote = (on: boolean) => (on ? undefined : <Note icon={false}>推送后能否改这个字段未定「03」，当前演示关闭</Note>)

  return (
    <Stack gap="lg">
      {draft && (
        <Alert color="gray" p="xs">
          <Text fz="sm">
            已有变更草稿 <DocNo no={draft.no} to={`/buyer/changes/${draft.id}`} />，在这里保存会更新这张草稿。
          </Text>
        </Alert>
      )}
      <Card>
        <SectionTitle>订单头</SectionTitle>
        <Grid gap="md">
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <DateInput
              label="承诺交期"
              minDate={todayStr()}
              value={promisedDate}
              onChange={setPromisedDate}
              description={`当前 ${order.promisedDate}，推送ERP成功后才变（《9》§2.1）`}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 5 }}>
            <Select
              label="收货仓"
              disabled={!config.changeFields.warehouse}
              data={(meta.data?.warehouses ?? []).map((w) => ({ value: w.code, label: `${w.code} ${w.name}` }))}
              value={warehouseCode}
              onChange={setWarehouseCode}
              description={disabledNote(config.changeFields.warehouse)}
            />
          </Grid.Col>
        </Grid>
      </Card>
      <Card>
        <SectionTitle
          extra={
            <Group gap="xs">
              {!qtyOn && (
                <Text fz="xs" c="dimmed">
                  数量不可改 <PendingTag n={3} />
                </Text>
              )}
              {!priceOn && (
                <Text fz="xs" c="dimmed">
                  单价不可改 <PendingTag n={3} />
                </Text>
              )}
            </Group>
          }
        >
          订单行
        </SectionTitle>
        <EditableTable data={lines} columns={columns} getRowId={(row) => String(row.lineNo)} minWidth={980} />
        <Note>数量不能低于累计入库、在途通知和已提交未生成通知之和。单价改动只在「03」开关打开时演示；门户不重算价格。</Note>
      </Card>
      <Card>
        <Textarea label="变更原因" withAsterisk placeholder="例如：供应商排产调整，双方电话确认" value={reason} onChange={(event) => setReason(event.currentTarget.value)} minRows={3} />
        <Stack gap={4} mt="sm">
          <Note>{config.changeNeedsApproval ? '提交后进入单级审核，审核通过再推送ERP「41」。' : '当前演示为提交即推送ERP，不审核「41」。'}</Note>
          <Note>{config.reconfirmAfterChange ? '变更生效后请供应商重新确认「03」。' : '变更生效后不要求供应商重新确认「03」。'}已下发的收货通知如何联动见「03」。</Note>
        </Stack>
      </Card>
      {error && (
        <Text c="red" fz="sm">
          {error}
        </Text>
      )}
      <Group justify="flex-end" gap="xs">
        <Button variant="default" component={Link} to={`/buyer/orders/${order.id}`}>
          放弃
        </Button>
        <Button variant="light" onClick={() => save(false)}>
          保存草稿
        </Button>
        <Button color="violet" onClick={() => save(true)}>
          提交变更
        </Button>
      </Group>
    </Stack>
  )
}

/** B06 发起变更：可改字段按「03」开关。 */
export function ChangeFormPage() {
  const { id = '' } = useParams()
  const query = useApi<OrderDetail>(`/orders/${id}`)
  return (
    <QueryState query={query}>
      {(order) => {
        const draft = order.unfinishedChange?.status === 'draft'
        return (
          <>
            <PageHeader title={`发起变更 · ${order.no}`} back={{ to: `/buyer/orders/${order.id}`, label: '采购订单详情' }} subtitle={`${order.supplierName} · 当前承诺交期 ${order.promisedDate}`} />
            {order.actions.change.ok || draft ? (
              <ChangeFormView key={order.id} order={order} />
            ) : (
              <Alert color="gray" title="现在不能发起变更">
                {order.actions.change.reason}
              </Alert>
            )}
          </>
        )
      }}
    </QueryState>
  )
}

/** B08 订单变更列表。 */
export function ChangeList() {
  const navigate = useNavigate()
  const query = useApi<ChangeView[]>('/changes')
  const [status, setStatus] = useUrlList('status')
  return (
    <>
      <PageHeader title="订单变更" subtitle="变更只能在SRM发起，审核通过后推送ERP；推送成功才生效（《4》§一、《10》）。" />
      <Group mb="md">
        <MultiSelect label="状态" placeholder="全部" data={statusOptions('change')} value={status} onChange={setStatus} clearable w={280} />
      </Group>
      <QueryState query={query}>
        {(changes) => {
          const rows = changes.filter((c) => !status.length || status.includes(c.status))
          return (
            <DataTable
              records={rows}
              idAccessor="id"
              withTableBorder
              borderRadius="lg"
              highlightOnHover
              minHeight={rows.length ? undefined : 200}
              noRecordsText="没有订单变更"
              onRowClick={({ record }) => navigate(`/buyer/changes/${record.id}`)}
              columns={[
                { accessor: 'no', title: '变更单号', render: (c) => <DocNo no={c.no} to={`/buyer/changes/${c.id}`} /> },
                { accessor: 'orderNo', title: '采购订单', render: (c) => <DocNo no={c.orderNo} to={`/buyer/orders/${c.orderId}`} /> },
                { accessor: 'supplierName', title: '供应商' },
                { accessor: 'items', title: '变更内容', render: (c) => <ChangeItemsText change={c} /> },
                { accessor: 'source', title: '来源', render: (c) => <Text fz="sm">{c.source === 'suggestion' ? '交期建议' : '采购发起'}</Text> },
                { accessor: 'status', title: '状态', render: (c) => <StatusBadge kind="change" value={c.status} /> },
                { accessor: 'push', title: '推送', render: (c) => (c.pushJob ? <PushJobSummary job={c.pushJob} /> : <Text fz="xs">-</Text>) },
                { accessor: 'createdAt', title: '发起', render: (c) => <Text fz="xs">{c.createdBy} · {fmtDateTime(c.createdAt)}</Text> },
              ]}
            />
          )
        }}
      </QueryState>
    </>
  )
}

function ChangeDetailContent({ change }: { change: ChangeDetail }) {
  const run = useAction()
  const [rejecting, setRejecting] = useState(false)
  const a = change.actions
  return (
    <>
      <PageHeader
        back={{ to: '/buyer/changes', label: '订单变更' }}
        title={<span className="qs-mono">{change.no}</span>}
        badges={
          <Group gap={4}>
            <StatusBadge kind="change" value={change.status} />
            <Badge variant="light" color={change.source === 'suggestion' ? 'violet' : 'gray'}>
              {change.source === 'suggestion' ? '来源：交期建议' : '采购发起'}
            </Badge>
          </Group>
        }
        subtitle={`${change.orderNo} · ${change.supplierName}`}
        actions={
          <>
            <LinkAction state={a.edit} to={`/buyer/orders/${change.orderId}/change`} variant="default">
              编辑草稿
            </LinkAction>
            <ActionButton state={a.submit} onClick={() => run(`/changes/${change.id}/submit`, {}, { success: '变更已提交' })}>
              提交
            </ActionButton>
            <ActionButton state={a.approve} onClick={() => run(`/changes/${change.id}/approve`, {}, { success: '审核通过，开始推送ERP' })}>
              审核通过
            </ActionButton>
            <ActionButton state={a.reject} color="red" variant="light" onClick={() => setRejecting(true)}>
              驳回
            </ActionButton>
            <ActionButton state={a.retryPush} color="red" onClick={() => change.pushJob && run(`/push-jobs/${change.pushJob.id}/retry`, {}, { success: '已重推同一笔' })}>
              重推ERP
            </ActionButton>
            <ActionButton state={a.discard} variant="default" color="gray" onClick={() => run(`/changes/${change.id}/discard`, {}, { success: '草稿已作废' })}>
              作废草稿
            </ActionButton>
          </>
        }
      />
      <Stack gap="md">
        {change.status === 'rejected' && change.rejectComment && (
          <Alert color="dark" title="已驳回">
            {change.rejectComment}
          </Alert>
        )}
        {change.status === 'failed' && (
          <Alert color="red" title="推送ERP失败">
            订单头仍显示当前有效值和「SRM已接受、ERP尚未更新」的新值，重推成功后才生效。
          </Alert>
        )}
        <Card>
          <Fields
            items={[
              { label: '采购订单', value: <DocNo no={change.orderNo} to={`/buyer/orders/${change.orderId}`} /> },
              { label: '供应商', value: <CodeName code={change.supplierCode} name={change.supplierName} /> },
              { label: '第几次变更', value: `第${change.seq}次` },
              { label: '原因', value: change.reason, span: 1 },
              { label: '需要审核', value: change.needApproval ? '是（单级）' : '否，提交即推送' },
              { label: '生效后重新确认', value: change.needReconfirm ? '是' : '否' },
              { label: '发起', value: `${change.createdBy} · ${fmtDateTime(change.createdAt)}` },
              { label: '提交', value: change.submittedAt ? fmtDateTime(change.submittedAt) : undefined },
              { label: '审核', value: change.approvedAt ? `${change.approvedBy} · ${fmtDateTime(change.approvedAt)}` : undefined },
              { label: '生效', value: change.effectiveAt ? fmtDateTime(change.effectiveAt) : undefined },
              {
                label: '来源建议',
                value: change.suggestion ? (
                  <Text fz="sm">
                    <DocNo no={change.suggestion.no} />：{change.suggestion.reason}
                  </Text>
                ) : undefined,
                span: 2,
              },
            ]}
          />
        </Card>
        <Card>
          <SectionTitle>前后值</SectionTitle>
          <DataTable
            records={change.items.map((item, index) => ({ ...item, key: index }))}
            idAccessor="key"
            withTableBorder
            borderRadius="md"
            columns={[
              { accessor: 'label', title: '字段' },
              { accessor: 'lineNo', title: '行', render: (i) => <Text fz="sm">{i.lineNo ?? '订单头'}</Text> },
              { accessor: 'before', title: '变更前', render: (i) => <Text fz="sm" className="qs-num">{String(i.before)}</Text> },
              { accessor: 'after', title: '变更后', render: (i) => <Text fz="sm" fw={650} className="qs-num">{String(i.after)}</Text> },
            ]}
          />
        </Card>
        <Card>
          <SectionTitle extra={<PushJobSummary job={change.pushJob} />}>推送记录</SectionTitle>
          {change.pushJob ? <PushAttempts job={change.pushJob} /> : <Text fz="sm" c="dimmed">还没有推送</Text>}
        </Card>
      </Stack>
      <ReasonModal
        opened={rejecting}
        onClose={() => setRejecting(false)}
        title="驳回订单变更"
        label="驳回意见"
        color="red"
        confirmLabel="驳回"
        onSubmit={({ reason }) => run(`/changes/${change.id}/reject`, { comment: reason }, { success: '已驳回' })}
      />
    </>
  )
}

/** B09 变更详情。 */
export function ChangeDetailPage() {
  const { id = '' } = useParams()
  const query = useApi<ChangeDetail>(`/changes/${id}`)
  return <QueryState query={query}>{(change) => <ChangeDetailContent key={change.id} change={change} />}</QueryState>
}
