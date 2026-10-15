import { Alert, Badge, Button, Card, Checkbox, Group, Modal, Paper, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput, Textarea, Timeline } from '@mantine/core'
import { MonthPickerInput } from '@mantine/dates'
import { useMediaQuery } from '@mantine/hooks'
import { IconPlus, IconSearch } from '@tabler/icons-react'
import { DataTable, type DataTableColumn } from 'mantine-datatable'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAction, useApi } from '../api/hooks'
import { useEntry } from '../app/entry'
import { ActionButton } from '../components/ActionButton'
import { moneyColumns, numCell, qtyCell, skuColumn } from '../components/columns'
import { Fields } from '../components/Fields'
import { CodeName, DocNo, LockHint, Note } from '../components/marks'
import { ReasonModal } from '../components/modals'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { ResponsiveList } from '../components/ResponsiveList'
import { StatusBadge } from '../components/StatusBadge'
import { HeaderActions, StickyActions } from '../components/StickyActions'
import { matchText, useUrlValue } from '../components/urlState'
import { EMPTY, bj, fmtDateTime, fmtMoney, fmtQty } from '../domain/format'
import { sumBy, sumMoney } from '../domain/money'
import type { ReconLine } from '../domain/types'
import type { ActionState, InvoiceRequestView, ReconView, SupplierView } from '../domain/views'

interface Candidates {
  state: ActionState
  lines: ReconLine[]
}

const lockLabel = '对账行取自ERP已审核的采购入库单和采退出库单，任何一方都不能改值（A07）'

function lineColumns(disputed: string[] = []): DataTableColumn<ReconLine>[] {
  return [
    {
      accessor: 'docType',
      title: '单据',
      render: (l) => (
        <Stack gap={0}>
          <Text fz="xs" c={l.docType === '采退出库单' ? 'red.7' : 'dimmed'}>
            {l.docType}
            {disputed.includes(l.id) ? ' · 有差异' : ''}
          </Text>
          <DocNo no={l.docNo} size="xs" />
        </Stack>
      ),
    },
    { accessor: 'docDate', title: '单据日期', render: (l) => <Text fz="sm" className="qs-num">{l.docDate}</Text> },
    {
      accessor: 'orderNo',
      title: 'SRM / ERP采购订单',
      render: (l) => (
        <Stack gap={0}>
          <DocNo no={l.orderNo} size="xs" />
          <DocNo no={l.erpOrderNo} size="xs" />
        </Stack>
      ),
    },
    { accessor: 'lineNo', title: '行', width: 44 },
    skuColumn(),
    { accessor: 'qty', title: '数量', textAlign: 'right', render: (l) => qtyCell(l.qty, l.qty < 0 ? 'red.7' : undefined) },
    ...moneyColumns<ReconLine>(),
  ]
}

function Totals({ lines }: { lines: ReconLine[] }) {
  return (
    <Group gap="lg" justify="flex-end" wrap="wrap" mt="xs">
      <Text fz="sm">
        共 <b className="qs-num">{lines.length}</b> 行 · 数量 <b className="qs-num">{fmtQty(sumBy(lines, (l) => l.qty))}</b>
      </Text>
      <Text fz="sm">
        价税合计 <b className="qs-num">{fmtMoney(sumMoney(lines, (l) => l.amount))}</b>
      </Text>
      <Text fz="sm">
        税额 <span className="qs-num">{fmtMoney(sumMoney(lines, (l) => l.tax))}</span>
      </Text>
      <Text fz="sm">
        金额 <span className="qs-num">{fmtMoney(sumMoney(lines, (l) => l.netAmount))}</span>
      </Text>
    </Group>
  )
}

const lastMonth = () => bj().subtract(1, 'month').startOf('month').format('YYYY-MM-DD')

