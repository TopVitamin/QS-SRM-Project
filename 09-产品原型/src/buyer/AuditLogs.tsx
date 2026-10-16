import { Group, SegmentedControl, Select, Stack, Switch, Text, TextInput } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { useApi } from '../api/hooks'
import { AuditTable, ReadonlyLogBadge } from '../components/AuditTable'
import { Note } from '../components/marks'
import { PageHeader } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { matchText, useUrlValue } from '../components/urlState'
import type { AuditLog } from '../domain/types'
import type { SupplierView } from '../domain/views'

const objectRoutes: Record<string, (log: AuditLog) => string | undefined> = {
  采购订单: (l) => `/buyer/orders/${l.objectId}`,
  订单变更: (l) => `/buyer/changes/${l.objectId}`,
  交期建议: () => '/buyer/suggestions',
  齐套记录: () => '/buyer/alerts?tab=kitting',
  发货单: (l) => `/buyer/shipments/${l.objectId}`,
  箱码: (l) => `/buyer/trace?box=${l.objectId}`,
  采购收货通知单: () => '/buyer/receipts',
  采购入库单: () => '/buyer/receipts',
  采购退货: () => '/buyer/receipts?tab=returns',
  预约送货: () => '/buyer/appointments',
  对账单: (l) => `/buyer/reconciliations/${l.objectId}`,
  开票申请: (l) => `/buyer/invoice-requests/${l.objectId}`,
  税票: () => '/buyer/invoices',
  红字确认单: () => '/buyer/red-letters',
  供应商协同资料: (l) => `/buyer/suppliers/${l.objectId}`,
  供应商分级: (l) => `/buyer/suppliers/${l.objectId}`,
  门户账号: (l) => (l.supplierCode ? `/buyer/suppliers/${l.supplierCode}` : undefined),
  供应商准入: (l) => `/buyer/admissions/${l.objectId}`,
}

const objectLink = (log: AuditLog) => (log.objectType.startsWith('推送记录') ? '/buyer/erp-sync' : objectRoutes[log.objectType]?.(log))

const partyOptions = [
  { value: 'all', label: '全部' },
  { value: 'enterprise', label: '企业侧' },
  { value: 'supplier', label: '供应商' },
  { value: 'system', label: '系统' },
]

/** B30 操作日志：只追加、只读，没有删除和修改入口；可以只看代录（《4》§五、《9》§2.4）。 */
export function AuditLogs() {
  const query = useApi<AuditLog[]>('/audit-logs')
  const suppliers = useApi<SupplierView[]>('/suppliers')
  const [q, setQ] = useUrlValue('q')
  const [type, setType] = useUrlValue('type')
  const [supplier, setSupplier] = useUrlValue('supplier')
  const [party, setParty] = useUrlValue('party')
  const [proxy, setProxy] = useUrlValue('proxy')
  return (
    <>
      <PageHeader
        title="操作日志"
        badges={<ReadonlyLogBadge />}
        subtitle="创建、审核、推送、失败、重试、确认、撤回、变更、发货、代录、对账和发票登记，都记操作者、时间、对象和前后值（《4》§五）。日志只追加，没有删除和修改入口。"
      />
      <QueryState query={query}>
        {(logs) => {
          const types = [...new Set(logs.map((l) => (l.objectType.startsWith('推送记录') ? '推送记录' : l.objectType)))]
          const rows = logs.filter(
            (l) =>
              (!type || (type === '推送记录' ? l.objectType.startsWith('推送记录') : l.objectType === type)) &&
              (!supplier || l.supplierCode === supplier) &&
              (!party || l.party === party) &&
              (!proxy || !!l.proxy) &&
              matchText(q, l.objectNo, l.actorName, l.action, l.note),
          )
          const proxyCount = logs.filter((l) => l.proxy).length
          return (
            <Stack gap="sm">
              <Group gap="sm" align="flex-end" wrap="wrap">
                <TextInput
                  label="搜索"
                  leftSection={<IconSearch size={14} />}
                  placeholder="单号、操作者、动作、备注"
                  value={q}
                  onChange={(event) => setQ(event.currentTarget.value)}
                  w={{ base: '100%', xs: 240 }}
                />
                <Select label="对象" placeholder="全部" clearable searchable data={types} value={type || null} onChange={(value) => setType(value ?? '')} w={{ base: '100%', xs: 170 }} />
                <Select
                  label="供应商"
                  placeholder="全部"
                  clearable
                  searchable
                  data={(suppliers.data ?? []).map((s) => ({ value: s.code, label: `${s.code} ${s.shortName}` }))}
                  value={supplier || null}
                  onChange={(value) => setSupplier(value ?? '')}
                  w={{ base: '100%', xs: 200 }}
                />
                <Stack gap={4}>
                  <Text fz="sm" fw={500}>
                    操作方
                  </Text>
                  <SegmentedControl data={partyOptions} value={party || 'all'} onChange={(value) => setParty(value === 'all' ? '' : value)} />
                </Stack>
                <Switch label={`只看代录（${proxyCount}）`} checked={!!proxy} onChange={(event) => setProxy(event.currentTarget.checked ? '1' : '')} mb={8} />
              </Group>
              <AuditTable key={[q, type, supplier, party, proxy].join('|')} logs={rows} objectLink={objectLink} pageSize={30} minHeight={200} />
              <Note>代录的记录带「代录」标记，悬停看代录人、时间和依据（《9》§2.4）。ERP、WMS和税务平台的回传记为系统操作，名称带「（模拟）」。</Note>
            </Stack>
          )
        }}
      </QueryState>
    </>
  )
}
