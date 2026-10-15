import { Button, Group, Menu, SegmentedControl, Stack, TextInput } from '@mantine/core'
import { IconCheck, IconFlask, IconSearch } from '@tabler/icons-react'
import { useAction, useApi } from '../api/hooks'
import { Note } from '../components/marks'
import { PageHeader } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { matchText, useUrlValue } from '../components/urlState'
import { statusOptions } from '../domain/labels'
import type { UsageStatus } from '../domain/types'
import type { InvoiceView } from '../domain/views'
import { InvoiceRedActions, InvoiceTable } from '../shared/financeParts'

/** 用途确认、入账确认的结果来自税务平台；演示时在这里模拟回传，决定红字走哪条路径。 */
function UsageMenu({ invoice }: { invoice: InvoiceView }) {
  const run = useAction()
  if (invoice.actions.usage.hidden) return null
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <Button size="compact-sm" variant="default" leftSection={<IconFlask size={12} />}>
          模拟用途确认
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>税务平台回传（演示）</Menu.Label>
        {statusOptions('usage').map((option) => (
          <Menu.Item
            key={option.value}
            leftSection={invoice.usageStatus === option.value ? <IconCheck size={14} /> : <span style={{ width: 14 }} />}
            onClick={() => run(`/invoices/${invoice.id}/usage`, { status: option.value as UsageStatus }, { success: `已模拟回传：${option.label}` })}
          >
            {option.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}

/** B23 税票登记：蓝字、红字税票由供应商在门户登记，企业侧查看预校验；用途确认状态只读，演示可切换。 */
export function Invoices() {
  const query = useApi<InvoiceView[]>('/invoices')
  const [kind, setKind] = useUrlValue('kind')
  const [q, setQ] = useUrlValue('q')
  return (
    <>
      <PageHeader
        title="税票登记"
        subtitle="数电票号码20位、没有发票代码（《6》§四）。预校验只查号码格式、门户内重复和金额关系；应付、核销、付款在金蝶。"
      />
      <Group gap="sm" mb="md" align="flex-end" wrap="wrap">
        <TextInput
          label="搜索"
          leftSection={<IconSearch size={14} />}
          placeholder="发票号码、供应商、开票申请"
          value={q}
          onChange={(event) => setQ(event.currentTarget.value)}
          w={{ base: '100%', xs: 280 }}
        />
        <SegmentedControl
          value={kind || 'all'}
          onChange={(value) => setKind(value === 'all' ? '' : value)}
          data={[
            { value: 'all', label: '全部' },
            { value: 'blue', label: '蓝字' },
            { value: 'red', label: '红字' },
          ]}
        />
      </Group>
      <QueryState query={query}>
        {(invoices) => (
          <InvoiceTable
            rows={invoices.filter((i) => (!kind || i.kind === kind) && matchText(q, i.invoiceNo, i.supplierName, i.requestNo, i.blueInvoiceNo))}
            showSupplier
            requestBase="/buyer/invoice-requests"
            noRecordsText="没有符合条件的税票"
            actions={(invoice) => (
              // 菜单和弹窗挂在表格行里，点击会冒泡到行上触发展开，这里截住
              <Stack gap={6} align="flex-end" onClick={(event) => event.stopPropagation()}>
                <UsageMenu invoice={invoice} />
                <InvoiceRedActions invoice={invoice} />
              </Stack>
            )}
          />
        )}
      </QueryState>
      <Stack gap={4} mt="sm">
        <Note>点行展开预校验明细。真伪查验在哪里做、由谁提供见「37」。</Note>
        <Note>用途确认、入账确认的结果来自税务平台，门户只读；能否自动同步、税务平台上由谁操作见「14」。演示时用「模拟用途确认」切换，决定红字走直接开具还是确认单。</Note>
      </Stack>
    </>
  )
}
