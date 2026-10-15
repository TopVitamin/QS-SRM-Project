import { Badge, Card, Group, SegmentedControl, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useAction, useApi } from '../api/hooks'
import { useEntry } from '../app/entry'
import { ActionButton } from '../components/ActionButton'
import { numCell } from '../components/columns'
import { Countdown } from '../components/Countdown'
import { DocNo, Note } from '../components/marks'
import { ReasonModal } from '../components/modals'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { ResponsiveList } from '../components/ResponsiveList'
import { StatusBadge } from '../components/StatusBadge'
import { useUrlValue } from '../components/urlState'
import { EMPTY, fmtDateTime, fmtMoney } from '../domain/format'
import type { InvoiceView, RedLetterView } from '../domain/views'
import { InvoiceRedActions, InvoiceTable, RegisterRedModal } from './financeParts'

type RedFilter = 'all' | 'mine' | 'open' | 'issued' | 'voided'

const needsMe = (red: RedLetterView) => !red.actions.confirm.hidden || !red.actions.registerRed.hidden

function matches(red: RedLetterView, filter: RedFilter) {
  if (filter === 'mine') return needsMe(red)
  if (filter === 'open') return red.effectiveStatus === 'waiting' || red.effectiveStatus === 'confirmed'
  if (filter === 'issued' || filter === 'voided') return red.effectiveStatus === filter
  return true
}

function PathBadge({ red }: { red: RedLetterView }) {
  return (
    <Badge size="xs" variant="outline" color={red.path === 'form' ? 'orange' : 'gray'} radius="sm">
      {red.path === 'form' ? '红字确认单' : '直接开红字'}
    </Badge>
  )
}

function Deadline({ red }: { red: RedLetterView }) {
  if (red.path !== 'form') return <Text fz="xs">{EMPTY}</Text>
  if (red.effectiveStatus === 'waiting') return <Countdown deadline={red.deadline} variant="text" overdueText="已超72小时" />
  if (red.effectiveStatus === 'voided') {
    return (
      <Text fz="xs" c="dimmed">
        超72小时未确认
      </Text>
    )
  }
  return (
    <Text fz="xs" c="dimmed" className="qs-num">
      {red.confirmedBy ? `${red.confirmedBy} · ` : ''}
      {fmtDateTime(red.confirmedAt)}
    </Text>
  )
}

const initiatorLabel = (red: RedLetterView) => (red.path === 'direct' ? '销售方' : red.initiator === 'seller' ? '销售方发起' : '购买方发起')

