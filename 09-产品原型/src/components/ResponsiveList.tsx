import { EmptyState, Paper, Stack } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconInbox } from '@tabler/icons-react'
import { DataTable, type DataTableColumn } from 'mantine-datatable'
import type { ReactNode } from 'react'

interface ResponsiveListProps<T> {
  records: T[]
  columns: DataTableColumn<T>[]
  rowKey: (record: T) => string
  /** 手机上每条记录渲染成一张卡片。 */
  card: (record: T) => ReactNode
  onOpen?: (record: T) => void
  noRecordsText?: string
  rowClassName?: (record: T) => string | undefined
  fetching?: boolean
}

/** 宽屏是表格，手机上变成卡片列表（10.6）。 */
export function ResponsiveList<T>({ records, columns, rowKey, card, onOpen, noRecordsText = '没有记录', rowClassName, fetching }: ResponsiveListProps<T>) {
  const mobile = useMediaQuery('(max-width: 48em)')
  if (mobile) {
    if (!records.length) return <EmptyState py={40} icon={<IconInbox size={24} />} title={noRecordsText} />
    return (
      <Stack gap="sm">
        {records.map((record) => (
          <Paper
            key={rowKey(record)}
            p="md"
            radius="lg"
            withBorder
            className={onOpen ? 'qs-card-link' : undefined}
            onClick={onOpen ? () => onOpen(record) : undefined}
          >
            {card(record)}
          </Paper>
        ))}
      </Stack>
    )
  }
  return (
    <DataTable<T>
      records={records}
      columns={columns}
      idAccessor={rowKey}
      onRowClick={onOpen ? ({ record }) => onOpen(record) : undefined}
      rowClassName={rowClassName ? (record) => rowClassName(record) ?? '' : undefined}
      noRecordsText={noRecordsText}
      minHeight={records.length ? undefined : 180}
      withTableBorder
      borderRadius="lg"
      highlightOnHover
      fetching={fetching}
    />
  )
}
