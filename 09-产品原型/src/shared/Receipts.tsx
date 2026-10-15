import { Badge, Button, Group, Modal, NumberInput, Paper, SegmentedControl, Select, Stack, Tabs, Text, Textarea } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconFlask } from '@tabler/icons-react'
import { useState } from 'react'
import { useAction, useApi } from '../api/hooks'
import { useEntry } from '../app/entry'
import { ActionButton } from '../components/ActionButton'
import { qtyCell } from '../components/columns'
import { DocNo, ErpReadonly, Note } from '../components/marks'
import { ReasonModal } from '../components/modals'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { ResponsiveList } from '../components/ResponsiveList'
import { StatusBadge, ToneBadge } from '../components/StatusBadge'
import { useUrlValue } from '../components/urlState'
import { EMPTY, fmtDate, fmtDateTime, fmtMoney, fmtQty } from '../domain/format'
import { sumBy } from '../domain/money'
import type { ErpReceipt } from '../domain/types'
import type { NoticeView, ReturnView } from '../domain/views'
import { ReceiptLegend, ReceiptTable, ReturnTable } from './shipmentParts'

type NoticeResult = 'waiting' | 'full' | 'short' | 'zero'

function noticeResult(notice: NoticeView): NoticeResult {
  if (notice.status === 'issued') return 'waiting'
  if (notice.status === 'cancelled') return 'zero'
  return notice.receivedQty < notice.noticeQty ? 'short' : 'full'
}

const resultDefs: Record<NoticeResult, { label: string; short: string; color: string }> = {
  waiting: { label: '待WMS收货', short: '待收货', color: 'blue' },
  full: { label: '全收', short: '全收', color: 'green' },
  short: { label: '缺量', short: '缺量', color: 'orange' },
  zero: { label: '零收，不生成入库单', short: '零收', color: 'dark' },
}

function ResultBadge({ notice }: { notice: NoticeView }) {
  const def = resultDefs[noticeResult(notice)]
  return <ToneBadge color={def.color}>{def.label}</ToneBadge>
}

function NoticeList({ notices }: { notices: NoticeView[] }) {
  const { base, portal } = useEntry()
  const [result, setResult] = useUrlValue('result')
  const rows = notices.filter((n) => !result || noticeResult(n) === result)
  return (
    <Stack gap="sm">
      <SegmentedControl
        size="xs"
        w="fit-content"
        value={result || 'all'}
        onChange={(value) => setResult(value === 'all' ? '' : value)}
        data={[{ value: 'all', label: '全部' }, ...(Object.keys(resultDefs) as NoticeResult[]).map((key) => ({ value: key, label: resultDefs[key].short }))]}
      />
      <ResponsiveList
        records={rows}
        rowKey={(n) => n.id}
        noRecordsText="没有符合条件的收货通知单"
        rowClassName={(n) => (noticeResult(n) === 'zero' ? 'qs-row-muted' : undefined)}
        columns={[
          { accessor: 'no', title: '采购收货通知单', render: (n) => <DocNo no={n.no} /> },
          { accessor: 'shipmentNo', title: '来源发货单', render: (n) => <DocNo no={n.shipmentNo} to={`${base}/shipments/${n.shipmentId}`} /> },
          { accessor: 'orderNo', title: 'SRM采购订单', render: (n) => <DocNo no={n.orderNo} to={`${base}/orders/${n.orderId}`} /> },
          { accessor: 'erpOrderNo', title: 'ERP采购订单', render: (n) => <DocNo no={n.erpOrderNo} /> },
          { accessor: 'supplierName', title: '供应商', hidden: portal },
          { accessor: 'warehouseName', title: '收货仓' },
          { accessor: 'noticeQty', title: '通知数量', textAlign: 'right', render: (n) => qtyCell(n.noticeQty) },
          {
            accessor: 'receivedQty',
            title: '实收',
            textAlign: 'right',
            render: (n) => (n.status === 'issued' ? <Text fz="sm">{EMPTY}</Text> : qtyCell(n.receivedQty, n.receivedQty < n.noticeQty ? 'orange.8' : undefined)),
          },
          { accessor: 'result', title: '收货结果', render: (n) => <ResultBadge notice={n} /> },
          {
            accessor: 'createdAt',
            title: '下发WMS / 结果回传',
            render: (n) => (
              <Text fz="xs" c="dimmed" className="qs-num">
                {fmtDateTime(n.createdAt)}
                <br />
                {fmtDateTime(n.resultAt)}
              </Text>
            ),
          },
        ]}
        card={(n) => (
          <Stack gap={4}>
            <Group justify="space-between" wrap="nowrap">
              <DocNo no={n.no} />
              <ResultBadge notice={n} />
            </Group>
            <Text fz="xs" c="dimmed">
              发货单 <span className="qs-mono">{n.shipmentNo}</span> · {n.warehouseName}
            </Text>
            <Text fz="sm">
              通知 <b className="qs-num">{fmtQty(n.noticeQty)}</b> · 实收 <b className="qs-num">{n.status === 'issued' ? EMPTY : fmtQty(n.receivedQty)}</b>
            </Text>
            <Text fz="xs" c="dimmed" className="qs-num">
              下发 {fmtDateTime(n.createdAt)}
              {n.resultAt ? ` · 回传 ${fmtDateTime(n.resultAt)}` : ''}
            </Text>
          </Stack>
        )}
      />
    </Stack>
  )
}

