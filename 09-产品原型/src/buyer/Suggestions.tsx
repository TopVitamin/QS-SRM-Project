import { Group, SegmentedControl } from '@mantine/core'
import { useApi } from '../api/hooks'
import { Note } from '../components/marks'
import { PageHeader } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { useUrlValue } from '../components/urlState'
import type { SuggestionView } from '../domain/views'
import { SuggestionActions, SuggestionTable } from '../shared/orderParts'

/** B10 交期建议：接受生成变更并推送，驳回填原因；同一订单可以有多条（《5》§三）。 */
export function Suggestions() {
  const query = useApi<SuggestionView[]>('/suggestions')
  const [view, setView] = useUrlValue('view', 'pending')
  return (
    <>
      <PageHeader title="交期建议" subtitle="供应商在门户提交（未开通门户的由采购代录）。建议不是变更：接受后才生成订单变更，推送ERP成功才是新交期。" />
      <Group mb="md">
        <SegmentedControl
          value={view}
          onChange={setView}
          data={[
            { value: 'pending', label: '待处理' },
            { value: 'all', label: '全部' },
          ]}
        />
      </Group>
      <QueryState query={query}>
        {(rows) => (
          <SuggestionTable
            rows={view === 'pending' ? rows.filter((r) => r.status === 'pending') : rows}
            showOrder
            orderBase="/buyer/orders"
            actions={(row) => <SuggestionActions row={row} />}
          />
        )}
      </QueryState>
      <Note>一张订单同时只允许一笔未完成的变更：订单上已有变更在途时，接受按钮置灰，先处理那一笔。</Note>
    </>
  )
}
