import { BarChart } from '@mantine/charts'
import { Alert, Badge, Card, Group, Paper, SegmentedControl, SimpleGrid, Stack, Text } from '@mantine/core'
import { keepPreviousData } from '@tanstack/react-query'
import { DataTable } from 'mantine-datatable'
import type { ReactNode } from 'react'
import { useApi } from '../api/hooks'
import { CodeName, Note, PendingLabel, PendingTag } from '../components/marks'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { StatusBadge } from '../components/StatusBadge'
import { useUrlValue } from '../components/urlState'
import { fmtPercent, fmtQty } from '../domain/format'
import type { PerformanceRow } from '../domain/views'

type Ratio = PerformanceRow['confirm']

function RatioCell({ ratio }: { ratio: Ratio }) {
  return (
    <Stack gap={0} align="flex-end">
      <Text fz="sm" className="qs-num" fw={600}>
        {fmtPercent(ratio.rate)}
      </Text>
      <Text fz={11} c="dimmed" className="qs-num">
        {ratio.denominator ? `${fmtQty(ratio.numerator)} / ${fmtQty(ratio.denominator)}` : '没有样本'}
      </Text>
    </Stack>
  )
}

function Switcher({
  label,
  value,
  onChange,
  data,
  hint,
}: {
  label: ReactNode
  value: string
  onChange: (value: string) => void
  data: { value: string; label: string }[]
  hint: string
}) {
  return (
    <Stack gap={6}>
      <Text fz="sm" fw={600}>
        {label}
      </Text>
      <SegmentedControl fullWidth value={value} onChange={onChange} data={data} />
      <Text fz="xs" c="dimmed">
        {hint}
      </Text>
    </Stack>
  )
}

const notComputed: { name: string; draft: string; reason: ReactNode }[] = [
  { name: '齐套按时率', draft: '预警日之前必报节点都已完成的订单行占比', reason: <>节点清单未定 <PendingTag n={20} />，节点未定就不能算</> },
  { name: '箱码首次识别成功率', draft: '第一次扫描就识别成功的箱数 / 到货箱数', reason: <>扫描结果是否回传门户未定 <PendingTag n={9} />，不回传就没有分子</> },
  { name: '来料合格率', draft: '质检合格数量 / 送检数量', reason: <>检验记录在哪个系统未定 <PendingTag n={9} /></> },
]

const toChart = (rate: number | null) => (rate === null ? null : Math.round(rate * 1000) / 10)

