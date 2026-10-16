import { Table } from '@mantine/core'
import { FlexRender, useTable, type RowData } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import { editableFeatures, type EditableColumn } from './editableTable'

interface EditableTableProps<T extends RowData> {
  data: T[]
  /** 列定义要在调用方用useMemo固定：单元格函数一变，输入框会重新挂载、丢焦点。 */
  columns: EditableColumn<T>[]
  getRowId: (row: T, index: number) => string
  footer?: ReactNode
  minWidth?: number
  empty?: ReactNode
}

export function EditableTable<T extends RowData>({ data, columns, getRowId, footer, minWidth = 960, empty }: EditableTableProps<T>) {
  const table = useTable({ features: editableFeatures, columns, data, getRowId })
  const rows = table.getRowModel().rows
  return (
    <Table.ScrollContainer minWidth={minWidth}>
      <Table withTableBorder verticalSpacing={6} horizontalSpacing="xs" className="qs-edit-table" highlightOnHover={false}>
        <Table.Thead>
          {table.getHeaderGroups().map((group) => (
            <Table.Tr key={group.id}>
              {group.headers.map((header) => {
                const meta = header.column.columnDef.meta
                return (
                  <Table.Th key={header.id} style={{ width: meta?.width, textAlign: meta?.align }}>
                    {header.isPlaceholder ? null : <FlexRender header={header} />}
                  </Table.Th>
                )
              })}
            </Table.Tr>
          ))}
        </Table.Thead>
        <Table.Tbody>
          {rows.length === 0 && empty ? (
            <Table.Tr>
              <Table.Td colSpan={columns.length}>{empty}</Table.Td>
            </Table.Tr>
          ) : (
            rows.map((row) => (
              <Table.Tr key={row.id}>
                {row.getAllCells().map((cell) => (
                  <Table.Td key={cell.id} style={{ textAlign: cell.column.columnDef.meta?.align }}>
                    <FlexRender cell={cell} />
                  </Table.Td>
                ))}
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
        {footer && <Table.Tfoot>{footer}</Table.Tfoot>}
      </Table>
    </Table.ScrollContainer>
  )
}
