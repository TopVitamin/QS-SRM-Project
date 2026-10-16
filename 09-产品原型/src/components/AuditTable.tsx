import { Anchor, Badge, Group, Stack, Text } from '@mantine/core'
import { DataTable, type DataTableColumn } from 'mantine-datatable'
import { useState } from 'react'
import { Link } from 'react-router'
import { fmtDateTime } from '../domain/format'
import type { AuditLog } from '../domain/types'
import { ProxyBadge } from './marks'

const partyLabels: Record<AuditLog['party'], string> = { enterprise: '企业侧', supplier: '供应商', system: '系统' }

function show(value: unknown) {
  if (value === undefined || value === null || value === '') return '-'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export function ChangeSummary({ before, after }: { before?: Record<string, unknown>; after?: Record<string, unknown> }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
  if (!keys.length) return <Text fz="xs">-</Text>
  return (
    <Stack gap={0}>
      {keys.map((key) => {
        const from = before?.[key]
        const to = after?.[key]
        const changed = before && after && show(from) !== show(to)
        return (
          <Text key={key} fz="xs" c={before && after && !changed ? 'dimmed' : undefined}>
            {key}：{before && key in before ? `${show(from)} → ` : ''}
            <Text span fz="xs" fw={changed ? 650 : undefined}>
              {show(to)}
            </Text>
          </Text>
        )
      })}
    </Stack>
  )
}

interface AuditTableProps {
  logs: AuditLog[]
  minHeight?: number
  withObject?: boolean
  /** 对象列能点到单据页时返回地址。 */
  objectLink?: (log: AuditLog) => string | undefined
  /** 设了就分页。筛选条件变化时由调用方换key，回到第一页。 */
  pageSize?: number
}

/** 操作日志只追加、只读，没有删除（《4》§五、《8》§二）。 */
export function AuditTable({ logs, minHeight = 160, withObject = true, objectLink, pageSize }: AuditTableProps) {
  const [page, setPage] = useState(1)
  const columns: DataTableColumn<AuditLog>[] = [
    { accessor: 'at', title: '时间', width: 136, render: (log) => <Text fz="xs" className="qs-num">{fmtDateTime(log.at)}</Text> },
    {
      accessor: 'actorName',
      title: '操作者',
      width: 150,
      render: (log) => (
        <Stack gap={0}>
          <Text fz="xs">{log.actorName}</Text>
          <Text fz={11} c="dimmed">
            {partyLabels[log.party]} · {log.actorRole}
          </Text>
        </Stack>
      ),
    },
    {
      accessor: 'objectNo',
      title: '对象',
      hidden: !withObject,
      width: 200,
      render: (log) => {
        const to = objectLink?.(log)
        return (
          <Stack gap={0}>
            <Text fz={11} c="dimmed">
              {log.objectType}
            </Text>
            {to ? (
              <Anchor component={Link} to={to} fz="xs" className="qs-mono">
                {log.objectNo}
              </Anchor>
            ) : (
              <Text fz="xs" className="qs-mono">
                {log.objectNo}
              </Text>
            )}
          </Stack>
        )
      },
    },
    {
      accessor: 'action',
      title: '动作',
      render: (log) => (
        <Group gap={6} wrap="nowrap">
          <Text fz="xs" fw={600}>
            {log.action}
          </Text>
          <ProxyBadge info={log.proxy} />
        </Group>
      ),
    },
    { accessor: 'after', title: '前后值', render: (log) => <ChangeSummary before={log.before} after={log.after} /> },
    {
      accessor: 'note',
      title: '备注',
      render: (log) =>
        log.note ? (
          <Text fz="xs" c="dimmed">
            {log.note}
          </Text>
        ) : (
          <Text fz="xs">-</Text>
        ),
    },
  ]
  const common = {
    idAccessor: 'id',
    minHeight: logs.length ? undefined : minHeight,
    noRecordsText: '还没有操作记录',
    withTableBorder: true,
    borderRadius: 'md',
    verticalSpacing: 'xs',
    columns,
  } as const
  if (!pageSize) return <DataTable<AuditLog> {...common} records={logs} />
  const current = Math.min(page, Math.max(1, Math.ceil(logs.length / pageSize)))
  return (
    <DataTable<AuditLog>
      {...common}
      records={logs.slice((current - 1) * pageSize, current * pageSize)}
      totalRecords={logs.length}
      recordsPerPage={pageSize}
      page={current}
      onPageChange={setPage}
      paginationText={({ from, to, totalRecords }) => `第${from}-${to}条，共${totalRecords}条`}
    />
  )
}

export function ReadonlyLogBadge() {
  return (
    <Badge variant="light" color="gray" size="sm">
      只追加·只读
    </Badge>
  )
}
