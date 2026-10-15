import { Alert, Card, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core'
import { useNavigate, useParams } from 'react-router'
import { useAction, useApi } from '../api/hooks'
import { ActionButton } from '../components/ActionButton'
import { numCell } from '../components/columns'
import { Fields } from '../components/Fields'
import { CodeName, DocNo, Note, PendingTag } from '../components/marks'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { ResponsiveList } from '../components/ResponsiveList'
import { StatusBadge } from '../components/StatusBadge'
import { fmtDateTime, fmtMoney } from '../domain/format'
import { sumMoney } from '../domain/money'
import type { InvoiceRequestView, ReconView } from '../domain/views'
import { InvoiceRedActions, InvoiceTable } from '../shared/financeParts'

function BuyerName({ name }: { name: string }) {
  return (
    <Text fz="sm" span>
      {name} <PendingTag n={15} />
    </Text>
  )
}

function KingdeeCell() {
  return (
    <Text fz="xs" c="dimmed" span>
      未定 <PendingTag n={14} />
    </Text>
  )
}

/** 已确认、还没生成开票申请的对账单。生成开票申请是财务的动作。 */
function ConfirmedRecons() {
  const navigate = useNavigate()
  const run = useAction()
  const query = useApi<ReconView[]>('/reconciliations')
  return (
    <QueryState query={query}>
      {(recons) => {
        const rows = recons.filter((r) => r.status === 'confirmed' && !r.request)
        if (!rows.length) return null
        return (
          <Card mb="md">
            <SectionTitle>已确认对账，待生成开票申请</SectionTitle>
            <Stack gap="xs">
              {rows.map((r) => (
                <Group key={r.id} justify="space-between" wrap="wrap" gap="xs">
                  <Group gap="sm" wrap="wrap">
                    <DocNo no={r.no} to={`/buyer/reconciliations/${r.id}`} />
                    <Text fz="sm">{r.supplierName}</Text>
                    <Text fz="sm" c="dimmed" className="qs-num">
                      {r.period} · 价税合计 {fmtMoney(r.totals.amount)}
                    </Text>
                  </Group>
                  <ActionButton
                    state={r.actions.createRequest.hidden ? { ok: false, reason: '生成开票申请由财务操作' } : r.actions.createRequest}
                    size="xs"
                    onClick={async () => {
                      const result = await run<InvoiceRequestView>(`/reconciliations/${r.id}/request`, {}, { success: '已生成开票申请' })
                      if (result) navigate(`/buyer/invoice-requests/${result.id}`)
                    }}
                  >
                    生成开票申请
                  </ActionButton>
                </Group>
              ))}
            </Stack>
          </Card>
        )
      }}
    </QueryState>
  )
}

/** B21 开票申请：从已确认对账生成，一张对账单先对应一张申请（「18」）。 */
export function InvoiceRequestList() {
  const navigate = useNavigate()
  const query = useApi<InvoiceRequestView[]>('/invoice-requests')
  return (
    <>
      <PageHeader title="开票申请" subtitle="对账确认之后才开票（《4》§六）。供应商按申请在门户登记20位数电票号码，门户只做预校验；应付、核销、付款在金蝶。" />
      <ConfirmedRecons />
      <QueryState query={query}>
        {(rows) => (
          <ResponsiveList
            records={rows}
            rowKey={(r) => r.id}
            onOpen={(r) => navigate(`/buyer/invoice-requests/${r.id}`)}
            noRecordsText="还没有开票申请"
            columns={[
              { accessor: 'no', title: '开票申请', render: (r) => <DocNo no={r.no} to={`/buyer/invoice-requests/${r.id}`} /> },
              { accessor: 'supplierName', title: '销售方（供应商）', render: (r) => <CodeName code={r.supplierCode} name={r.supplierName} /> },
              { accessor: 'reconciliationNo', title: '对账单', render: (r) => <DocNo no={r.reconciliationNo} to={`/buyer/reconciliations/${r.reconciliationId}`} /> },
              { accessor: 'period', title: '期间', render: (r) => <Text fz="sm" className="qs-num">{r.period}</Text> },
              { accessor: 'buyerName', title: '购买方', render: (r) => <BuyerName name={r.buyerName} /> },
              { accessor: 'amount', title: '应开价税合计', textAlign: 'right', render: (r) => numCell(fmtMoney(r.amount), true) },
              { accessor: 'tax', title: '税额', textAlign: 'right', render: (r) => numCell(fmtMoney(r.tax)) },
              { accessor: 'taxRates', title: '税率', render: (r) => <Text fz="sm">{r.taxRates.map((t) => `${t}%`).join('、')}</Text> },
              { accessor: 'status', title: '状态', render: (r) => <StatusBadge kind="request" value={r.status} size="xs" /> },
              {
                accessor: 'invoices',
                title: '已登记税票 / 预校验',
                render: (r) =>
                  r.invoices.length ? (
                    <Stack gap={2}>
                      {r.invoices.map((i) => (
                        <Group key={i.id} gap={4} wrap="nowrap">
                          <Text fz="xs" className="qs-mono" c={i.kind === 'red' ? 'red.7' : undefined}>
                            {i.invoiceNo}
                          </Text>
                          <StatusBadge kind="precheck" value={i.precheck.overall} size="xs" />
                        </Group>
                      ))}
                    </Stack>
                  ) : (
                    <Text fz="xs" c="dimmed">
                      还没有
                    </Text>
                  ),
              },
              { accessor: 'kingdee', title: '推送金蝶', render: () => <KingdeeCell /> },
              { accessor: 'createdAt', title: '生成', render: (r) => <Text fz="xs" c="dimmed">{r.createdBy} · <span className="qs-num">{fmtDateTime(r.createdAt)}</span></Text> },
            ]}
            card={(r) => (
              <Stack gap={4}>
                <Group justify="space-between" wrap="nowrap">
                  <DocNo no={r.no} />
                  <StatusBadge kind="request" value={r.status} size="xs" />
                </Group>
                <Text fz="sm">{r.supplierName}</Text>
                <Text fz="sm">
                  应开 <b className="qs-num">{fmtMoney(r.amount)}</b> · 税额 <span className="qs-num">{fmtMoney(r.tax)}</span>
                </Text>
              </Stack>
            )}
          />
        )}
      </QueryState>
      <Note>一张开票申请先登记一张蓝字税票；多张对账合开、一张对账分开的组合规则见「18」。</Note>
    </>
  )
}

/** B22 开票申请详情：应开金额和税额、已登记税票、预校验结果。 */
export function InvoiceRequestDetailPage() {
  const { id = '' } = useParams()
  const query = useApi<InvoiceRequestView>(`/invoice-requests/${id}`)
  return (
    <QueryState query={query}>
      {(request) => {
        const blue = request.invoices.filter((i) => i.kind === 'blue')
        const registered = sumMoney(blue, (i) => i.remaining)
        return (
          <>
            <PageHeader
              back={{ to: '/buyer/invoice-requests', label: '开票申请' }}
              title={<span className="qs-mono">{request.no}</span>}
              badges={<StatusBadge kind="request" value={request.status} />}
              subtitle={`${request.supplierName} · 期间 ${request.period}`}
            />
            <Stack gap="md">
              {request.status === 'reissue' && (
                <Alert color="violet" p="sm">
                  蓝票已全额红冲，等供应商按这张申请重新开具并登记。
                </Alert>
              )}
              <Card>
                <SectionTitle>应开票</SectionTitle>
                <Fields
                  items={[
                    { label: '销售方（供应商）', value: <CodeName code={request.supplierCode} name={request.supplierName} /> },
                    { label: '购买方', value: <BuyerName name={request.buyerName} /> },
                    { label: '对账单', value: <DocNo no={request.reconciliationNo} to={`/buyer/reconciliations/${request.reconciliationId}`} /> },
                    { label: '税率', value: request.taxRates.map((t) => `${t}%`).join('、') },
                    { label: '生成', value: `${request.createdBy} · ${fmtDateTime(request.createdAt)}` },
                    { label: '推送金蝶', value: <KingdeeCell /> },
                  ]}
                />
                <SimpleGrid cols={{ base: 1, xs: 4 }} spacing="sm" mt="md">
                  {(
                    [
                      ['应开价税合计', request.amount],
                      ['应开税额', request.tax],
                      ['应开金额', request.netAmount],
                      ['已登记蓝票（扣除红冲）', registered],
                    ] as const
                  ).map(([label, value]) => (
                    <Paper key={label} p="sm" radius="md" bg="gray.0">
                      <Text fz="xs" c="dimmed">
                        {label}
                      </Text>
                      <Text fz="lg" fw={650} className="qs-num">
                        {fmtMoney(value)}
                      </Text>
                    </Paper>
                  ))}
                </SimpleGrid>
              </Card>
              <Card>
                <SectionTitle>已登记税票</SectionTitle>
                <InvoiceTable rows={request.invoices} actions={(invoice) => <InvoiceRedActions invoice={invoice} />} noRecordsText="供应商还没有登记税票" />
                <Note>点行展开预校验明细。号码格式和门户内查重会拦住登记；金额差额只提示，容差未设定「17」；真伪查验未接入「37」。</Note>
              </Card>
              <Note>一张开票申请先对应一张蓝字税票「18」。SRM不建应付、不付款：应付、核销、付款在金蝶（《3》§3.5）。</Note>
            </Stack>
          </>
        )
      }}
    </QueryState>
  )
}