/** B29 绩效看板：《7》§三的口径草案。切换只用于对照，不是选定（「33」）；不排名、不出配额、不拦截下单。 */
export function Performance() {
  const [promise, setPromise] = useUrlValue('promise', 'first')
  const [basis, setBasis] = useUrlValue('basis', 'batch')
  const [confirmBasis, setConfirmBasis] = useUrlValue('confirmBasis', 'line')
  const query = useApi<PerformanceRow[]>(`/performance?promise=${promise}&basis=${basis}&confirmBasis=${confirmBasis}`, {
    placeholderData: keepPreviousData,
  })
  return (
    <>
      <PageHeader
        title="绩效看板"
        badges={
          <Badge color="orange" variant="light">
            口径草案
          </Badge>
        }
        subtitle="只计算门户和ERP已经有数的项目，不做综合评分和配额（《7》§三）。数据来自示例数据。"
      />
      <Stack gap="md">
        <Alert color="orange" variant="light" title="这些比率不能进经营会，也不拦截SRM下单">
          <Text fz="sm">
            分子分母里背景没选过的部分，按下面的切换对照计算，不是选定 <PendingTag n={33} />
            。统计周期、权重和供应商申诉期都没有，不设「每月自动降级」；结果是否影响下单配额也未定。
          </Text>
        </Alert>

        <Card>
          <SectionTitle>计算口径（对照用）</SectionTitle>
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
            <Switcher
              label={<PendingLabel label="交货及时率：承诺交期" n={33} />}
              value={promise}
              onChange={setPromise}
              data={[
                { value: 'first', label: '首次承诺' },
                { value: 'final', label: '最终承诺' },
              ]}
              hint="最终承诺含已生效的交期变更"
            />
            <Switcher
              label={<PendingLabel label="交货及时率：计量" n={33} />}
              value={basis}
              onChange={setBasis}
              data={[
                { value: 'batch', label: '按批次' },
                { value: 'qty', label: '按数量' },
              ]}
              hint="分母是应交：已入库的批次或数量，加上过了承诺交期仍欠交的订单或数量（按不及时计）"
            />
            <Switcher
              label={<PendingLabel label="接单及时率：计量" n={19} />}
              value={confirmBasis}
              onChange={setConfirmBasis}
              data={[
                { value: 'line', label: '按订单行' },
                { value: 'order', label: '按订单' },
              ]}
              hint="下发后24小时内确认接单才算及时；超时补确认和拒绝都不算及时；下发不满24小时且未答复的不计入"
            />
          </SimpleGrid>
        </Card>

        <QueryState query={query}>
          {(rows) => (
            <>
              <Card>
                <SectionTitle extra={query.isPlaceholderData && <Text fz="xs" c="dimmed">重新计算中</Text>}>接单及时率与交货及时率</SectionTitle>
                <BarChart
                  h={280}
                  data={rows.map((r) => ({ supplier: r.supplierShortName, confirm: toChart(r.confirm.rate), delivery: toChart(r.delivery.rate) }))}
                  dataKey="supplier"
                  series={[
                    { name: 'confirm', label: '接单及时率', color: 'jade.6' },
                    { name: 'delivery', label: '交货及时率', color: 'blue.5' },
                  ]}
                  valueFormatter={(value) => `${value}%`}
                  yAxisProps={{ domain: [0, 100] }}
                  withLegend
                  legendProps={{ verticalAlign: 'bottom' }}
                  tickLine="y"
                />
                <Note>没有样本的供应商不画柱子。图里按供应商编码排列，不排名。</Note>
              </Card>

              <Card>
                <SectionTitle>按供应商</SectionTitle>
                <DataTable
                  records={rows}
                  idAccessor="supplierCode"
                  withTableBorder
                  borderRadius="md"
                  minHeight={rows.length ? undefined : 120}
                  noRecordsText="没有可计算的供应商"
                  columns={[
                    { accessor: 'supplierCode', title: '供应商', render: (r) => <CodeName code={r.supplierCode} name={r.supplierName} /> },
                    { accessor: 'tier', title: '分级', render: (r) => <StatusBadge kind="tier" value={r.tier} size="xs" /> },
                    { accessor: 'confirm', title: '接单及时率', textAlign: 'right', render: (r) => <RatioCell ratio={r.confirm} /> },
                    { accessor: 'delivery', title: '交货及时率', textAlign: 'right', render: (r) => <RatioCell ratio={r.delivery} /> },
                    {
                      accessor: 'suggestions',
                      title: '交期建议',
                      render: (r) => (
                        <Text fz="sm">
                          共<span className="qs-num">{r.suggestions.total}</span>次
                          <Text span fz="xs" c="dimmed">
                            {' '}
                            · 待处理{r.suggestions.pending} · 接受{r.suggestions.accepted} · 驳回{r.suggestions.rejected}
                          </Text>
                        </Text>
                      ),
                    },
                    {
                      accessor: 'reconFirstPass',
                      title: <PendingLabel label="对账一次通过率" n={16} />,
                      textAlign: 'right',
                      render: (r) => <RatioCell ratio={r.reconFirstPass} />,
                    },
                  ]}
                />
                <Stack gap={4} mt="xs">
                  <Note>交期建议的次数按状态分开列，被驳回的算不算未定（《7》§三）。</Note>
                  <Note>对账一次通过率：没有差异就确认的对账单数 / 已答复的对账单数。对账由谁发起未定「16」，第二段才有这个指标，这里只做对照。</Note>
                </Stack>
              </Card>
            </>
          )}
        </QueryState>

        <Card>
          <SectionTitle>暂不计算的指标</SectionTitle>
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
            {notComputed.map((item) => (
              <Paper key={item.name} p="sm" radius="md" withBorder>
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Text fz="sm" fw={600}>
                    {item.name}
                  </Text>
                  <Badge size="xs" color="gray" variant="light">
                    不计算
                  </Badge>
                </Group>
                <Text fz="xs" c="dimmed" mt={4}>
                  草案：{item.draft}
                </Text>
                <Text fz="xs" mt={4}>
                  {item.reason}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
        </Card>
      </Stack>
    </>
  )
}
