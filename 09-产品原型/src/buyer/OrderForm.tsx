import { ActionIcon, Alert, Badge, Button, Card, Grid, Group, NumberInput, Select, Stack, Table, Text, Textarea } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAction, useApi, useMeta } from '../api/hooks'
import { EditableTable } from '../components/EditableTable'
import { editableColumns } from '../components/editableTable'
import { Note } from '../components/marks'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { Forbidden, QueryState } from '../components/QueryState'
import { fmtMoney, fmtPrice, fmtQty, fmtRate, todayStr } from '../domain/format'
import { calcAmounts, round2 } from '../domain/money'
import { can } from '../domain/permissions'
import type { PurchaseOrder, Sku, PriceEntry } from '../domain/types'
import type { OrderDetail, SupplierPrices, SupplierView } from '../domain/views'
import { useSession } from '../stores/session'

interface LineDraft {
  key: string
  skuCode: string | null
  qty: number | string
}

type PricedSku = Sku & { price?: PriceEntry }

let lineSeq = 0
const newLine = (skuCode: string | null = null, qty: number | string = ''): LineDraft => ({ key: `l${++lineSeq}`, skuCode, qty })

function lineAmounts(line: LineDraft, sku?: PricedSku) {
  const qty = Number(line.qty)
  if (!sku?.price || !Number.isInteger(qty) || qty <= 0) return undefined
  return { ...calcAmounts(qty, sku.price.price, sku.price.taxRate), price: sku.price.price, taxRate: sku.price.taxRate }
}

