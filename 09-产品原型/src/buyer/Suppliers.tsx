import { Alert, Badge, Button, Card, Grid, Group, Modal, Radio, Select, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { IconPlus, IconSearch, IconUserPlus } from '@tabler/icons-react'
import { DataTable } from 'mantine-datatable'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAction, useApi } from '../api/hooks'
import { ActionButton, LinkAction } from '../components/ActionButton'
import { AuditTable, ReadonlyLogBadge } from '../components/AuditTable'
import { numCell, skuColumn } from '../components/columns'
import { Fields } from '../components/Fields'
import { CodeName, DocNo, ErpReadonly, Note, PendingLabel, PendingTag, RichText } from '../components/marks'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { ResponsiveList } from '../components/ResponsiveList'
import { StatusBadge } from '../components/StatusBadge'
import { matchText, useUrlValue } from '../components/urlState'
import { EMPTY, fmtDate, fmtDateTime, fmtPrice, fmtRate } from '../domain/format'
import { statusOptions } from '../domain/labels'
import type { AuditLog, SupplierTier } from '../domain/types'
import type { ActionState, SupplierDetail, SupplierView } from '../domain/views'
import { CollabEditor } from '../shared/supplierParts'
import { useSession } from '../stores/session'

/** B25 供应商档案：编码和名称来自ERP；门户不发第二套供应商编码（《6》§二）。 */
export function SupplierList() {
  const navigate = useNavigate()
  const query = useApi<SupplierView[]>('/suppliers')
  const [q, setQ] = useUrlValue('q')
  const [category, setCategory] = useUrlValue('category')
  const [tier, setTier] = useUrlValue('tier')
  const [portal, setPortal] = useUrlValue('portal')
  return (
    <>
      <PageHeader
        title="供应商档案"
        subtitle="编码和名称以ERP为准，SRM不另编供应商编码；新供应商先走准入，ERP建档后回传编码（《6》§二）。"
        actions={
          <Button variant="light" leftSection={<IconUserPlus size={16} />} onClick={() => navigate('/buyer/admissions')}>
            供应商准入
          </Button>
        }
      />
      <QueryState query={query}>
        {(suppliers) => {
          const categories = [...new Set(suppliers.map((s) => s.category))]
          const rows = suppliers.filter(
            (s) =>
              matchText(q, s.code, s.name, s.shortName) &&
              (!category || s.category === category) &&
              (!tier || s.tier === tier) &&
              (!portal || s.portalStatus === portal),
          )
          return (
            <Stack gap="sm">
              <Group gap="sm" align="flex-end" wrap="wrap">
                <TextInput
                  label="搜索"
                  leftSection={<IconSearch size={14} />}
                  placeholder="编码、名称、简称"
                  value={q}
                  onChange={(event) => setQ(event.currentTarget.value)}
                  w={{ base: '100%', xs: 220 }}
                />
                <Select
                  label="类别"
                  placeholder="全部"
                  clearable
                  data={categories}
                  value={category || null}
                  onChange={(value) => setCategory(value ?? '')}
                  w={{ base: '100%', xs: 150 }}
                />
                <Select
                  label="分级"
                  placeholder="全部"
                  clearable
                  data={statusOptions('tier')}
                  value={tier || null}
                  onChange={(value) => setTier(value ?? '')}
                  w={{ base: '100%', xs: 160 }}
                />
                <Select
                  label="门户"
                  placeholder="全部"
                  clearable
                  data={statusOptions('portal')}
                  value={portal || null}
                  onChange={(value) => setPortal(value ?? '')}
                  w={{ base: '100%', xs: 180 }}
                />
              </Group>
              <ResponsiveList
                records={rows}
                rowKey={(s) => s.code}
                onOpen={(s) => navigate(`/buyer/suppliers/${s.code}`)}
                noRecordsText="没有符合条件的供应商"
                rowClassName={(s) => (s.tier === '暂停或待淘汰' ? 'qs-row-muted' : undefined)}
                columns={[
                  {
                    accessor: 'code',
                    title: '供应商',
                    render: (s) => (
                      <Stack gap={0}>
                        <CodeName code={s.code} name={s.name} />
                        <Text fz={11} c="dimmed">
                          {s.shortName}
                        </Text>
                      </Stack>
                    ),
                  },
                  { accessor: 'category', title: '类别' },
                  { accessor: 'tier', title: '分级', render: (s) => <StatusBadge kind="tier" value={s.tier} size="xs" /> },
                  { accessor: 'relatedParty', title: <PendingLabel label="关联方" n={13} /> },
                  { accessor: 'portalStatus', title: '门户', render: (s) => <StatusBadge kind="portal" value={s.portalStatus} size="xs" /> },
                  { accessor: 'assignedBuyerName', title: <PendingLabel label="分管采购" n={34} />, render: (s) => s.assignedBuyerName ?? EMPTY },
                  { accessor: 'openOrders', title: '执行中订单', textAlign: 'right', render: (s) => numCell(String(s.openOrders)) },
                  {
                    accessor: 'source',
                    title: '来源',
                    render: (s) => (
                      <Text fz="xs" c="dimmed">
                        {s.source}
                      </Text>
                    ),
                  },
                ]}
                card={(s) => (
                  <Stack gap={4}>
                    <Group justify="space-between" wrap="nowrap" align="flex-start">
                      <CodeName code={s.code} name={s.shortName} />
                      <StatusBadge kind="tier" value={s.tier} size="xs" />
                    </Group>
                    <Group gap={6}>
                      <Text fz="xs" c="dimmed">
                        {s.category}
                      </Text>
                      <StatusBadge kind="portal" value={s.portalStatus} size="xs" />
                    </Group>
                  </Stack>
                )}
              />
              <Note>参股核心不自动等于关联方，是否构成重大影响见「26」。暂停或待淘汰的供应商不接新订单，在途、退货和对账照常办完（《7》§二）。</Note>
            </Stack>
          )
        }}
      </QueryState>
    </>
  )
}

