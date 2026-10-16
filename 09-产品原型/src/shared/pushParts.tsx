import { Badge, Group, Stack, Table, Text } from '@mantine/core'
import { IconCircleCheck, IconCircleX } from '@tabler/icons-react'
import { DataTable } from 'mantine-datatable'
import { StatusBadge } from '../components/StatusBadge'
import { fmtDateTime } from '../domain/format'
import type { CheckResult, PushJob } from '../domain/types'

const attemptColor = { pending: 'blue', success: 'green', fail: 'red' } as const
const attemptLabel = { pending: '等待回传', success: 'ERP已接收', fail: '失败' } as const

/** 推送记录按次追加，重推沿用同一笔（《4》§一）。 */
export function PushAttempts({ job }: { job: PushJob }) {
  return (
    <DataTable
      records={[...job.attempts].reverse()}
      idAccessor="seq"
      withTableBorder
      borderRadius="md"
      verticalSpacing={6}
      columns={[
        { accessor: 'seq', title: '第几次', width: 64, render: (a) => <Text fz="xs">第{a.seq}次</Text> },
        { accessor: 'trigger', title: '触发', render: (a) => <Text fz="xs">{a.trigger}</Text> },
        { accessor: 'operator', title: '操作者', render: (a) => <Text fz="xs">{a.operator}</Text> },
        { accessor: 'startedAt', title: '发起', render: (a) => <Text fz="xs" className="qs-num">{fmtDateTime(a.startedAt)}</Text> },
        { accessor: 'settledAt', title: '回传', render: (a) => <Text fz="xs" className="qs-num">{fmtDateTime(a.settledAt)}</Text> },
        {
          accessor: 'result',
          title: '结果',
          render: (a) => (
            <Badge size="sm" variant="light" color={attemptColor[a.result]}>
              {attemptLabel[a.result]}
            </Badge>
          ),
        },
        { accessor: 'message', title: 'ERP返回', render: (a) => <Text fz="xs">{a.message || '-'}</Text> },
      ]}
    />
  )
}

export function PushJobSummary({ job }: { job?: PushJob }) {
  if (!job) return <StatusBadge kind="push" value="none" />
  const color = job.status === 'failed' ? 'red' : job.status === 'pushing' ? 'blue' : 'green'
  const label = job.status === 'failed' ? '推送失败' : job.status === 'pushing' ? '推送中' : 'ERP已接收'
  return (
    <Group gap={6} wrap="nowrap">
      <Badge size="sm" variant="light" color={color}>
        {label}
      </Badge>
      <Text fz="xs" c="dimmed">
        共{job.attempts.length}次
      </Text>
    </Group>
  )
}

/** 「核对ERP」逐项比对七项，列出差异（《3》§3.1）。 */
export function CheckResultView({ check }: { check?: CheckResult }) {
  if (!check) return <Text fz="sm" c="dimmed">还没有核对过</Text>
  return (
    <Stack gap="xs">
      <Group gap="xs">
        <Badge color={check.consistent ? 'green' : 'red'} variant="light" leftSection={check.consistent ? <IconCircleCheck size={12} /> : <IconCircleX size={12} />}>
          {check.consistent ? '七项一致' : `${check.items.filter((i) => !i.ok).length}项不一致`}
        </Badge>
        <Text fz="xs" c="dimmed">
          {check.by} · {fmtDateTime(check.at)}
        </Text>
      </Group>
      <Table withTableBorder fz="xs" verticalSpacing={4}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>核对项</Table.Th>
            <Table.Th>SRM</Table.Th>
            <Table.Th>ERP</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {check.items.map((item) => (
            <Table.Tr key={item.item} bg={item.ok ? undefined : 'red.0'}>
              <Table.Td>{item.item}</Table.Td>
              <Table.Td className="qs-mono">{item.srm}</Table.Td>
              <Table.Td className="qs-mono">{item.erp}</Table.Td>
              <Table.Td>{item.ok ? <IconCircleCheck size={14} color="var(--mantine-color-green-7)" /> : <IconCircleX size={14} color="var(--mantine-color-red-7)" />}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  )
}