function OrderFormView({ order, presetSupplier }: { order?: PurchaseOrder; presetSupplier?: string }) {
  const navigate = useNavigate()
  const run = useAction()
  const suppliers = useApi<SupplierView[]>('/suppliers')
  const meta = useMeta()
  const [lines, setLines] = useState<LineDraft[]>(() => (order ? order.lines.map((l) => newLine(l.skuCode, l.qty)) : [newLine()]))
  const [lineError, setLineError] = useState<string>()
  const form = useForm({
    initialValues: {
      supplierCode: (order?.supplierCode ?? presetSupplier ?? null) as string | null,
      warehouseCode: (order?.warehouseCode ?? null) as string | null,
      promisedDate: (order?.promisedDate ?? null) as string | null,
      remark: order?.remark ?? '',
    },
    validate: {
      supplierCode: (value) => (value ? null : '请选择供应商'),
      warehouseCode: (value) => (value ? null : '请选择收货仓'),
      promisedDate: (value) => (value ? null : '请选择承诺交期'),
    },
  })
  const supplierCode = form.values.supplierCode
  const prices = useApi<SupplierPrices>(supplierCode ? `/suppliers/${supplierCode}/prices` : null)
  const skuMap = useMemo(() => new Map((prices.data?.skus ?? []).map((s) => [s.code, s as PricedSku])), [prices.data])
  const skuOptions = useMemo(
    () =>
      (prices.data?.skus ?? []).map((s) => ({
        value: s.code,
        label: `${s.code} ${s.name}`,
        disabled: !s.price,
      })),
    [prices.data],
  )

  const updateLine = useCallback((key: string, patch: Partial<LineDraft>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l))), [])
  const removeLine = useCallback((key: string) => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev)), [])

  const columns = useMemo(() => {
    const col = editableColumns<LineDraft>()
    const amountsOf = (line: LineDraft) => lineAmounts(line, line.skuCode ? skuMap.get(line.skuCode) : undefined)
    const num = (text: string, strong = false) => (
      <Text fz="sm" className="qs-num" fw={strong ? 600 : undefined}>
        {text}
      </Text>
    )
    return [
      col.display({ id: 'lineNo', header: '行', cell: ({ row }) => <Text fz="sm">{row.index + 1}</Text>, meta: { width: 40 } }),
      col.accessor('skuCode', {
        header: 'SKU',
        meta: { width: 300 },
        cell: ({ row }) => {
          const line = row.original
          const sku = line.skuCode ? skuMap.get(line.skuCode) : undefined
          return (
            <Select
              size="xs"
              searchable
              placeholder={supplierCode ? '选择SKU' : '先选供应商'}
              disabled={!supplierCode}
              data={skuOptions}
              value={line.skuCode}
              onChange={(value) => updateLine(line.key, { skuCode: value })}
              error={line.skuCode && !sku?.price ? '取不到ERP价格' : undefined}
              renderOption={({ option }) => (
                <Group gap={6} wrap="nowrap" justify="space-between" w="100%">
                  <Text fz="xs">{option.label}</Text>
                  {option.disabled && (
                    <Text fz={10} c="dimmed">
                      无ERP价格
                    </Text>
                  )}
                </Group>
              )}
              nothingFoundMessage="没有这个SKU"
            />
          )
        },
      }),
      col.display({
        id: 'unit',
        header: '单位',
        meta: { width: 52 },
        cell: ({ row }) => <Text fz="sm">{(row.original.skuCode && skuMap.get(row.original.skuCode)?.unit) || '-'}</Text>,
      }),
      col.accessor('qty', {
        header: '采购数量',
        meta: { width: 120, align: 'right' },
        cell: ({ row }) => (
          <NumberInput
            size="xs"
            min={1}
            step={1}
            allowDecimal={false}
            allowNegative={false}
            placeholder="整数"
            value={row.original.qty}
            onChange={(value) => updateLine(row.original.key, { qty: value })}
            styles={{ input: { textAlign: 'right' } }}
          />
        ),
      }),
      col.display({ id: 'price', header: '含税单价', meta: { align: 'right' }, cell: ({ row }) => num(fmtPrice(row.original.skuCode ? skuMap.get(row.original.skuCode)?.price?.price : undefined)) }),
      col.display({ id: 'taxRate', header: '税率', meta: { align: 'right' }, cell: ({ row }) => num(fmtRate(row.original.skuCode ? skuMap.get(row.original.skuCode)?.price?.taxRate : undefined)) }),
      col.display({ id: 'netPrice', header: '不含税单价', meta: { align: 'right' }, cell: ({ row }) => num(fmtPrice(amountsOf(row.original)?.netPrice)) }),
      col.display({ id: 'amount', header: '价税合计', meta: { align: 'right' }, cell: ({ row }) => num(fmtMoney(amountsOf(row.original)?.amount), true) }),
      col.display({ id: 'tax', header: '税额', meta: { align: 'right' }, cell: ({ row }) => num(fmtMoney(amountsOf(row.original)?.tax)) }),
      col.display({ id: 'netAmount', header: '金额', meta: { align: 'right' }, cell: ({ row }) => num(fmtMoney(amountsOf(row.original)?.netAmount)) }),
      col.display({
        id: 'source',
        header: '价格来源',
        cell: ({ row }) => (
          <Text fz="xs" c="dimmed">
            {(row.original.skuCode && skuMap.get(row.original.skuCode)?.price?.source) || '-'}
          </Text>
        ),
      }),
      col.display({
        id: 'remove',
        header: '',
        meta: { width: 40 },
        cell: ({ row }) => (
          <ActionIcon aria-label="删除这一行" color="red" onClick={() => removeLine(row.original.key)}>
            <IconTrash size={15} />
          </ActionIcon>
        ),
      }),
    ]
  }, [skuMap, skuOptions, supplierCode, updateLine, removeLine])

  const totals = lines.reduce(
    (t, line) => {
      const a = lineAmounts(line, line.skuCode ? skuMap.get(line.skuCode) : undefined)
      return a ? { qty: t.qty + Number(line.qty), amount: round2(t.amount + a.amount), tax: round2(t.tax + a.tax), netAmount: round2(t.netAmount + a.netAmount) } : t
    },
    { qty: 0, amount: 0, tax: 0, netAmount: 0 },
  )

  const save = async (submit: boolean) => {
    const header = form.validate()
    const problems = lines.flatMap((line, index) => {
      const sku = line.skuCode ? skuMap.get(line.skuCode) : undefined
      const qty = Number(line.qty)
      if (!line.skuCode) return [`第${index + 1}行没有选SKU`]
      if (!sku?.price) return [`第${index + 1}行取不到ERP价格，不能加入订单`]
      if (!Number.isInteger(qty) || qty <= 0) return [`第${index + 1}行数量要填正整数`]
      return []
    })
    setLineError(problems[0])
    if (header.hasErrors || problems.length) return
    const values = form.getValues()
    const body = { ...values, remark: values.remark.trim(), lines: lines.map((l) => ({ skuCode: l.skuCode, qty: Number(l.qty) })), submit }
    const result = await run<PurchaseOrder>(order ? `/orders/${order.id}` : '/orders', body, {
      method: order ? 'PUT' : 'POST',
      success: submit ? '已提交审核' : '草稿已保存',
    })
    if (result) navigate(`/buyer/orders/${result.id}`)
  }

  const supplierOptions = (suppliers.data ?? []).map((s) => ({
    value: s.code,
    label: `${s.code} ${s.name}`,
    disabled: s.tier === '暂停或待淘汰',
  }))
  const pickedSupplier = suppliers.data?.find((s) => s.code === supplierCode)

  return (
    <Stack gap="lg">
      <Card>
        <SectionTitle>单头</SectionTitle>
        <Grid gap="md">
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Select
              label="供应商"
              withAsterisk
              searchable
              data={supplierOptions}
              {...form.getInputProps('supplierCode')}
              renderOption={({ option }) => {
                const s = suppliers.data?.find((x) => x.code === option.value)
                return (
                  <Group gap={6} wrap="nowrap" justify="space-between" w="100%">
                    <Text fz="sm">{option.label}</Text>
                    {s?.tier === '暂停或待淘汰' ? (
                      <Text fz={11} c="red.7">
                        暂停或待淘汰，不接新订单
                      </Text>
                    ) : s?.portalStatus === '未开通' ? (
                      <Text fz={11} c="cyan.8">
                        门户未开通
                      </Text>
                    ) : null}
                  </Group>
                )
              }}
              description="编码和名称来自ERP供应商档案。暂停或待淘汰的不接新订单（《7》§二）"
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Select
              label="收货仓"
              withAsterisk
              data={(meta.data?.warehouses ?? []).map((w) => ({ value: w.code, label: `${w.code} ${w.name}` }))}
              {...form.getInputProps('warehouseCode')}
              description={<Note icon={false}>可选的仓库清单待确认「21」</Note>}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <DateInput label="承诺交期" withAsterisk minDate={todayStr()} {...form.getInputProps('promisedDate')} description="订单头一个交期，和ERP字段一致" />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea label="备注" placeholder="给供应商看的说明" {...form.getInputProps('remark')} />
          </Grid.Col>
        </Grid>
        {pickedSupplier?.portalStatus === '未开通' && (
          <Alert mt="md" color="cyan" p="xs">
            <Text fz="xs">这家供应商门户未开通。审核通过后，接单、交期建议、齐套和发货由采购员代录，并填写代录依据（《9》§2.4）。</Text>
          </Alert>
        )}
      </Card>

      <Card>
        <SectionTitle
          extra={
            <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setLines((prev) => [...prev, newLine()])}>
              加一行
            </Button>
          }
        >
          订单行
        </SectionTitle>
        <EditableTable
          data={lines}
          columns={columns}
          getRowId={(row) => row.key}
          minWidth={1180}
          footer={
            <Table.Tr>
              <Table.Td colSpan={12}>
                <Group justify="flex-end" gap="lg">
                  <Text fz="sm">数量 {fmtQty(totals.qty)}</Text>
                  <Text fz="sm">价税合计 {fmtMoney(totals.amount)}</Text>
                  <Text fz="sm" fw={400}>
                    税额 {fmtMoney(totals.tax)}
                  </Text>
                  <Text fz="sm" fw={400}>
                    金额 {fmtMoney(totals.netAmount)}
                  </Text>
                </Group>
              </Table.Td>
            </Table.Tr>
          }
        />
        {lineError && (
          <Text fz="sm" c="red" mt="xs">
            {lineError}
          </Text>
        )}
        <Stack gap={4} mt="sm">
          <Note>单价和税率取ERP价目表快照，只读；门户不重算采购价格（《7》§四、《6》§二）。取不到ERP价格的SKU置灰，不能加入订单「43」。</Note>
          <Note>可以选任意SKU，供货范围不限制下单「40」。数量只填整数。</Note>
        </Stack>
      </Card>

      <Group justify="space-between">
        <Note>由采购员手工创建。采购申请或计划从哪里来未定「01」。提交后进入单级审核，审核通过即推送ERP。</Note>
        <Group gap="xs">
          <Button variant="default" component={Link} to={order ? `/buyer/orders/${order.id}` : '/buyer/orders'}>
            放弃
          </Button>
          <Button variant="light" onClick={() => save(false)}>
            保存草稿
          </Button>
          <Button onClick={() => save(true)}>提交审核</Button>
        </Group>
      </Group>
    </Stack>
  )
}