/** B24 / P13 红字确认：两条路径，接口按用途确认状态给出可用的那一条（《8》§四）。 */
export function RedLettersPage() {
  const { portal } = useEntry()
  const run = useAction()
  const reds = useApi<RedLetterView[]>('/red-letters')
  const invoices = useApi<InvoiceView[]>('/invoices')
  const [filter, setFilter] = useUrlValue('filter', 'all')
  const [confirming, setConfirming] = useState<RedLetterView | null>(null)
  const [registering, setRegistering] = useState<RedLetterView | null>(null)

  const actions = (red: RedLetterView) => (
    <Group gap={6} justify="flex-end" wrap="wrap">
      <ActionButton state={red.actions.confirm} size="compact-sm" onClick={() => setConfirming(red)}>
        确认
      </ActionButton>
      <ActionButton state={red.actions.registerRed} size="compact-sm" onClick={() => setRegistering(red)}>
        登记红字号码
      </ActionButton>
    </Group>
  )

  return (
    <>
      <PageHeader
        title="红字确认"
        subtitle="蓝票未用途确认且未入账确认：销售方直接开红字，门户只登记号码。已用途确认或入账确认：先走红字确认单，对方72小时内确认，超时作废（《8》§四）。"
      />
      <Stack gap="md">
        <Card>
          <SectionTitle
            extra={
              <SegmentedControl
                size="xs"
                value={filter}
                onChange={setFilter}
                data={[
                  { value: 'all', label: '全部' },
                  { value: 'mine', label: '待我方处理' },
                  { value: 'open', label: '处理中' },
                  { value: 'issued', label: '已开具' },
                  { value: 'voided', label: '已作废' },
                ]}
              />
            }
          >
            红字记录
          </SectionTitle>
          <QueryState query={reds}>
            {(rows) => (
              <ResponsiveList
                records={rows.filter((r) => matches(r, filter as RedFilter))}
                rowKey={(r) => r.id}
                noRecordsText="没有符合条件的红字记录"
                rowClassName={(r) => (needsMe(r) ? 'qs-row-warn' : r.effectiveStatus === 'voided' ? 'qs-row-muted' : undefined)}
                columns={[
                  {
                    accessor: 'formNo',
                    title: '路径 / 确认单号',
                    render: (r) => (
                      <Stack gap={2}>
                        <PathBadge red={r} />
                        {r.formNo && <DocNo no={r.formNo} size="xs" />}
                      </Stack>
                    ),
                  },
                  { accessor: 'blueInvoiceNo', title: '蓝字发票', render: (r) => <DocNo no={r.blueInvoiceNo} size="xs" /> },
                  { accessor: 'supplierName', title: '销售方（供应商）', hidden: portal },
                  { accessor: 'scope', title: '范围', render: (r) => <Text fz="sm">{r.scope === 'full' ? '全额' : '部分'}</Text> },
                  { accessor: 'amount', title: '红冲价税合计', textAlign: 'right', render: (r) => numCell(fmtMoney(-r.amount), true) },
                  { accessor: 'tax', title: '红冲税额', textAlign: 'right', render: (r) => numCell(fmtMoney(-r.tax)) },
                  { accessor: 'reason', title: '原因', render: (r) => <Text fz="sm">{r.reason}</Text> },
                  {
                    accessor: 'initiator',
                    title: '发起',
                    render: (r) => (
                      <Text fz="xs">
                        {initiatorLabel(r)}
                        {r.initiatedBy ? ` · ${r.initiatedBy}` : ''}
                      </Text>
                    ),
                  },
                  { accessor: 'deadline', title: '72小时时限 / 确认', render: (r) => <Deadline red={r} /> },
                  { accessor: 'effectiveStatus', title: '状态', render: (r) => <StatusBadge kind="red" value={r.effectiveStatus} size="xs" /> },
                  { accessor: 'redInvoiceNo', title: '红字发票', render: (r) => <DocNo no={r.redInvoiceNo} size="xs" /> },
                  { accessor: 'actions', title: '', textAlign: 'right', render: actions },
                ]}
                card={(r) => (
                  <Stack gap={6}>
                    <Group justify="space-between" wrap="nowrap">
                      <PathBadge red={r} />
                      <StatusBadge kind="red" value={r.effectiveStatus} size="xs" />
                    </Group>
                    {r.formNo && <DocNo no={r.formNo} />}
                    <Text fz="xs" c="dimmed">
                      冲 <span className="qs-mono">{r.blueInvoiceNo}</span> · {r.scope === 'full' ? '全额' : '部分'} · {initiatorLabel(r)}
                    </Text>
                    <Text fz="sm">
                      红冲价税合计 <b className="qs-num">{fmtMoney(-r.amount)}</b>
                    </Text>
                    <Deadline red={r} />
                    {r.redInvoiceNo && (
                      <Text fz="xs">
                        红字发票 <span className="qs-mono">{r.redInvoiceNo}</span>
                      </Text>
                    )}
                    {actions(r)}
                  </Stack>
                )}
              />
            )}
          </QueryState>
          <Note>红字确认单号是模拟编号。税务平台上的填开、确认由谁操作，门户里的记录能否和税务平台同步见「14」。</Note>
        </Card>

        <Card>
          <SectionTitle>可红冲的蓝票</SectionTitle>
          <QueryState query={invoices}>
            {(rows) => {
              const blues = rows.filter(
                (i) => i.kind === 'blue' && i.remaining > 0 && (!i.actions.redDirect.hidden || !i.actions.redFormSeller.hidden || !i.actions.redFormBuyer.hidden),
              )
              return (
                <InvoiceTable
                  rows={blues}
                  showSupplier={!portal}
                  requestBase={portal ? undefined : '/buyer/invoice-requests'}
                  noRecordsText={portal ? '没有可红冲的蓝票' : '没有需要购买方发起红字确认单的蓝票（只有财务、且蓝票已用途确认或入账确认时才有）'}
                  actions={(invoice) => <InvoiceRedActions invoice={invoice} />}
                />
              )
            }}
          </QueryState>
          <Note>
            {portal
              ? '能不能直接开红字，取决于购买方是否已用途确认或入账确认；状态来自税务平台，演示时由企业侧在「税票登记」里模拟回传。'
              : '购买方只能对已用途确认或入账确认的蓝票发起红字确认单；用途确认状态在「税票登记」里模拟税务平台回传。'}
          </Note>
        </Card>
      </Stack>

      <ReasonModal
        opened={!!confirming}
        onClose={() => setConfirming(null)}
        title={`确认红字确认单 · ${confirming?.formNo ?? ''}`}
        label={null}
        confirmLabel="确认"
        description={
          confirming
            ? `蓝字发票${confirming.blueInvoiceNo}，红冲价税合计${fmtMoney(-confirming.amount)}。确认后由销售方在税务平台开具红字发票，再回门户登记号码。税务平台上的确认由谁操作见「14」。`
            : undefined
        }
        onSubmit={() => run(`/red-letters/${confirming!.id}/confirm`, {}, { success: '已确认红字确认单' })}
      />
      {registering && <RegisterRedModal red={registering} onClose={() => setRegistering(null)} />}
    </>
  )
}