/** 取数生成：按供应商和期间取ERP已审核的入库、采退，已在有效对账单里的行不重复取（《4》§六）。 */
function CreateReconModal({ onClose }: { onClose: () => void }) {
  const { base, portal } = useEntry()
  const navigate = useNavigate()
  const run = useAction()
  const mobile = useMediaQuery('(max-width: 48em)')
  const suppliers = useApi<SupplierView[]>(portal ? null : '/suppliers')
  const [supplierCode, setSupplierCode] = useState<string | null>(null)
  const [month, setMonth] = useState<string | null>(lastMonth)
  const period = month ? month.slice(0, 7) : ''
  const ready = (portal || !!supplierCode) && !!period
  const candidates = useApi<Candidates>(ready ? `/reconciliations/candidates?supplierCode=${supplierCode ?? ''}&period=${period}` : null)
  const lines = candidates.data?.lines ?? []

  const create = async () => {
    const result = await run<ReconView>(
      '/reconciliations',
      { supplierCode, period },
      { success: portal ? '已生成对账单，请核对后确认' : '已生成对账单（已取数，未发送供应商）' },
    )
    if (result) navigate(`${base}/reconciliations/${result.id}`)
  }

  return (
    <Modal opened onClose={onClose} title="取数生成对账单" size="80rem" fullScreen={mobile}>
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: portal ? 1 : 2 }} spacing="sm" maw={portal ? 280 : 640}>
          {!portal && (
            <Select
              label="供应商"
              withAsterisk
              searchable
              placeholder="选择供应商"
              data={(suppliers.data ?? []).map((s) => ({ value: s.code, label: `${s.code} ${s.name}` }))}
              value={supplierCode}
              onChange={setSupplierCode}
            />
          )}
          <MonthPickerInput label="对账期间" withAsterisk valueFormat="YYYY-MM" maxDate={bj().format('YYYY-MM-DD')} value={month} onChange={setMonth} />
        </SimpleGrid>
        <Note>只取ERP已审核的采购入库单和采退出库单；已在有效对账单里的行不会重复取。取出的行不能改值，有异议走差异（A07）。</Note>
        {!ready ? (
          <Text fz="sm" c="dimmed">
            先选择供应商和期间，下面预览可对账的单据行。
          </Text>
        ) : (
          <QueryState query={candidates}>
            {() =>
              lines.length ? (
                <>
                  <DataTable records={lines} idAccessor="id" withTableBorder borderRadius="md" maxHeight={360} columns={lineColumns()} />
                  <Totals lines={lines} />
                </>
              ) : (
                <Alert color="gray" variant="light">
                  {period}没有可对账的ERP已审核采购入库单或采退出库单（或已全部进入有效对账单）。
                </Alert>
              )
            }
          </QueryState>
        )}
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            取消
          </Button>
          <ActionButton state={candidates.data?.state} disabled={!lines.length} onClick={create}>
            生成对账单
          </ActionButton>
        </Group>
      </Stack>
    </Modal>
  )
}