const tierHelp: Record<SupplierTier, string> = {
  参股核心: '背景点名的3家参股工厂。不自动等于关联方，是否构成重大影响见「26」',
  未分级: '默认档。合格名单和阈值给出之前，不生成「合格」',
  暂停或待淘汰: '不再接收新订单；在途、退货和对账仍要办完（《7》§二）。须填原因',
}

function TierModal({ supplier, onClose }: { supplier: SupplierDetail; onClose: () => void }) {
  const run = useAction()
  const [tier, setTier] = useState<SupplierTier>(supplier.tier)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (tier === supplier.tier) return setError('分级没有变化')
    if (tier === '暂停或待淘汰' && !reason.trim()) return setError('暂停或待淘汰须填原因')
    setBusy(true)
    const result = await run(`/suppliers/${supplier.code}/tier`, { tier, reason: reason.trim() }, { success: `已调整为${tier}` })
    setBusy(false)
    if (result !== undefined) onClose()
  }
  return (
    <Modal opened onClose={onClose} title={`调整分级 · ${supplier.shortName}`} size="lg">
      <Stack gap="sm">
        <Radio.Group
          value={tier}
          onChange={(value) => {
            setTier(value as SupplierTier)
            setError(undefined)
          }}
        >
          <Stack gap="xs">
            {(Object.keys(tierHelp) as SupplierTier[]).map((value) => (
              <Radio.Card key={value} value={value} p="sm" radius="md">
                <Group wrap="nowrap" align="flex-start">
                  <Radio.Indicator />
                  <div>
                    <Text fz="sm" fw={600}>
                      {value}
                      {value === supplier.tier ? '（当前）' : ''}
                    </Text>
                    <Text fz="xs" c="dimmed">
                      <RichText>{tierHelp[value]}</RichText>
                    </Text>
                  </div>
                </Group>
              </Radio.Card>
            ))}
            <Radio.Card value="合格" disabled p="sm" radius="md">
              <Group wrap="nowrap" align="flex-start">
                <Radio.Indicator disabled />
                <div>
                  <Text fz="sm" fw={600} c="dimmed">
                    合格（不可选）
                  </Text>
                  <Text fz="xs" c="dimmed">
                    没有名单，也没有金额或年限阈值；没有清单之前不在系统里生成「合格」（《7》§二、《8》§三） <PendingTag n={32} />
                  </Text>
                </div>
              </Group>
            </Radio.Card>
          </Stack>
        </Radio.Group>
        <Textarea
          label="原因"
          withAsterisk={tier === '暂停或待淘汰'}
          minRows={2}
          value={reason}
          error={error}
          onChange={(event) => {
            setReason(event.currentTarget.value)
            setError(undefined)
          }}
        />
        <Note>没有退出标准；工商状态变为吊销、注销后是否自动落入暂停档，见「32」。调整记日志，旧值和新值都留。</Note>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            取消
          </Button>
          <Button loading={busy} onClick={submit}>
            保存
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function OpenPortalModal({ supplier, onClose }: { supplier: SupplierDetail; onClose: () => void }) {
  const run = useAction()
  const [loginName, setLoginName] = useState('')
  const [displayName, setDisplayName] = useState(supplier.contacts.find((c) => c.isPrimary)?.name ?? '')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    const name = loginName.trim()
    if (!/^[a-z][a-z0-9._-]{3,31}$/i.test(name)) return setError('4至32位字母、数字、点、横线，字母开头')
    if (/^sup\d+$/i.test(name) || name.toUpperCase() === supplier.code) return setError('登录名不能直接用供应商编码（《6》§二）')
    setBusy(true)
    const result = await run(`/suppliers/${supplier.code}/portal`, { loginName: name, displayName: displayName.trim() }, { success: '已开通门户主账号' })
    setBusy(false)
    if (result !== undefined) onClose()
  }
  return (
    <Modal opened onClose={onClose} title={`开通门户 · ${supplier.shortName}`} size="md">
      <Stack gap="sm">
        <Alert color="cyan" variant="light" p="sm">
          <Text fz="sm">开通后这家供应商自己在门户操作，采购不再代录；已有的代录记录保留。</Text>
        </Alert>
        <TextInput
          label="登录名"
          withAsterisk
          placeholder="例如：demo.dianzi"
          classNames={{ input: 'qs-mono' }}
          value={loginName}
          error={error}
          onChange={(event) => {
            setLoginName(event.currentTarget.value)
            setError(undefined)
          }}
          data-autofocus
        />
        <TextInput label="账号显示名" withAsterisk value={displayName} onChange={(event) => setDisplayName(event.currentTarget.value)} />
        <Note>不要把供应商编码直接当成登录名，以免一家工厂只能有一个账号（《6》§二）。登录名怎么编、子账号能否由供应商自建见「34」。原型不做真实登录。</Note>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            取消
          </Button>
          <Button loading={busy} onClick={submit} disabled={!displayName.trim()}>
            开通
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function SupplierDetailContent({ supplier }: { supplier: SupplierDetail }) {
  const role = useSession((s) => s.identity?.role)
  const logs = useApi<AuditLog[]>(`/suppliers/${supplier.code}/logs`)
  const [dialog, setDialog] = useState<'tier' | 'portal' | null>(null)
  const orderState: ActionState =
    role !== 'buyer'
      ? { ok: false, hidden: true }
      : supplier.tier === '暂停或待淘汰'
        ? { ok: false, reason: '暂停或待淘汰的供应商不接新订单（《7》§二）' }
        : { ok: true }
  return (
    <>
      <PageHeader
        back={{ to: '/buyer/suppliers', label: '供应商档案' }}
        title={supplier.name}
        badges={
          <Group gap={6}>
            <StatusBadge kind="tier" value={supplier.tier} />
            <StatusBadge kind="portal" value={supplier.portalStatus} />
          </Group>
        }
        subtitle={<CodeName code={supplier.code} name={supplier.shortName} />}
        actions={
          <>
            <LinkAction state={orderState} to={`/buyer/orders/new?supplier=${supplier.code}`} leftSection={<IconPlus size={16} />}>
              为它下单
            </LinkAction>
            <ActionButton state={supplier.actions.tier} variant="default" onClick={() => setDialog('tier')}>
              调整分级
            </ActionButton>
            <ActionButton state={supplier.actions.openPortal} variant="light" color="cyan" onClick={() => setDialog('portal')}>
              开通门户
            </ActionButton>
          </>
        }
      />
      <Stack gap="md">
        <Grid gap="md">
          <Grid.Col span={{ base: 12, lg: 7 }}>
            <ErpReadonly title="基本信息（来自ERP，只读）">
              <Fields
                cols={3}
                items={[
                  { label: '供应商编码', value: <span className="qs-mono">{supplier.code}</span> },
                  { label: '名称', value: supplier.name },
                  { label: '简称', value: supplier.shortName },
                  { label: '类别', value: supplier.category },
                  { label: '币别', value: supplier.currency },
                  { label: '来源', value: supplier.source },
                  { label: <PendingLabel label="关联方" n={13} />, value: supplier.relatedParty },
                  { label: <PendingLabel label="账期" n={28} />, value: EMPTY },
                  { label: '建档', value: fmtDateTime(supplier.createdAt) },
                ]}
              />
            </ErpReadonly>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 5 }}>
            <Card h="100%">
              <SectionTitle>分级与门户</SectionTitle>
              <Fields
                cols={2}
                items={[
                  { label: '分级', value: <StatusBadge kind="tier" value={supplier.tier} size="xs" /> },
                  { label: '分级原因', value: supplier.tierReason },
                  { label: '最近调整', value: supplier.tierChangedAt ? `${supplier.tierChangedBy} · ${fmtDateTime(supplier.tierChangedAt)}` : undefined, span: 2 },
                  { label: '门户', value: <StatusBadge kind="portal" value={supplier.portalStatus} size="xs" /> },
                  { label: <PendingLabel label="分管采购" n={34} />, value: supplier.assignedBuyerName },
                  { label: '执行中订单', value: String(supplier.openOrders) },
                ]}
              />
              {supplier.tier === '暂停或待淘汰' && (
                <Alert color="red" variant="light" p="xs" mt="sm">
                  <Text fz="xs">不再接收新订单；在途、退货和对账仍要办完（《7》§二）。</Text>
                </Alert>
              )}
              {supplier.tier === '参股核心' && (
                <Stack mt="sm">
                  <Note>参股核心不自动等于关联方，是否构成重大影响见「26」。</Note>
                </Stack>
              )}
            </Card>
          </Grid.Col>
        </Grid>

        <CollabEditor supplier={supplier} />

        <Grid gap="md">
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <Card h="100%">
              <SectionTitle>门户账号</SectionTitle>
              <DataTable
                records={supplier.portalUsers}
                idAccessor="id"
                withTableBorder
                borderRadius="md"
                minHeight={supplier.portalUsers.length ? undefined : 100}
                noRecordsText="门户未开通，由采购代录"
                columns={[
                  {
                    accessor: 'loginName',
                    title: '登录名',
                    render: (u) => (
                      <Text fz="sm" className="qs-mono">
                        {u.loginName}
                      </Text>
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
              />
              <Stack mt="xs">
                <Note>登录名不用供应商编码（《6》§二）；登录名怎么编、子账号能否自建见「34」。</Note>
              </Stack>
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <Card h="100%">
              <SectionTitle>最近订单</SectionTitle>
              {supplier.recentOrders.length ? (
                <Stack gap={6}>
                  {supplier.recentOrders.map((o) => (
                    <Group key={o.id} justify="space-between" wrap="nowrap" gap="xs">
                      <DocNo no={o.no} to={`/buyer/orders/${o.id}`} />
                      <Group gap={4} wrap="nowrap">
                        <Text fz="xs" c="dimmed" className="qs-num" visibleFrom="sm">
                          交期 {o.promisedDate}
                        </Text>
                        <StatusBadge kind="confirm" value={o.confirmStatus} size="xs" />
                        <StatusBadge kind="biz" value={o.bizStatus} size="xs" />
                      </Group>
                    </Group>
                  ))}
                </Stack>
              ) : (
                <Text fz="sm" c="dimmed">
                  还没有订单
                </Text>
              )}
            </Card>
          </Grid.Col>
        </Grid>

        <Card>
          <SectionTitle>ERP价格快照</SectionTitle>
          <DataTable
            records={supplier.prices}
            idAccessor="skuCode"
            withTableBorder
            borderRadius="md"
            minHeight={supplier.prices.length ? undefined : 100}
            noRecordsText="ERP里没有这家供应商的有效采购价"
            columns={[
              skuColumn(),
              { accessor: 'unit', title: '单位' },
              { accessor: 'price', title: '含税单价', textAlign: 'right', render: (p) => numCell(fmtPrice(p.price)) },
              { accessor: 'taxRate', title: '税率', textAlign: 'right', render: (p) => numCell(fmtRate(p.taxRate)) },
              {
                accessor: 'source',
                title: '来源',
                render: (p) => (
                  <Text fz="xs" c="dimmed">
                    {p.source}
                  </Text>
                ),
              },
              {
                accessor: 'effectiveFrom',
                title: '生效日期',
                render: (p) => (
                  <Text fz="sm" className="qs-num">
                    {p.effectiveFrom}
                  </Text>
                ),
              },
            ]}
          />
          <Stack mt="xs">
            <Note>新建订单时单价、税率取这里的ERP价格，只读，门户不重算采购价格（《6》§二）。取不到有效价的SKU能否在SRM录入单价见「43」。</Note>
          </Stack>
        </Card>

        <Card>
          <SectionTitle extra={<ReadonlyLogBadge />}>操作日志</SectionTitle>
          <QueryState query={logs}>{(rows) => <AuditTable logs={rows} withObject={false} />}</QueryState>
        </Card>
      </Stack>

      {dialog === 'tier' && <TierModal supplier={supplier} onClose={() => setDialog(null)} />}
      {dialog === 'portal' && <OpenPortalModal supplier={supplier} onClose={() => setDialog(null)} />}
    </>
  )
}

/** B26 供应商详情：基本信息只读；联系人和地址可维护；分级（暂停须填原因）；门户账号；日志。 */
export function SupplierDetailPage() {
  const { code = '' } = useParams()
  const query = useApi<SupplierDetail>(`/suppliers/${code}`)
  return <QueryState query={query}>{(supplier) => <SupplierDetailContent key={supplier.code} supplier={supplier} />}</QueryState>
}