function ReceiptCards({ receipts }: { receipts: ErpReceipt[] }) {
  if (!receipts.length) {
    return (
      <Text fz="sm" c="dimmed" ta="center" py="md">
        还没有ERP已审核的采购入库单
      </Text>
    )
  }
  return (
    <Stack gap="sm">
      {receipts.map((r) => (
        <Paper key={r.id} p="md" radius="lg" withBorder>
          <Stack gap={4}>
            <Group justify="space-between" wrap="nowrap">
              <DocNo no={r.no} />
              <Text fz="xs" className="qs-num">
                {fmtDate(r.date)}
              </Text>
            </Group>
            <Text fz="xs" c="dimmed">
              通知单 <span className="qs-mono">{r.noticeNo}</span> · 订单 <span className="qs-mono">{r.orderNo}</span>
            </Text>
            {r.lines.map((l) => (
              <Text key={l.lineNo} fz="sm">
                第{l.lineNo}行 {l.skuName}：实收 <b className="qs-num">{fmtQty(l.qty)}</b> / 通知 <span className="qs-num">{fmtQty(l.noticeQty)}</span>
                {l.qty < l.noticeQty && (
                  <Text span c="orange.8" fz="sm">
                    {' '}
                    缺量
                  </Text>
                )}
              </Text>
            ))}
            <Text fz="xs" c="dimmed">
              价税合计 <span className="qs-num">{fmtMoney(sumBy(r.lines, (l) => l.amount))}</span>
            </Text>
          </Stack>
        </Paper>
      ))}
    </Stack>
  )
}

