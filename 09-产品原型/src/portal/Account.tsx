import { Badge, Card, Group, Stack, Text } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { useApi } from '../api/hooks'
import { ActionButton } from '../components/ActionButton'
import { Fields } from '../components/Fields'
import { CodeName, ErpReadonly, Note } from '../components/marks'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { ResponsiveList } from '../components/ResponsiveList'
import { StatusBadge } from '../components/StatusBadge'
import { fmtDate } from '../domain/format'
import type { SupplierDetail } from '../domain/views'
import { CollabEditor } from '../shared/supplierParts'
import { useSession } from '../stores/session'

/** P14 门户账户：公司信息只读，联系人和送货地址可维护；子账号按「34」占位（《3》§3.6）。 */
export function Account() {
  const identity = useSession((s) => s.identity)!
  const query = useApi<SupplierDetail>(identity.supplierCode ? `/suppliers/${identity.supplierCode}` : null)
  return (
    <QueryState query={query}>
      {(supplier) => {
        const me = supplier.portalUsers.find((u) => u.id === identity.userId)
        const addSub: { ok: false; reason: string; hidden?: boolean } = me?.isPrimary
          ? { ok: false, reason: '主账号能否自建子账号未定（待确认-34）' }
          : { ok: false, hidden: true, reason: '主账号才能看到新增子账号' }
        return (
          <>
            <PageHeader title="账户" subtitle="账期、结算方式和采购价格以ERP和财务为准，门户里不维护（《3》§3.6）。" />
            <Stack gap="md">
              <ErpReadonly title="公司信息（来自ERP，只读）">
                <Fields
                  cols={3}
                  items={[
                    { label: '供应商编码', value: <span className="qs-mono">{supplier.code}</span> },
                    { label: '名称', value: supplier.name },
                    { label: '简称', value: supplier.shortName },
                    { label: '币别', value: supplier.currency },
                    { label: '门户', value: <StatusBadge kind="portal" value={supplier.portalStatus} size="xs" /> },
                  ]}
                />
              </ErpReadonly>

              <Card>
                <SectionTitle>当前登录</SectionTitle>
                {me ? (
                  <Fields
                    cols={3}
                    items={[
                      { label: '显示名', value: me.displayName },
                      { label: '登录名', value: <span className="qs-mono">{me.loginName}</span> },
                      { label: '类型', value: me.isPrimary ? '主账号' : '子账号' },
                      { label: '开通', value: `${me.createdBy} · ${fmtDate(me.createdAt)}` },
                    ]}
                  />
                ) : (
                  <Text fz="sm" c="dimmed">
                    当前身份不在门户账号列表里。这是原型的演示身份，不是真实登录。
                  </Text>
                )}
                <Note>原型不做真实登录、密码和短信。</Note>
              </Card>

              <CollabEditor supplier={supplier} />

              <Card>
                <SectionTitle
                  extra={
                    <ActionButton state={addSub} size="xs" variant="light" leftSection={<IconPlus size={14} />}>
                      新增子账号
                    </ActionButton>
                  }
                >
                  本公司门户账号
                </SectionTitle>
                <ResponsiveList
                  records={supplier.portalUsers}
                  rowKey={(u) => u.id}
                  noRecordsText="还没有门户账号"
                  columns={[
                    {
                      accessor: 'loginName',
                      title: '登录名',
                      render: (u) => (
                        <Group gap={6} wrap="nowrap">
                          <Text fz="sm" className="qs-mono">
                            {u.loginName}
                          </Text>
                          {u.id === identity.userId && (
                            <Badge size="xs" variant="light" color="jade">
                              当前登录
                            </Badge>
                          )}
                        </Group>
                      ),
                    },
                    { accessor: 'displayName', title: '显示名' },
                    { accessor: 'isPrimary', title: '类型', render: (u) => (u.isPrimary ? '主账号' : '子账号') },
                    {
                      accessor: 'status',
                      title: '状态',
                      render: (u) => (
                        <Badge size="xs" variant="light" color={u.status === '启用' ? 'green' : 'dark'}>
                          {u.status}
                        </Badge>
                      ),
                    },
                    {
                      accessor: 'createdAt',
                      title: '开通',
                      render: (u) => (
                        <Text fz="xs" c="dimmed">
                          {u.createdBy} · <span className="qs-num">{fmtDate(u.createdAt)}</span>
                        </Text>
                      ),
                    },
                  ]}
                  card={(u) => (
                    <Stack gap={4}>
                      <Group justify="space-between" wrap="nowrap">
                        <CodeName code={u.loginName} name={u.displayName} />
                        {u.id === identity.userId && (
                          <Badge size="xs" variant="light" color="jade">
                            当前登录
                          </Badge>
                        )}
                      </Group>
                      <Text fz="xs" c="dimmed">
                        {u.isPrimary ? '主账号' : '子账号'} · {u.status} · {fmtDate(u.createdAt)} 开通
                      </Text>
                    </Stack>
                  )}
                />
                <Stack mt="xs">
                  <Note>登录名不用供应商编码（《6》§二）。主账号能否自建子账号、登录名怎么编见「34」；无论谁建，数据范围都是本公司（《4》）。</Note>
                </Stack>
              </Card>
            </Stack>
          </>
        )
      }}
    </QueryState>
  )
}
