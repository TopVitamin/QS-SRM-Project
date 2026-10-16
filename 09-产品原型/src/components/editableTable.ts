import { createColumnHelper, tableFeatures, type ColumnDef, type RowData } from '@tanstack/react-table'

/** 可编辑表格只用核心行模型；列宽和对齐放在列的meta里。 */
export const editableFeatures = tableFeatures({
  columnMeta: {} as { align?: 'left' | 'right' | 'center'; width?: number | string },
})

export type EditableFeatures = typeof editableFeatures

export type EditableColumn<T extends RowData> = ColumnDef<EditableFeatures, T, any>

export function editableColumns<T extends RowData>() {
  return createColumnHelper<EditableFeatures, T>()
}