/** B03 新建采购订单。 */
export function OrderCreatePage() {
  const role = useSession((s) => s.identity?.role)
  const [params] = useSearchParams()
  if (!can(role, 'order.write')) return <Forbidden message="只有采购员可以新建采购订单。" />
  return (
    <>
      <PageHeader title="新建采购订单" back={{ to: '/buyer/orders', label: '采购订单' }} badges={<Badge color="gray">草稿</Badge>} />
      <OrderFormView presetSupplier={params.get('supplier') ?? undefined} />
    </>
  )
}

/** B04 编辑草稿：只有草稿（含审核驳回退回的）可以进。 */
export function OrderEditPage() {
  const { id = '' } = useParams()
  const query = useApi<OrderDetail>(`/orders/${id}`)
  return (
    <QueryState query={query}>
      {(order) => (
        <>
          <PageHeader title={`编辑 ${order.no}`} back={{ to: `/buyer/orders/${order.id}`, label: '采购订单详情' }} badges={<Badge color="gray">草稿</Badge>} />
          {order.actions.edit.ok ? (
            <>
              {order.rejectComment && (
                <Alert color="orange" mb="md" title="审核驳回">
                  {order.rejectComment}
                </Alert>
              )}
              <OrderFormView key={order.id} order={order} />
            </>
          ) : (
            <Alert color="gray" title="不能编辑">
              {order.actions.edit.reason ?? '只有草稿可以编辑'}。已推送的订单改交期、数量或价格，请在详情页发起订单变更。
            </Alert>
          )}
        </>
      )}
    </QueryState>
  )
}
