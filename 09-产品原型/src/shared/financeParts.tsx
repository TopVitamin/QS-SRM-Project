import { Alert, Badge, Box, Button, Collapse, Group, Modal, NumberInput, Paper, SegmentedControl, SimpleGrid, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { IconAlertTriangle, IconCircleCheck, IconCircleDashed, IconCircleX, type Icon } from '@tabler/icons-react'
import { DataTable } from 'mantine-datatable'
import { useState, type ReactNode } from 'react'
import { useAction } from '../api/hooks'
import { ActionButton } from '../components/ActionButton'
import { numCell } from '../components/columns'
import { Fields } from '../components/Fields'
import { DocNo, Note, RichText } from '../components/marks'
import { StatusBadge } from '../components/StatusBadge'
import { EMPTY, fmtDate, fmtDateTime, fmtMoney, fmtRate, todayStr } from '../domain/format'
import { round2 } from '../domain/money'
import type { Precheck, PrecheckItem } from '../domain/types'
import type { InvoiceView, RedLetterView } from '../domain/views'

const resultMeta: Record<PrecheckItem['result'], { icon: Icon; color: string }> = {
  pass: { icon: IconCircleCheck, color: 'green' },
  fail: { icon: IconCircleX, color: 'red' },
  warn: { icon: IconAlertTriangle, color: 'orange' },
  na: { icon: IconCircleDashed, color: 'gray' },
}

/** 预校验逐项结果。只有号码格式和门户内查重会拦住登记，金额差额只提示（「17」）。 */
export function PrecheckList({ precheck, title = true }: { precheck: Precheck; title?: boolean }) {
  return (
    <Stack gap={6}>
      {title && (
        <Group gap="xs">
          <StatusBadge kind="precheck" value={precheck.overall} size="xs" />
          <Text fz="xs" c="dimmed" className="qs-num">
            {fmtDateTime(precheck.at)}
          </Text>
        </Group>
      )}
      {precheck.items.map((item) => {
        const meta = resultMeta[item.result]
        return (
          <Group key={item.key} gap={8} wrap="nowrap" align="flex-start">
            <meta.icon size={16} color={`var(--mantine-color-${meta.color}-6)`} style={{ flexShrink: 0, marginTop: 2 }} />
            <Text fz="sm" fw={600} w={76} style={{ flexShrink: 0 }}>
              {item.label}
            </Text>
            <Text fz="sm" c={item.result === 'fail' ? 'red.7' : undefined} style={{ minWidth: 0 }}>
              <RichText>{item.message}</RichText>
            </Text>
          </Group>
        )
      })}
    </Stack>
  )
}

function KindBadge({ kind }: { kind: InvoiceView['kind'] }) {
  return (
    <Badge size="xs" variant="outline" color={kind === 'blue' ? 'blue' : 'red'} radius="sm">
      {kind === 'blue' ? '蓝字' : '红字'}
    </Badge>
  )
}

function InvoiceNoCell({ invoice }: { invoice: InvoiceView }) {
  return (
    <Stack gap={0}>
      <Group gap={6} wrap="nowrap">
        <KindBadge kind={invoice.kind} />
        <Text fz="sm" className="qs-mono">
          {invoice.invoiceNo}
        </Text>
      </Group>
      {invoice.legacyCode && (
        <Text fz={11} c="dimmed">
          纸票代码 <span className="qs-mono">{invoice.legacyCode}</span>
        </Text>
      )}
      {invoice.blueInvoiceNo && (
        <Text fz={11} c="red.7">
          冲 <span className="qs-mono">{invoice.blueInvoiceNo}</span>
        </Text>
      )}
    </Stack>
  )
}

function ReversalCell({ invoice }: { invoice: InvoiceView }) {
  if (invoice.kind !== 'blue') return <Text fz="xs">{EMPTY}</Text>
  return (
    <Stack gap={2}>
      <Text fz="xs" className="qs-num">
        已红冲 {fmtMoney(invoice.reversedAmount)} · 剩余 {fmtMoney(invoice.remaining)}
      </Text>
      {invoice.activeRed && <StatusBadge kind="red" value={invoice.activeRed.status} size="xs" />}
    </Stack>
  )
}

interface InvoiceTableProps {
  rows: InvoiceView[]
  actions?: (invoice: InvoiceView) => ReactNode
  showSupplier?: boolean
  /** 开票申请号的链接前缀；门户里没有开票申请详情页，不给链接。 */
  requestBase?: string
  noRecordsText?: string
}

function InvoiceCard({ invoice, actions }: { invoice: InvoiceView; actions?: (invoice: InvoiceView) => ReactNode }) {
  const [opened, { toggle }] = useDisclosure(false)
  return (
    <Paper p="md" radius="lg" withBorder>
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <InvoiceNoCell invoice={invoice} />
          <StatusBadge kind="precheck" value={invoice.precheck.overall} size="xs" />
        </Group>
        <Text fz="sm">
          价税合计 <b className="qs-num">{fmtMoney(invoice.amount)}</b> · 税额 <span className="qs-num">{fmtMoney(invoice.tax)}</span> · {fmtRate(invoice.taxRate)}
        </Text>
        <Text fz="xs" c="dimmed">
          {invoice.invoiceType} · 开票日期 <span className="qs-num">{fmtDate(invoice.issueDate)}</span>
          {invoice.requestNo ? ` · ${invoice.requestNo}` : ''}
        </Text>
        {invoice.kind === 'blue' && (
          <Group gap={6}>
            <StatusBadge kind="usage" value={invoice.usageStatus} size="xs" />
            <ReversalCell invoice={invoice} />
          </Group>
        )}
        <Button variant="subtle" size="compact-sm" onClick={toggle} w="fit-content" px={0}>
          {opened ? '收起预校验' : '查看预校验'}
        </Button>
        <Collapse expanded={opened}>
          <PrecheckList precheck={invoice.precheck} title={false} />
        </Collapse>
        {actions && <Box>{actions(invoice)}</Box>}
      </Stack>
    </Paper>
  )
}

/** 税票列表：点行展开预校验明细。手机上是卡片。 */
export function InvoiceTable({ rows, actions, showSupplier = false, requestBase, noRecordsText = '还没有登记税票' }: InvoiceTableProps) {
  const mobile = useMediaQuery('(max-width: 48em)')
  if (mobile) {
    if (!rows.length) {
      return (
        <Text fz="sm" c="dimmed" ta="center" py="lg">
          {noRecordsText}
        </Text>
      )
    }
    return (
      <Stack gap="sm">
        {rows.map((invoice) => (
          <InvoiceCard key={invoice.id} invoice={invoice} actions={actions} />
        ))}
      </Stack>
    )
  }
  return (
    <DataTable
      records={rows}
      idAccessor="id"
      withTableBorder
      borderRadius="lg"
      highlightOnHover
      minHeight={rows.length ? undefined : 120}
      noRecordsText={noRecordsText}
      rowExpansion={{
        allowMultiple: true,
        content: ({ record }) => (
          <Box px="md" py="sm" bg="gray.0">
            <PrecheckList precheck={record.precheck} />
          </Box>
        ),
      }}
      columns={[
        { accessor: 'invoiceNo', title: '发票号码', render: (i) => <InvoiceNoCell invoice={i} /> },
        {
          accessor: 'invoiceType',
          title: '票种 / 开票日期',
          render: (i) => (
            <Stack gap={0}>
              <Text fz="xs">{i.invoiceType}</Text>
              <Text fz="xs" c="dimmed" className="qs-num">
                {fmtDate(i.issueDate)}
              </Text>
            </Stack>
          ),
        },
        { accessor: 'supplierName', title: '供应商', hidden: !showSupplier },
        { accessor: 'requestNo', title: '开票申请', render: (i) => <DocNo no={i.requestNo} to={requestBase && i.requestId ? `${requestBase}/${i.requestId}` : undefined} /> },
        { accessor: 'taxRate', title: '税率', textAlign: 'right', render: (i) => numCell(fmtRate(i.taxRate)) },
        { accessor: 'amount', title: '价税合计', textAlign: 'right', render: (i) => numCell(fmtMoney(i.amount), true) },
        { accessor: 'tax', title: '税额', textAlign: 'right', render: (i) => numCell(fmtMoney(i.tax)) },
        { accessor: 'netAmount', title: '金额', textAlign: 'right', render: (i) => numCell(fmtMoney(i.netAmount)) },
        { accessor: 'precheck', title: '预校验', render: (i) => <StatusBadge kind="precheck" value={i.precheck.overall} size="xs" /> },
        {
          accessor: 'usageStatus',
          title: '用途确认（税务平台）',
          render: (i) => (i.kind === 'blue' ? <StatusBadge kind="usage" value={i.usageStatus} size="xs" /> : <Text fz="xs">{EMPTY}</Text>),
        },
        { accessor: 'reversed', title: '红冲', render: (i) => <ReversalCell invoice={i} /> },
        {
          accessor: 'registeredAt',
          title: '登记',
          render: (i) => (
            <Text fz="xs" c="dimmed">
              {i.registeredBy}
              <br />
              <span className="qs-num">{fmtDateTime(i.registeredAt)}</span>
            </Text>
          ),
        },
        { accessor: 'actions', title: '', hidden: !actions, textAlign: 'right', render: (i) => actions?.(i) },
      ]}
    />
  )
}

type RedMode = 'direct' | 'form'

const invoiceNoRule = (value: string) => (/^\d{20}$/.test(value.trim()) ? null : '数电票号码为20位数字，没有发票代码')

/** 红冲申请。未用途确认且未入账确认：销售方直接开红字，只登记号码；已确认：先走红字确认单，对方72小时内确认（《8》§四）。 */
function RedRequestModal({ invoice, mode, onClose }: { invoice: InvoiceView; mode: RedMode; onClose: () => void }) {
  const run = useAction()
  const fullTax = round2((invoice.tax * invoice.remaining) / invoice.amount)
  const form = useForm({
    initialValues: {
      scope: 'full' as 'full' | 'partial',
      amount: '' as number | string,
      tax: '' as number | string,
      reason: '',
      invoiceNo: '',
      issueDate: todayStr() as string | null,
    },
    validate: {
      amount: (value, values) =>
        values.scope === 'partial' && !(Number(value) > 0 && Number(value) <= invoice.remaining) ? `部分红冲须大于0且不超过剩余${fmtMoney(invoice.remaining)}` : null,
      tax: (value, values) =>
        values.scope === 'partial' && (value === '' || Number(value) < 0 || Number(value) > Number(values.amount)) ? '税额须在0到红冲价税合计之间' : null,
      reason: (value) => (value.trim() ? null : '请填写红冲原因'),
      invoiceNo: (value) => (mode === 'direct' ? invoiceNoRule(value) : null),
      issueDate: (value) => (mode === 'direct' && !value ? '请选择开票日期' : null),
    },
  })
  const { scope } = form.getValues()
  const submit = form.onSubmit(async (values) => {
    const money = values.scope === 'full' ? {} : { amount: Number(values.amount), tax: Number(values.tax) }
    const body = { blueInvoiceId: invoice.id, scope: values.scope, reason: values.reason.trim(), ...money }
    const result =
      mode === 'direct'
        ? await run('/red-letters/direct', { ...body, invoiceNo: values.invoiceNo.trim(), issueDate: values.issueDate }, { success: '已登记红字税票' })
        : await run('/red-letters/form', body, { success: '已发起红字确认单，等待对方72小时内确认' })
    if (result !== undefined) onClose()
  })
  return (
    <Modal opened onClose={onClose} title={mode === 'direct' ? `直接开具红字 · ${invoice.invoiceNo}` : `发起红字确认单 · ${invoice.invoiceNo}`} size="lg">
      <form onSubmit={submit}>
        <Stack gap="sm">
          <Alert color={mode === 'direct' ? 'gray' : 'orange'} variant="light" p="sm">
            <Note icon={false} c="var(--mantine-color-text)">
              {mode === 'direct'
                ? '这张蓝票未用途确认且未入账确认，销售方在税务平台直接开具红字发票，门户只登记红字号码，没有确认单（《8》§四）。'
                : '这张蓝票已用途确认或入账确认，须先在税务平台填开红字确认单，对方72小时内确认，超时作废（《8》§四）。税务平台上由谁操作见「14」；门户里的确认单号是模拟编号。'}
            </Note>
          </Alert>
          <Fields
            cols={3}
            items={[
              { label: '蓝票价税合计', value: <span className="qs-num">{fmtMoney(invoice.amount)}</span> },
              { label: '已红冲', value: <span className="qs-num">{fmtMoney(invoice.reversedAmount)}</span> },
              { label: '剩余可红冲', value: <b className="qs-num">{fmtMoney(invoice.remaining)}</b> },
            ]}
          />
          <SegmentedControl
            {...form.getInputProps('scope')}
            data={[
              { value: 'full', label: '全额红冲（剩余部分）' },
              { value: 'partial', label: '部分红冲' },
            ]}
          />
          {scope === 'full' ? (
            <Text fz="sm">
              红冲价税合计 <b className="qs-num">{fmtMoney(invoice.remaining)}</b>，税额按比例 <span className="qs-num">{fmtMoney(fullTax)}</span>
            </Text>
          ) : (
            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
              <NumberInput
                label="红冲价税合计"
                withAsterisk
                min={0}
                max={invoice.remaining}
                decimalScale={2}
                thousandSeparator=","
                {...form.getInputProps('amount')}
                onChange={(value) => {
                  form.setFieldValue('amount', value)
                  const amount = Number(value)
                  form.setFieldValue('tax', amount > 0 ? round2((invoice.tax * amount) / invoice.amount) : '')
                }}
              />
              <NumberInput label="红冲税额" description="按蓝票比例带出，可按税务平台结果修改" withAsterisk min={0} decimalScale={2} {...form.getInputProps('tax')} />
            </SimpleGrid>
          )}
          <Textarea label="红冲原因" withAsterisk minRows={2} placeholder="例如：开票金额与对账不符、销售退回" {...form.getInputProps('reason')} />
          {mode === 'direct' && (
            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
              <TextInput label="红字发票号码" withAsterisk placeholder="20位数字" inputMode="numeric" maxLength={20} className="qs-mono" {...form.getInputProps('invoiceNo')} />
              <DateInput label="开票日期" withAsterisk maxDate={todayStr()} valueFormat="YYYY-MM-DD" {...form.getInputProps('issueDate')} />
            </SimpleGrid>
          )}
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" color="red">
              {mode === 'direct' ? '登记红字税票' : '发起确认单'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

/** 蓝票上的红冲入口。哪条路径可用由用途确认状态决定，接口给出的动作状态已经算好。 */
export function InvoiceRedActions({ invoice }: { invoice: InvoiceView }) {
  const [mode, setMode] = useState<RedMode | null>(null)
  const formState = invoice.actions.redFormSeller.hidden ? invoice.actions.redFormBuyer : invoice.actions.redFormSeller
  return (
    // 弹窗挂在表格行里，点击会冒泡到行上触发展开，这里截住
    <div onClick={(event) => event.stopPropagation()}>
      <Group gap={6} justify="flex-end" wrap="wrap">
        <ActionButton state={invoice.actions.redDirect} size="compact-sm" variant="light" color="red" onClick={() => setMode('direct')}>
          直接开红字
        </ActionButton>
        <ActionButton state={formState} size="compact-sm" variant="light" color="red" onClick={() => setMode('form')}>
          发起红字确认单
        </ActionButton>
      </Group>
      {mode && <RedRequestModal invoice={invoice} mode={mode} onClose={() => setMode(null)} />}
    </div>
  )
}

/** 红字确认单确认后，销售方在税务平台开具红字发票，回门户登记号码。 */
export function RegisterRedModal({ red, onClose }: { red: RedLetterView; onClose: () => void }) {
  const run = useAction()
  const form = useForm({
    initialValues: { invoiceNo: '', issueDate: todayStr() as string | null },
    validate: { invoiceNo: invoiceNoRule, issueDate: (value) => (value ? null : '请选择开票日期') },
  })
  const submit = form.onSubmit(async (values) => {
    const result = await run(`/red-letters/${red.id}/register`, { invoiceNo: values.invoiceNo.trim(), issueDate: values.issueDate }, { success: '已登记红字税票' })
    if (result !== undefined) onClose()
  })
  return (
    <Modal opened onClose={onClose} title={`登记红字号码 · ${red.formNo ?? ''}`} size="md">
      <form onSubmit={submit}>
        <Stack gap="sm">
          <Fields
            cols={2}
            items={[
              { label: '蓝字发票', value: <span className="qs-mono">{red.blueInvoiceNo}</span> },
              { label: '红冲价税合计', value: <b className="qs-num">{fmtMoney(-red.amount)}</b> },
            ]}
          />
          <TextInput label="红字发票号码" withAsterisk placeholder="20位数字" inputMode="numeric" maxLength={20} className="qs-mono" data-autofocus {...form.getInputProps('invoiceNo')} />
          <DateInput label="开票日期" withAsterisk maxDate={todayStr()} valueFormat="YYYY-MM-DD" {...form.getInputProps('issueDate')} />
          <Note>号码按20位数字校验并在门户内查重；真伪查验未接入「37」。</Note>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={onClose}>
              取消
            </Button>
            <Button type="submit">登记</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
