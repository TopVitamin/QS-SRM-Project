import { Alert, Button, Card, Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useApi } from '../api/hooks'
import { Note } from '../components/marks'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { TraceChain } from '../components/TraceChain'
import type { TraceResult } from '../domain/views'

type Mode = 'box' | 'receipt'

/** B18 箱码追溯：箱码或采购入库单号 → 发货单 → SRM、ERP采购订单 → 入库 → 对账、开票、税票（《5》§四、《9》§2.2）。 */
export function Trace() {
  const [params, setParams] = useSearchParams()
  const box = params.get('box') ?? ''
  const receipt = params.get('receipt') ?? ''
  const current: Mode = receipt && !box ? 'receipt' : 'box'
  const [mode, setMode] = useState<Mode>(current)
  const [input, setInput] = useState(box || receipt)
  const samples = useApi<{ validBox?: string; voidBox?: string; receiptNo?: string }>('/trace/samples')
  const path = box ? `/trace?box=${encodeURIComponent(box)}` : receipt ? `/trace?receipt=${encodeURIComponent(receipt)}` : null
  const result = useApi<TraceResult>(path)

  const search = (nextMode: Mode, value: string) => {
    const text = value.trim()
    setMode(nextMode)
    setInput(text)
    setParams(text ? { [nextMode]: text } : {}, { replace: true })
  }

  const sampleButtons = samples.data
    ? (
        [
          ['有效箱码', 'box', samples.data.validBox],
          ['作废箱码', 'box', samples.data.voidBox],
          ['采购入库单', 'receipt', samples.data.receiptNo],
        ] as const
      ).filter(([, , value]) => !!value)
    : []

  return (
    <>
      <PageHeader title="箱码追溯" subtitle="输入一个外箱的箱码，或一张采购入库单号，追到工厂、批次、订单、入库结果，再到对账和税票。应付、核销、付款在金蝶，这里只写明不画。" />
      <Card mb="md">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            search(mode, input)
          }}
        >
          <Group gap="sm" align="flex-end" wrap="wrap">
            <SegmentedControl
              value={mode}
              onChange={(value) => setMode(value as Mode)}
              data={[
                { value: 'box', label: '箱码' },
                { value: 'receipt', label: '采购入库单号' },
              ]}
            />
            <TextInput
              label={mode === 'box' ? '箱码' : '采购入库单号'}
              placeholder={mode === 'box' ? '例如：BX0000000012' : '例如：CGRK-20261015-0001'}
              leftSection={<IconSearch size={14} />}
              className="qs-mono"
              value={input}
              onChange={(event) => setInput(event.currentTarget.value)}
              w={{ base: '100%', xs: 320 }}
            />
            <Button type="submit">追溯</Button>
          </Group>
        </form>
        {sampleButtons.length > 0 && (
          <Group gap={6} mt="sm">
            <Text fz="xs" c="dimmed">
              示例数据里的样本：
            </Text>
            {sampleButtons.map(([label, kind, value]) => (
              <Button key={label} size="compact-xs" variant="light" onClick={() => search(kind, value!)}>
                {label} <span className="qs-mono" style={{ marginLeft: 4 }}>{value}</span>
              </Button>
            ))}
          </Group>
        )}
      </Card>

      {path ? (
        <Card>
          <SectionTitle>追溯链</SectionTitle>
          <QueryState query={result}>
            {(data) =>
              data.found ? (
                <Stack gap="md">
                  <TraceChain nodes={data.nodes} />
                  <Note>作废的箱码不能再收；追溯时显示作废原因和替换码（《6》§三）。</Note>
                </Stack>
              ) : (
                <Alert color="orange" title="没有找到">
                  {data.message ?? '没有找到'}。可能输错了，或者示例数据刚重置过；可以点上面的样本。
                </Alert>
              )
            }
          </QueryState>
        </Card>
      ) : (
        <Text fz="sm" c="dimmed">
          输入箱码或入库单号后点「追溯」，也可以点上面的样本。
        </Text>
      )}
    </>
  )
}