/** B19 / P10 对账单列表。发起方按「16」开关演示。 */
export function ReconList() {
  const { base, portal } = useEntry()
  const navigate = useNavigate()
  const query = useApi<ReconView[]>('/reconciliations')
  const createState = useApi<Candidates>('/reconciliations/candidates')
  const [creating, setCreating] = useState(false)
  const [status, setStatus] = useUrlValue('status')
  const [q, setQ] = useUrlValue('q')
  const options = portal
    ? [
        { value: 'all', label: '全部' },
        { value: 'sent', label: '待确认' },
        { value: 'disputed', label: '有差异' },
        { value: 'confirmed', label: '已确认' },
      ]
    : [
        { value: 'all', label: '全部' },
        { value: 'drafted', label: '已取数' },
        { value: 'sent', label: '待供应商确认' },
        { value: 'disputed', label: '有差异' },
        { value: 'confirmed', label: '已确认' },
        { value: 'cancelled', label: '已取消' },
      ]
  const open = (r: ReconView) => navigate(`${base}/reconciliations/${r.id}`)

  return (
    <>
      <PageHeader
        title="对账单"
        subtitle={
          portal
            ? '对账行取自ERP已审核的采购入库单和采退出库单，不能改值。核对无误就确认；有出入就勾选行、写明原因提出差异。'
            : '按供应商和期间取ERP已审核的采购入库单、采退出库单生成，行不能改值（《4》§六、A07）。确认之后才能开票。'
        }
        actions={
          <ActionButton state={createState.data?.state} leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
            取数生成对账单
          </ActionButton>
        }
      />
      <Group gap="sm" mb="md" align="flex-end" wrap="wrap">
        {!portal && (
          <TextInput
            label="搜索"
            leftSection={<IconSearch size={14} />}
            placeholder="对账单号、供应商"
            value={q}
            onChange={(event) => setQ(event.currentTarget.value)}
            w={{ base: '100%', xs: 240 }}
          />
        )}
        <SegmentedControl value={status || 'all'} onChange={(value) => setStatus(value === 'all' ? '' : value)} data={options} />
      </Group>
      <Note>对账由哪一方发起、已发送未开票的对账单能否取消见「16」，原型配置里可切换。</Note>
      <QueryState query={query}>
        {(recons) => {
          const rows = recons.filter((r) => (!status || r.status === status) && matchText(q, r.no, r.supplierName, r.supplierCode))
          return (
            <Stack mt="sm">
              <ResponsiveList
                records={rows}
                rowKey={(r) => r.id}
                onOpen={open}
                noRecordsText="没有符合条件的对账单"
                rowClassName={(r) => (r.status === 'disputed' ? 'qs-row-warn' : r.status === 'cancelled' ? 'qs-row-muted' : undefined)}
                columns={[
                  {
                    accessor: 'no',
                    title: '对账单',
                    render: (r) => (
                      <Group gap={6} wrap="nowrap">
                        <DocNo no={r.no} to={`${base}/reconciliations/${r.id}`} />
                        {r.initiator === 'supplier' && (
                          <Badge size="xs" variant="outline" color="gray">
                            供应商发起
                          </Badge>
                        )}
                      </Group>
                    ),
                  },
                  { accessor: 'supplierName', title: '供应商', hidden: portal, render: (r) => <CodeName code={r.supplierCode} name={r.supplierName} /> },
                  { accessor: 'period', title: '期间', render: (r) => <Text fz="sm" className="qs-num">{r.period}</Text> },
                  { accessor: 'lines', title: '行数', textAlign: 'right', render: (r) => qtyCell(r.lines.length) },
                  { accessor: 'amount', title: '价税合计', textAlign: 'right', render: (r) => numCell(fmtMoney(r.totals.amount), true) },
                  { accessor: 'tax', title: '税额', textAlign: 'right', render: (r) => numCell(fmtMoney(r.totals.tax)) },
                  { accessor: 'netAmount', title: '金额', textAlign: 'right', render: (r) => numCell(fmtMoney(r.totals.netAmount)) },
                  { accessor: 'status', title: '状态', render: (r) => <StatusBadge kind="recon" value={r.status} size="xs" /> },
                  {
                    accessor: 'request',
                    title: '开票申请',
                    render: (r) => (r.request ? <DocNo no={r.request.no} to={portal ? '/portal/invoicing' : `/buyer/invoice-requests/${r.request.id}`} /> : <Text fz="sm">{EMPTY}</Text>),
                  },
                  {
                    accessor: 'sentAt',
                    title: '发送 / 确认',
                    render: (r) => (
                      <Text fz="xs" c="dimmed" className="qs-num">
                        {fmtDateTime(r.sentAt)}
                        <br />
                        {fmtDateTime(r.confirmedAt)}
                      </Text>
                    ),
                  },
                ]}
                card={(r) => (
                  <Stack gap={4}>
                    <Group justify="space-between" wrap="nowrap">
                      <DocNo no={r.no} />
                      <StatusBadge kind="recon" value={r.status} size="xs" />
                    </Group>
                    <Text fz="sm">
                      期间 <span className="qs-num">{r.period}</span> · {r.lines.length}行
                    </Text>
                    <Text fz="sm">
                      价税合计 <b className="qs-num">{fmtMoney(r.totals.amount)}</b> · 税额 <span className="qs-num">{fmtMoney(r.totals.tax)}</span>
                    </Text>
                    {r.status === 'disputed' && r.dispute && (
                      <Text fz="xs" c="red.7">
                        已提出差异：{r.dispute.reason}
                      </Text>
                    )}
                  </Stack>
                )}
              />
            </Stack>
          )
        }}
      </QueryState>
      {creating && <CreateReconModal onClose={() => setCreating(false)} />}
    </>
  )
}

