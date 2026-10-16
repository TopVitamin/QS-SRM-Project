import { Card, Group, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useApi } from '../api/hooks'
import { ActionButton } from '../components/ActionButton'
import { numCell } from '../components/columns'
import { DocNo, Note, PendingTag } from '../components/marks'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { ResponsiveList } from '../components/ResponsiveList'
import { StatusBadge } from '../components/StatusBadge'
import { fmtMoney, fmtRate } from '../domain/format'
import type { InvoiceRequestView, InvoiceView } from '../domain/views'
import { InvoiceRedActions, InvoiceTable, RegisterBlueModal } from '../shared/financeParts'

/** P12 门户开票：按开票申请登记20位数电票，即时预校验；应付、核销、付款在金蝶（《8》§四、《3》§3.5）。 */
export function Invoicing() {
  const requests = useApi<InvoiceRequestView[]>('/invoice-requests')
  const invoices = useApi<InvoiceView[]>('/invoices')
  const [registering, setRegistering] = useState<InvoiceRequestView | null>(null)

  return (
    <>
      <PageHeader
        title="开票"
        subtitle="对账确认之后才开票。按开票申请登记20位数电票号码，门户只做预校验；应付、核销、付款在金蝶（《3》§3.5）。"
      />
      <Stack gap="md">
        <Card>
          <SectionTitle>开票申请</SectionTitle>
          <QueryState query={requests}>
            {(rows) => (
              <ResponsiveList
                records={rows}
                rowKey={(r) => r.id}
                noRecordsText="还没有开票申请"
                columns={[
                  { accessor: 'no', title: '开票申请', render: (r) => <DocNo no={r.no} /> },
                  { accessor: 'reconciliationNo', title: '对账单', render: (r) => <DocNo no={r.reconciliationNo} to={`/portal/reconciliations/${r.reconciliationId}`} /> },
                  { accessor: 'period', title: '期间', render: (r) => <Text fz="sm" className="qs-num">{r.period}</Text> },
                  {
                    accessor: 'buyerName',
                    title: '购买方',
                    render: (r) => (
                      <Text fz="sm">
                        {r.buyerName} <PendingTag n={15} />
                      </Text>
                    ),
                  },
                  { accessor: 'amount', title: '应开价税合计', textAlign: 'right', render: (r) => numCell(fmtMoney(r.amount), true) },
                  { accessor: 'tax', title: '税额', textAlign: 'right', render: (r) => numCell(fmtMoney(r.tax)) },
                  { accessor: 'netAmount', title: '金额', textAlign: 'right', render: (r) => numCell(fmtMoney(r.netAmount)) },
                  { accessor: 'taxRates', title: '税率', render: (r) => <Text fz="sm">{r.taxRates.map((rate) => fmtRate(rate)).join('、')}</Text> },
                  { accessor: 'status', title: '状态', render: (r) => <StatusBadge kind="request" value={r.status} size="xs" /> },
                  {
                    accessor: 'invoices',
                    title: '已登记税票',
                    render: (r) =>
                      r.invoices.length ? (
                        <Stack gap={2}>
                          {r.invoices.map((i) => (
                            <Text key={i.id} fz="xs" className="qs-mono" c={i.kind === 'red' ? 'red.7' : undefined}>
                              {i.invoiceNo}
                            </Text>
                          ))}
                        </Stack>
                      ) : (
                        <Text fz="xs" c="dimmed">
                          还没有
                        </Text>
                      ),
                  },
                  {
                    accessor: 'actions',
                    title: '',
                    textAlign: 'right',
                    render: (r) => (
                      <ActionButton state={r.actions.registerBlue} size="compact-sm" onClick={() => setRegistering(r)}>
                        {r.status === 'reissue' ? '重新登记' : '登记蓝字税票'}
                      </ActionButton>
                    ),
                  },
                ]}
                card={(r) => (
                  <Stack gap={6}>
                    <Group justify="space-between" wrap="nowrap">
                      <DocNo no={r.no} />
                      <StatusBadge kind="request" value={r.status} size="xs" />
                    </Group>
                    <Text fz="xs" c="dimmed">
                      对账单 <span className="qs-mono">{r.reconciliationNo}</span> · {r.period}
                    </Text>
                    <Text fz="sm">
                      购买方 {r.buyerName} <PendingTag n={15} />
                    </Text>
                    <Text fz="sm">
                      应开 <b className="qs-num">{fmtMoney(r.amount)}</b> · 税额 <span className="qs-num">{fmtMoney(r.tax)}</span>
                    </Text>
                    {r.invoices.length > 0 && (
                      <Text fz="xs" className="qs-mono">
                        已登记 {r.invoices.map((i) => i.invoiceNo).join('、')}
                      </Text>
                    )}
                    <ActionButton state={r.actions.registerBlue} fullWidth onClick={() => setRegistering(r)}>
                      {r.status === 'reissue' ? '重新登记' : '登记蓝字税票'}
                    </ActionButton>
                  </Stack>
                )}
              />
            )}
          </QueryState>
        </Card>

        <Card>
          <SectionTitle>已登记税票</SectionTitle>
          <QueryState query={invoices}>{(rows) => <InvoiceTable rows={rows} actions={(invoice) => <InvoiceRedActions invoice={invoice} />} />}</QueryState>
        </Card>

        <Stack gap={4}>
          <Note>一张开票申请先登记一张蓝字税票；全额红冲后可以重新登记。专票和普票是否不混开、同一张税票内必须相同的项目见「18」。</Note>
          <Note>号码格式、门户内查重、金额关系不通过时拦住登记；和开票申请的差额只提示，容差见「17」；真伪查验未接入「37」。</Note>
          <Note>开票申请、税票、对账单向金蝶推送哪些对象、红字确认单由谁在税务平台操作见「14」。应付、核销、付款在金蝶，SRM不建应付、不付款（《3》§3.5）。</Note>
        </Stack>
      </Stack>
      {registering && <RegisterBlueModal request={registering} onClose={() => setRegistering(null)} />}
    </>
  )
}
