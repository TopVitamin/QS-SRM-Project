import { Badge, Group, MultiSelect, Stack, Text } from '@mantine/core'
import { DataTable } from 'mantine-datatable'
import { useAction, useApi } from '../api/hooks'
import { ActionButton } from '../components/ActionButton'
import { DocNo, Note, SimBox } from '../components/marks'
import { PageHeader } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { useUrlList } from '../components/urlState'
import { fmtDateTime } from '../domain/format'
import type { PushJobView } from '../domain/views'
import { PushAttempts, PushJobSummary } from '../shared/pushParts'
import { useConfig } from '../stores/config'

const statusData = [
  { value: 'pushing', label: '推送中' },
  { value: 'failed', label: '推送失败' },
  { value: 'accepted', label: 'ERP已接收' },
]

function objectLink(job: PushJobView) {
  if (job.kind === '变更') return `/buyer/changes/${job.objectId}`
  if (job.kind === '发货单') return `/buyer/shipments/${job.objectId}`
  return `/buyer/orders/${job.orderId}`
}

/** B11 ERP推送监控：订单、变更、关闭同步、发货单；重推同一笔，核对七项（A02、「06」）。 */
export function ErpSync() {
  const run = useAction()
  const query = useApi<PushJobView[]>('/push-jobs')
  const [status, setStatus] = useUrlList('status')
  const [kind, setKind] = useUrlList('kind')
  const erpAvailable = useConfig((s) => s.config.erpAvailable)
  const setConfig = useConfig((s) => s.setConfig)
  return (
    <>
      <PageHeader title="ERP推送监控" subtitle="一张SRM订单对一张ERP订单。失败后重推沿用同一笔，推送记录按次追加，不复制成新单（《4》§一、《6》§四）。" />
      <Stack gap="md">
        <SimBox title="模拟ERP接口（演示工具）" note="推送发出约1秒后由模拟ERP回传结果。要演示失败和重推，把模拟ERP接口设为不可用。">
          <ActionButton size="xs" variant={erpAvailable ? 'default' : 'filled'} color={erpAvailable ? 'gray' : 'red'} onClick={() => setConfig({ erpAvailable: !erpAvailable })}>
            {erpAvailable ? '把模拟ERP设为不可用' : '恢复模拟ERP可用'}
          </ActionButton>
          <Badge color={erpAvailable ? 'green' : 'red'} variant="light">
            当前：{erpAvailable ? '正常' : '不可用，推送都会失败'}
          </Badge>
        </SimBox>
        <Group gap="sm">
          <MultiSelect label="状态" placeholder="全部" data={statusData} value={status} onChange={setStatus} clearable w={260} />
          <MultiSelect label="对象" placeholder="全部" data={['订单', '变更', '关闭同步', '发货单']} value={kind} onChange={setKind} clearable w={260} />
        </Group>
        <QueryState query={query}>
          {(jobs) => {
            const rows = jobs.filter((j) => (!status.length || status.includes(j.status)) && (!kind.length || kind.includes(j.kind)))
            return (
              <DataTable
                records={rows}
                idAccessor="id"
                withTableBorder
                borderRadius="lg"
                minHeight={rows.length ? undefined : 200}
                noRecordsText="没有推送记录"
                rowClassName={(j) => (j.status === 'failed' ? 'qs-row-warn' : '')}
                rowExpansion={{ content: ({ record }) => <div style={{ padding: 12 }}><PushAttempts job={record} /></div> }}
                columns={[
                  { accessor: 'kind', title: '对象', render: (j) => <Badge variant="default">{j.kind}</Badge> },
                  { accessor: 'objectNo', title: '单号', render: (j) => <DocNo no={j.objectNo} to={objectLink(j)} /> },
                  { accessor: 'orderNo', title: 'SRM采购订单', render: (j) => <DocNo no={j.orderNo} to={`/buyer/orders/${j.orderId}`} /> },
                  { accessor: 'supplierName', title: '供应商' },
                  { accessor: 'status', title: '状态', render: (j) => <PushJobSummary job={j} /> },
                  { accessor: 'message', title: '最近一次ERP返回', render: (j) => <Text fz="xs">{j.attempts.at(-1)?.message || '-'}</Text> },
                  { accessor: 'updatedAt', title: '更新', render: (j) => <Text fz="xs" className="qs-num">{fmtDateTime(j.updatedAt)}</Text> },
                  {
                    accessor: 'actions',
                    title: '',
                    textAlign: 'right',
                    render: (j) => (
                      <Group gap={6} wrap="nowrap" justify="flex-end">
                        <ActionButton state={j.actions.retry} size="compact-sm" color="red" onClick={() => run(`/push-jobs/${j.id}/retry`, {}, { success: '已重推同一笔' })}>
                          重推
                        </ActionButton>
                        <ActionButton state={j.actions.check} size="compact-sm" variant="default" onClick={() => run(`/orders/${j.orderId}/check`, {}, { success: '核对完成，结果在订单详情' })}>
                          核对
                        </ActionButton>
                      </Group>
                    ),
                  },
                ]}
              />
            )
          }}
        </QueryState>
        <Note>点一行展开每次推送的明细。ERP采购订单号另编还是沿用SRM单号见「05」；重试次数、间隔和能否手工重推见「06」，原型不模拟自动重试。</Note>
      </Stack>
    </>
  )
}