function ResolveModal({ recon, onClose }: { recon: ReconView; onClose: () => void }) {
  const run = useAction()
  const [mode, setMode] = useState<'refetch' | 'explain'>('refetch')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!note.trim()) return setError('请填写处理说明')
    setBusy(true)
    const result = await run(`/reconciliations/${recon.id}/resolve`, { mode, note: note.trim() }, { success: '已处理差异并重新发送供应商' })
    setBusy(false)
    if (result !== undefined) onClose()
  }
  return (
    <Modal opened onClose={onClose} title={`处理差异 · ${recon.no}`} size="lg">
      <Stack gap="sm">
        {recon.dispute && (
          <Alert color="red" variant="light" p="sm" title={`供应商提出差异（${recon.dispute.lineIds.length}行）`}>
            <Text fz="sm">{recon.dispute.reason}</Text>
          </Alert>
        )}
        <SegmentedControl
          value={mode}
          onChange={(value) => setMode(value as 'refetch' | 'explain')}
          data={[
            { value: 'refetch', label: '重新取数后重发' },
            { value: 'explain', label: '说明后重发（行不变）' },
          ]}
        />
        <Text fz="sm" c="dimmed">
          {mode === 'refetch'
            ? 'ERP那边已更正单据（例如补审入库单、冲销后重开）时用：按同一供应商和期间重新取ERP已审核单据，替换全部对账行。'
            : 'ERP单据没有问题时用：对账行不变，写明核对结论后重新发给供应商。'}
          对账行不能在SRM里手工改（A07）。
        </Text>
        <Textarea
          label="处理说明"
          withAsterisk
          minRows={3}
          value={note}
          error={error}
          onChange={(event) => {
            setNote(event.currentTarget.value)
            setError(undefined)
          }}
        />
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            取消
          </Button>
          <Button loading={busy} onClick={submit}>
            处理并重发
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function ReconLinesBlock({
  recon,
  selecting,
  selected,
  onSelect,
}: {
  recon: ReconView
  selecting: boolean
  selected: string[]
  onSelect: (ids: string[]) => void
}) {
  const mobile = useMediaQuery('(max-width: 48em)')
  const disputed = recon.dispute?.lineIds ?? []
  const toggle = (id: string) => onSelect(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  if (mobile) {
    return (
      <Stack gap="sm">
        {recon.lines.map((l) => (
          <Paper key={l.id} p="sm" radius="md" withBorder className={disputed.includes(l.id) ? 'qs-row-warn' : undefined} onClick={selecting ? () => toggle(l.id) : undefined}>
            <Group gap="sm" wrap="nowrap" align="flex-start">
              {selecting && <Checkbox checked={selected.includes(l.id)} onChange={() => toggle(l.id)} onClick={(event) => event.stopPropagation()} aria-label="选择这一行" mt={2} />}
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Group justify="space-between" wrap="nowrap">
                  <Text fz="xs" c={l.docType === '采退出库单' ? 'red.7' : 'dimmed'}>
                    {l.docType} · <span className="qs-mono">{l.docNo}</span>
                  </Text>
                  <Text fz="xs" className="qs-num">
                    {l.docDate}
                  </Text>
                </Group>
                <Text fz="sm">
                  {l.skuName} × <b className="qs-num">{fmtQty(l.qty)}</b>
                </Text>
                <Text fz="xs" c="dimmed">
                  含税单价 <span className="qs-num">{l.price.toFixed(4)}</span> · 税率 {l.taxRate}% · 价税合计 <b className="qs-num">{fmtMoney(l.amount)}</b>
                </Text>
                {disputed.includes(l.id) && (
                  <Text fz="xs" c="red.7">
                    已标记差异
                  </Text>
                )}
              </Stack>
            </Group>
          </Paper>
        ))}
      </Stack>
    )
  }
  const selectedRecords = recon.lines.filter((l) => selected.includes(l.id))
  return (
    <DataTable
      records={recon.lines}
      idAccessor="id"
      withTableBorder
      borderRadius="md"
      columns={lineColumns(disputed)}
      rowClassName={(l) => (disputed.includes(l.id) ? 'qs-row-warn' : '')}
      selectedRecords={selecting ? selectedRecords : undefined}
      onSelectedRecordsChange={selecting ? (records) => onSelect(records.map((r) => r.id)) : undefined}
    />
  )
}

function ReconDetailContent({ recon }: { recon: ReconView }) {
  const { base, portal } = useEntry()
  const navigate = useNavigate()
  const run = useAction()
  const a = recon.actions
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [dialog, setDialog] = useState<'confirm' | 'dispute' | 'cancel' | 'resolve' | null>(null)
  const requestLink = recon.request ? (portal ? '/portal/invoicing' : `/buyer/invoice-requests/${recon.request.id}`) : undefined

  const createRequest = async () => {
    const result = await run<InvoiceRequestView>(`/reconciliations/${recon.id}/request`, {}, { success: '已生成开票申请，等供应商登记税票' })
    if (result) navigate(`/buyer/invoice-requests/${result.id}`)
  }
  const stopSelecting = () => {
    setSelecting(false)
    setSelected([])
  }

  const buttons = selecting ? (
    <>
      <Button variant="default" onClick={stopSelecting}>
        取消选择
      </Button>
      <Button color="red" disabled={!selected.length} onClick={() => setDialog('dispute')}>
        提交差异（{selected.length}行）
      </Button>
    </>
  ) : (
    <>
      <ActionButton state={a.send} onClick={() => run(`/reconciliations/${recon.id}/send`, {}, { success: '已发送供应商确认' })}>
        发送供应商
      </ActionButton>
      <ActionButton state={a.resolve} onClick={() => setDialog('resolve')}>
        处理差异
      </ActionButton>
      <ActionButton state={a.createRequest} onClick={createRequest}>
        生成开票申请
      </ActionButton>
      <ActionButton state={a.cancel} variant="default" color="red" onClick={() => setDialog('cancel')}>
        取消对账单
      </ActionButton>
      <ActionButton state={a.dispute} variant="light" color="red" onClick={() => setSelecting(true)}>
        提出差异
      </ActionButton>
      <ActionButton state={a.confirm} onClick={() => setDialog('confirm')}>
        确认无误
      </ActionButton>
    </>
  )

  return (
    <>
      <PageHeader
        back={{ to: `${base}/reconciliations`, label: '对账单' }}
        title={<span className="qs-mono">{recon.no}</span>}
        badges={
          <Group gap={6}>
            <StatusBadge kind="recon" value={recon.status} />
            {recon.initiator === 'supplier' && (
              <Badge variant="outline" color="gray" size="sm">
                供应商发起
              </Badge>
            )}
          </Group>
        }
        subtitle={`${portal ? '' : `${recon.supplierName} · `}期间 ${recon.period} · ${recon.lines.length}行`}
        actions={<HeaderActions portal={portal}>{buttons}</HeaderActions>}
      />
      <Stack gap="md">
        {recon.status === 'disputed' && recon.dispute && (
          <Alert color="red" title={`供应商提出差异 · ${recon.dispute.lineIds.length}行`}>
            <Text fz="sm">{recon.dispute.reason}</Text>
            <Text fz="xs" c="dimmed" mt={4}>
              {recon.dispute.by} · {fmtDateTime(recon.dispute.at)}。{portal ? '等企业侧处理后重新发送。' : '请核对ERP单据后重新取数或说明后重发。'}
            </Text>
          </Alert>
        )}
        {selecting && (
          <Alert color="red" variant="light" p="sm">
            <Text fz="sm">勾选有出入的行，再点「提交差异」写明原因。差异会退回企业侧处理，行本身不能改（A07）。</Text>
          </Alert>
        )}
        <Card>
          <SectionTitle>对账信息</SectionTitle>
          <Fields
            items={[
              { label: '供应商', value: <CodeName code={recon.supplierCode} name={recon.supplierName} /> },
              { label: '对账期间', value: recon.period },
              { label: '发起方', value: recon.initiator === 'supplier' ? '供应商' : '企业侧' },
              { label: '取数', value: `${recon.createdBy} · ${fmtDateTime(recon.createdAt)}` },
              { label: '发送', value: recon.sentAt ? fmtDateTime(recon.sentAt) : undefined },
              { label: '确认', value: recon.confirmedAt ? `${recon.confirmedBy} · ${fmtDateTime(recon.confirmedAt)}` : undefined },
              { label: '重新取数次数', value: String(recon.refetchCount) },
              { label: '开票申请', value: recon.request ? <DocNo no={recon.request.no} to={requestLink} /> : undefined },
            ]}
          />
          <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="sm" mt="md">
            {(
              [
                ['价税合计', recon.totals.amount, true],
                ['税额', recon.totals.tax, false],
                ['金额', recon.totals.netAmount, false],
              ] as const
            ).map(([label, value, strong]) => (
              <Paper key={label} p="sm" radius="md" bg="gray.0">
                <Text fz="xs" c="dimmed">
                  {label}
                </Text>
                <Text fz={strong ? 'xl' : 'lg'} fw={strong ? 700 : 600} className="qs-num">
                  {fmtMoney(value)}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
        </Card>

        <Card>
          <SectionTitle
            extra={
              <Text fz="xs" c="dimmed">
                只读 <LockHint label={lockLabel} />
              </Text>
            }
          >
            对账行
          </SectionTitle>
          <ReconLinesBlock recon={recon} selecting={selecting} selected={selected} onSelect={setSelected} />
          <Totals lines={recon.lines} />
          <Note>采退出库单以负数计入。SRM不建应付、不付款：应付、核销、付款在金蝶（《3》§3.5）。</Note>
        </Card>

        <Card>
          <SectionTitle>处理记录</SectionTitle>
          {recon.history.length ? (
            <Timeline bulletSize={12} lineWidth={2} active={recon.history.length - 1}>
              {recon.history.map((h, index) => (
                <Timeline.Item key={index} title={<Text fz="sm">{h.action}</Text>}>
                  <Text fz="xs" c="dimmed">
                    {h.by} · <span className="qs-num">{fmtDateTime(h.at)}</span>
                  </Text>
                  {h.note && <Text fz="xs">{h.note}</Text>}
                </Timeline.Item>
              ))}
            </Timeline>
          ) : (
            <Text fz="sm" c="dimmed">
              {EMPTY}
            </Text>
          )}
        </Card>
      </Stack>

      {portal && <StickyActions>{buttons}</StickyActions>}

      <ReasonModal
        opened={dialog === 'confirm'}
        onClose={() => setDialog(null)}
        title={`确认对账无误 · ${recon.no}`}
        label={null}
        confirmLabel="确认无误"
        description={`价税合计 ${fmtMoney(recon.totals.amount)}，${recon.lines.length}行。确认后不能撤回，企业侧财务据此生成开票申请，你再在「开票」里登记税票。`}
        onSubmit={() => run(`/reconciliations/${recon.id}/confirm`, {}, { success: '已确认对账' })}
      />
      <ReasonModal
        opened={dialog === 'dispute'}
        onClose={() => setDialog(null)}
        title={`提出差异 · ${selected.length}行`}
        label="差异说明"
        placeholder="例如：第2行我方记录实收为95，与入库单100不一致"
        color="red"
        confirmLabel="提交差异"
        onSubmit={async ({ reason }) => {
          const result = await run(`/reconciliations/${recon.id}/dispute`, { lineIds: selected, reason }, { success: '已提出差异，等企业侧处理' })
          if (result !== undefined) stopSelecting()
          return result
        }}
      />
      <ReasonModal
        opened={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        title={`取消对账单 · ${recon.no}`}
        label="取消原因"
        color="red"
        confirmLabel="取消对账单"
        description="取消后，对账行释放，可以重新取数。已发送未开票的对账单能否取消见「16」。"
        onSubmit={({ reason }) => run(`/reconciliations/${recon.id}/cancel`, { reason }, { success: '对账单已取消' })}
      />
      {dialog === 'resolve' && <ResolveModal recon={recon} onClose={() => setDialog(null)} />}
    </>
  )
}

/** B20 / P11 对账单详情：行全部只读；供应商确认或提出差异，差异退回企业侧处理。 */
export function ReconDetailPage() {
  const { id = '' } = useParams()
  const query = useApi<ReconView>(`/reconciliations/${id}`)
  return <QueryState query={query}>{(recon) => <ReconDetailContent key={recon.id} recon={recon} />}</QueryState>
}