/** 演示ERP发起采购退货：只在企业侧，按入库行退，可退数量 = 累计入库 − 已退。 */
function SimulateReturnModal({ receipt, onClose }: { receipt: ErpReceipt; onClose: () => void }) {
  const run = useAction()
  const [lineNo, setLineNo] = useState<string | null>(String(receipt.lines[0]?.lineNo ?? ''))
  const [qty, setQty] = useState<number | string>(1)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const line = receipt.lines.find((l) => String(l.lineNo) === lineNo)

  const submit = async () => {
    if (!reason.trim()) return setError('请填写退货原因')
    setBusy(true)
    const result = await run(
      `/receipts/${receipt.id}/simulate-return`,
      { lineNo: Number(lineNo), qty: Number(qty), reason: reason.trim() },
      { success: '已模拟ERP生成采购退货单和采退通知' },
    )
    setBusy(false)
    if (result !== undefined) onClose()
  }

  return (
    <Modal opened onClose={onClose} title={`模拟ERP采购退货 · ${receipt.no}`} size="lg">
      <Stack gap="sm">
        <Text fz="sm">退货由ERP发起，门户只看结果、由供应商确认知悉（《3》§3.4）。这里按入库行模拟一笔退货，超过可退数量会被拒绝。</Text>
        <Select
          label="入库行"
          data={receipt.lines.map((l) => ({ value: String(l.lineNo), label: `第${l.lineNo}行 ${l.skuName}（本单实收${fmtQty(l.qty)}）` }))}
          value={lineNo}
          onChange={setLineNo}
          allowDeselect={false}
        />
        <NumberInput label="退货数量" withAsterisk min={1} allowDecimal={false} allowNegative={false} value={qty} onChange={setQty} description={line ? `单位：${line.unit}` : undefined} />
        <Textarea
          label="退货原因"
          withAsterisk
          minRows={2}
          placeholder="例如：入库后抽检外箱破损"
          value={reason}
          error={error}
          onChange={(event) => {
            setReason(event.currentTarget.value)
            setError(undefined)
          }}
        />
        <Note>生成采购退货单（CGTH）和采退通知（CTFHTZ）；WMS出库后才有采退出库单（CTCK），之后才能进对账。</Note>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            取消
          </Button>
          <Button color="gray" loading={busy} onClick={submit}>
            模拟生成退货
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function InboundPanel() {
  const { portal } = useEntry()
  const mobile = useMediaQuery('(max-width: 48em)')
  const notices = useApi<NoticeView[]>('/notices')
  const receipts = useApi<(ErpReceipt & { supplierName: string; warehouseName: string })[]>('/receipts')
  const [returning, setReturning] = useState<ErpReceipt | null>(null)
  return (
    <Stack gap="lg">
      <ErpReadonly title="采购收货通知单（ERP按发货单生成，下发WMS）">
        <QueryState query={notices}>{(rows) => <NoticeList notices={rows} />}</QueryState>
      </ErpReadonly>
      <ErpReadonly title="采购入库单（ERP已审核）">
        <QueryState query={receipts}>
          {(rows) =>
            mobile ? (
              <ReceiptCards receipts={rows} />
            ) : (
              <ReceiptTable
                rows={rows}
                extra={
                  portal
                    ? undefined
                    : (r) => (
                        <Button size="compact-xs" variant="default" leftSection={<IconFlask size={12} />} onClick={() => setReturning(r)}>
                          模拟ERP退货
                        </Button>
                      )
                }
              />
            )
          }
        </QueryState>
      </ErpReadonly>
      <ReceiptLegend />
      {returning && <SimulateReturnModal receipt={returning} onClose={() => setReturning(null)} />}
    </Stack>
  )
}

function ReturnsPanel({ returns }: { returns: ReturnView[] }) {
  const { base, portal } = useEntry()
  const run = useAction()
  const mobile = useMediaQuery('(max-width: 48em)')
  const [ack, setAck] = useUrlValue('ack')
  const [acking, setAcking] = useState<ReturnView | null>(null)
  const rows = returns.filter((r) => !ack || r.ack === ack)

  const outbound = (r: ReturnView) => run(`/returns/${r.id}/simulate-outbound`, {}, { success: '已模拟WMS退货出库，ERP生成采退出库单' })
  const actions = (r: ReturnView) => (
    <Group gap={6} justify="flex-end" wrap="wrap">
      <ActionButton state={r.actions.simulateOutbound} size="compact-xs" variant="default" leftSection={<IconFlask size={12} />} onClick={() => outbound(r)}>
        模拟WMS退货出库
      </ActionButton>
      <ActionButton state={r.actions.ack} size="compact-xs" variant="light" color={portal ? undefined : 'cyan'} onClick={() => setAcking(r)}>
        {portal ? '确认知悉' : '代录确认知悉'}
      </ActionButton>
    </Group>
  )

  return (
    <Stack gap="sm">
      <Note>退货由ERP发起：采购退货单 → 采退通知 → WMS出库后生成采退出库单。供应商在这里确认知悉；补货、扣款不在门户决定「10」。</Note>
      <SegmentedControl
        size="xs"
        w="fit-content"
        value={ack || 'all'}
        onChange={(value) => setAck(value === 'all' ? '' : value)}
        data={[
          { value: 'all', label: '全部' },
          { value: 'pending', label: '待确认知悉' },
          { value: 'acked', label: '已确认知悉' },
        ]}
      />
      {mobile ? (
        rows.length ? (
          <Stack gap="sm">
            {rows.map((r) => (
              <Paper key={r.id} p="md" radius="lg" withBorder>
                <Stack gap={6}>
                  <Group justify="space-between" wrap="nowrap">
                    <DocNo no={r.returnNo} />
                    <StatusBadge kind="returnAck" value={r.ack} size="xs" />
                  </Group>
                  <Text fz="xs" c="dimmed">
                    订单 <span className="qs-mono">{r.orderNo}</span> · {r.erpStatus}
                    {r.outboundDate ? ` · 出库 ${r.outboundDate}` : ''}
                  </Text>
                  {r.lines.map((l) => (
                    <Text key={l.lineNo} fz="sm">
                      第{l.lineNo}行 {l.skuName} × <b className="qs-num">{fmtQty(l.qty)}</b>
                    </Text>
                  ))}
                  <Text fz="sm">原因：{r.reason}</Text>
                  <ActionButton state={r.actions.ack} fullWidth onClick={() => setAcking(r)}>
                    {portal ? '确认知悉' : '代录确认知悉'}
                  </ActionButton>
                </Stack>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Text fz="sm" c="dimmed" ta="center" py="md">
            没有采购退货
          </Text>
        )
      ) : (
        <ReturnTable rows={rows} actions={actions} orderBase={`${base}/orders`} showSupplier={!portal} />
      )}
      <ReasonModal
        opened={!!acking}
        onClose={() => setAcking(null)}
        title={`${portal ? '' : '代录'}确认知悉退货 · ${acking?.returnNo ?? ''}`}
        label={null}
        proxy={!portal}
        confirmLabel="确认知悉"
        description={<Note icon={false}>确认的是已知悉ERP的这笔采购退货，不是同意补货或扣款；补货、扣款不在门户决定「10」。</Note>}
        onSubmit={({ proxy }) => run(`/returns/${acking!.id}/ack`, { proxy }, { success: '已确认知悉' })}
      />
    </Stack>
  )
}

/** B16 / P09 收货结果：ERP回传的通知单、入库单只读；采购退货由供应商确认知悉。 */
export function ReceiptsPage() {
  const { portal } = useEntry()
  const [tab, setTab] = useUrlValue('tab', 'inbound')
  const returns = useApi<ReturnView[]>('/returns')
  const pending = returns.data?.filter((r) => r.ack === 'pending').length ?? 0
  return (
    <>
      <PageHeader
        title={portal ? '收货与退货' : '收货结果'}
        subtitle={
          portal
            ? '经ERP回传的收货结果，只读。一批发货一张通知、一次最终结果：全收、缺量或零收（《5》§三）。'
            : '采购收货通知单和采购入库单来自ERP，只读。零收不生成入库单（《5》§三）。'
        }
      />
      <Tabs value={tab} onChange={(value) => setTab(value ?? 'inbound')} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="inbound">入库回传</Tabs.Tab>
          <Tabs.Tab
            value="returns"
            rightSection={
              pending > 0 ? (
                <Badge size="xs" color="orange" circle={pending < 10}>
                  {pending}
                </Badge>
              ) : undefined
            }
          >
            采购退货
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="inbound">
          <InboundPanel />
        </Tabs.Panel>
        <Tabs.Panel value="returns">
          <SectionTitle>采购退货（ERP发起）</SectionTitle>
          <QueryState query={returns}>{(rows) => <ReturnsPanel returns={rows} />}</QueryState>
        </Tabs.Panel>
      </Tabs>
    </>
  )
}
