import { DataList } from '@mantine/core'
import type { ReactNode } from 'react'
import { EMPTY } from '../domain/format'

export interface FieldItem {
  label: ReactNode
  value: ReactNode
  span?: number
  hidden?: boolean
}

/** 详情页的字段栅格：标签在上、值在下，宽屏4列，窄屏自动减列。 */
export function Fields({ items, cols = 4 }: { items: FieldItem[]; cols?: 2 | 3 | 4 }) {
  return (
    <DataList orientation="vertical" size="sm" className="qs-fields" data-cols={cols}>
      {items
        .filter((item) => !item.hidden)
        .map((item, index) => (
          <DataList.Item key={index} style={item.span ? { gridColumn: `span ${item.span}` } : undefined}>
            <DataList.ItemLabel>{item.label}</DataList.ItemLabel>
            <DataList.ItemValue>{item.value === undefined || item.value === null || item.value === '' ? EMPTY : item.value}</DataList.ItemValue>
          </DataList.Item>
        ))}
    </DataList>
  )
}
