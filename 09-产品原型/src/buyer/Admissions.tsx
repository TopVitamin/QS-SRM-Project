import {
  ActionIcon,
  Alert,
  Anchor,
  Autocomplete,
  Badge,
  Button,
  Card,
  FileButton,
  Grid,
  Group,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Stepper,
  Text,
  TextInput,
  Textarea,
  Timeline,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { randomId, useMediaQuery } from '@mantine/hooks'
import { IconPaperclip, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react'
import { DataTable } from 'mantine-datatable'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAction, useApi } from '../api/hooks'
import { ActionButton } from '../components/ActionButton'
import { AuditTable, ReadonlyLogBadge } from '../components/AuditTable'
import { Fields } from '../components/Fields'
import { Note, PendingLabel, SimBox } from '../components/marks'
import { ReasonModal } from '../components/modals'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { Forbidden, QueryState } from '../components/QueryState'
import { ResponsiveList } from '../components/ResponsiveList'
import { StatusBadge } from '../components/StatusBadge'
import { matchText, useUrlValue } from '../components/urlState'
import { EMPTY, fmtDateTime, todayStr } from '../domain/format'
import { statusOptions, supplierCategories } from '../domain/labels'
import { can } from '../domain/permissions'
import type { Admission, AdmissionStatus, AuditLog, SupplierCategory } from '../domain/types'
import type { AdmissionView } from '../domain/views'
import { useSession } from '../stores/session'

type ReviewResult = Admission['reviews'][number]['result']

const reviewColors: Record<ReviewResult, string> = { 通过: 'green', 退回补充: 'orange', 终止: 'dark' }

const qualificationTypes = ['营业执照', '质量体系证书']

const admissionNo = (a: Pick<Admission, 'seq'>) => `准入申请#${a.seq}`

/** B27 供应商准入：门户不发供应商编码，ERP建档后回传（《6》§二）。 */
export function AdmissionList() {
  const navigate = useNavigate()
  const role = useSession((s) => s.identity?.role)
  const query = useApi<AdmissionView[]>('/admissions')
  const [status, setStatus] = useUrlValue('status')
  const [q, setQ] = useUrlValue('q')
  return (
    <>
      <PageHeader
        title="供应商准入"
        subtitle="采购员登记资料，采购员或品质出具审查意见；有「通过」意见后提交ERP建档，ERP回传SUP编码才成为供应商（《6》§二）。"
        actions={
          can(role, 'admission.write') && (
            <Button component={Link} to="/buyer/admissions/new" leftSection={<IconPlus size={16} />}>
              登记准入资料
            </Button>
          )
        }
      />
      <QueryState query={query}>
        {(admissions) => {
          const count = (value: string) => admissions.filter((a) => a.status === value).length
          const rows = admissions.filter((a) => (!status || a.status === status) && matchText(q, a.name, a.creditCode, a.erpCode, admissionNo(a)))
          return (
            <Stack gap="sm">
              <Group gap="sm" align="flex-end" wrap="wrap">
                <TextInput
                  label="搜索"
                  leftSection={<IconSearch size={14} />}
                  placeholder="企业名称、信用代码、ERP编码"
                  value={q}
                  onChange={(event) => setQ(event.currentTarget.value)}
                  w={{ base: '100%', xs: 260 }}
                />
                <Select
                  label="状态"
                  placeholder={`全部（${admissions.length}）`}
                  clearable
                  data={statusOptions('admission').map((o) => ({ value: o.value, label: `${o.label}（${count(o.value)}）` }))}
                  value={status || null}
                  onChange={(value) => setStatus(value ?? '')}
                  w={{ base: '100%', xs: 200 }}
                />
              </Group>
              <ResponsiveList
                records={rows}
                rowKey={(a) => a.id}
                onOpen={(a) => navigate(`/buyer/admissions/${a.id}`)}
                noRecordsText="没有符合条件的准入申请"
                rowClassName={(a) => (a.status === 'terminated' ? 'qs-row-muted' : undefined)}
                columns={[
                  {
                    accessor: 'seq',
                    title: '申请',
                    render: (a) => (
                      <Text fz="sm" className="qs-num">
                        #{a.seq}
                      </Text>
                    ),
                  },
                  {
                    accessor: 'name',
                    title: '企业名称',
                    render: (a) => (
                      <Stack gap={0}>
                        <Text fz="sm">{a.name}</Text>
                        <Text fz={11} c="dimmed">
                          {a.category}
                        </Text>
                      </Stack>
                    ),
                  },
                  {
                    accessor: 'creditCode',
                    title: '统一社会信用代码',
                    render: (a) => (
                      <Text fz="sm" className="qs-mono">
                        {a.creditCode}
                      </Text>
                    ),
                  },
                  { accessor: 'status', title: '状态', render: (a) => <StatusBadge kind="admission" value={a.status} size="xs" /> },
                  {
                    accessor: 'reviews',
                    title: '最近审查',
                    render: (a) => {
                      const last = a.reviews.at(-1)
                      if (!last) return EMPTY
                      return (
                        <Group gap={6} wrap="nowrap">
                          <Badge size="xs" variant="light" color={reviewColors[last.result]}>
                            {last.result}
                          </Badge>
                          <Text fz="xs" c="dimmed">
                            {last.by}
                          </Text>
                        </Group>
                      )
                    },
                  },
                  { accessor: 'applicant', title: '申请人' },
                  {
                    accessor: 'erpCode',
                    title: 'ERP编码',
                    render: (a) =>
                      a.erpCode ? (
                        <Anchor component={Link} to={`/buyer/suppliers/${a.erpCode}`} fz="sm" className="qs-mono" onClick={(event) => event.stopPropagation()}>
                          {a.erpCode}
                        </Anchor>
                      ) : (
                        EMPTY
                      ),
                  },
                  {
                    accessor: 'updatedAt',
                    title: '更新',
                    render: (a) => (
                      <Text fz="xs" c="dimmed" className="qs-num">
                        {fmtDateTime(a.updatedAt)}
                      </Text>
                    ),
                  },
                ]}
                card={(a) => (
                  <Stack gap={4}>
                    <Group justify="space-between" wrap="nowrap" align="flex-start">
                      <Text fz="sm" fw={600}>
                        {a.name}
                      </Text>
                      <StatusBadge kind="admission" value={a.status} size="xs" />
                    </Group>
                    <Text fz="xs" c="dimmed">
                      #{a.seq} · {a.category} · {a.applicant}
                      {a.erpCode ? ` · ${a.erpCode}` : ''}
                    </Text>
                  </Stack>
                )}
              />
              <Note>是否做样品准入，寻源、询报价、价格协议是否放进SRM，见「35」。</Note>
            </Stack>
          )
        }}
      </QueryState>
    </>
  )
}

interface QualificationDraft {
  key: string
  id?: string
  type: string
  fileName: string
  validTo: string | null
}

interface AdmissionValues {
  name: string
  category: SupplierCategory | null
  creditCode: string
  contactName: string
  contactPhone: string
  address: string
  supplyScope: string
  relatedDeclaration: string
  qualifications: QualificationDraft[]
}

const blankQualification = (type = ''): QualificationDraft => ({ key: randomId(), type, fileName: '', validTo: null })

function toValues(admission?: Admission): AdmissionValues {
  return {
    name: admission?.name ?? '',
    category: admission?.category ?? null,
    creditCode: admission?.creditCode ?? '',
    contactName: admission?.contactName ?? '',
    contactPhone: admission?.contactPhone ?? '',
    address: admission?.address ?? '',
    supplyScope: admission?.supplyScope ?? '',
    relatedDeclaration: admission?.relatedDeclaration ?? '',
    qualifications: admission
      ? admission.qualifications.map((q) => ({ key: q.id, id: q.id, type: q.type, fileName: q.fileName, validTo: q.validTo ?? null }))
      : [blankQualification('营业执照')],
  }
}

function AdmissionForm({ admission }: { admission?: AdmissionView }) {
  const navigate = useNavigate()
  const run = useAction()
  const form = useForm<AdmissionValues>({
    initialValues: toValues(admission),
    validate: {
      name: (value) => (value.trim() ? null : '请填写企业名称'),
      category: (value) => (value ? null : '请选择类别'),
      creditCode: (value) => (/^[0-9A-Z]{18}$/.test(value.trim().toUpperCase()) ? null : '18位数字或大写字母'),
      contactName: (value) => (value.trim() ? null : '请填写联系人'),
      contactPhone: (value) => (/^[0-9-]{7,20}$/.test(value.trim()) ? null : '请填写联系电话'),
      qualifications: {
        type: (value) => (value.trim() ? null : '请填写资质类型'),
        fileName: (value) => (value.trim() ? null : '请选择附件'),
      },
    },
  })
  const { qualifications } = form.getValues()

  const save = async (submit: boolean) => {
    if (form.validate().hasErrors) return
    const values = form.getValues()
    const body = {
      ...values,
      creditCode: values.creditCode.trim().toUpperCase(),
      qualifications: values.qualifications.map(({ key: _key, validTo, ...q }) => ({ ...q, validTo: validTo ?? undefined })),
      submit,
    }
    const result = await run<Admission>(admission ? `/admissions/${admission.id}` : '/admissions', body, {
      method: admission ? 'PUT' : 'POST',
      success: submit ? '已提交资料审查' : '草稿已保存',
    })
    if (result && !admission) navigate(`/buyer/admissions/${result.id}`, { replace: true })
  }

  return (
    <Stack gap="md">
      <Card>
        <SectionTitle>企业资料</SectionTitle>
        <Grid gap="md">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <TextInput label="企业名称" withAsterisk placeholder="营业执照上的全称" {...form.getInputProps('name')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Select label="类别" withAsterisk data={supplierCategories} {...form.getInputProps('category')} description={<Note icon={false}>各类有多少家见「25」</Note>} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <TextInput
              label="统一社会信用代码"
              withAsterisk
              maxLength={18}
              classNames={{ input: 'qs-mono' }}
              {...form.getInputProps('creditCode')}
              description={<Note icon={false}>只校验18位格式，工商核验未接入「32」</Note>}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <TextInput label="联系人" withAsterisk {...form.getInputProps('contactName')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <TextInput label="联系电话" withAsterisk inputMode="tel" {...form.getInputProps('contactPhone')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <TextInput label="地址" {...form.getInputProps('address')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Textarea
              label="供货范围"
              minRows={2}
              placeholder="例如：数据线、充电头"
              {...form.getInputProps('supplyScope')}
              description={<Note icon={false}>只供准入和打印参考，不限制SRM下单「40」</Note>}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Textarea
              label="关联关系声明"
              minRows={2}
              placeholder="申请方自述与强盛的股权、任职关系"
              {...form.getInputProps('relatedDeclaration')}
              description={<Note icon={false}>只是申请方声明，不等于关联方认定（《8》§一）。标记由ERP还是主数据平台维护见「13」</Note>}
            />
          </Grid.Col>
        </Grid>
      </Card>

      <Card>
        <SectionTitle
          extra={
            <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => form.insertListItem('qualifications', blankQualification())}>
              加一项
            </Button>
          }
        >
          资质附件
        </SectionTitle>
        <Stack gap="sm">
          {qualifications.map((q, index) => (
            <Paper key={q.key} p="sm" radius="md" withBorder>
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
                <Autocomplete label="资质类型" withAsterisk data={qualificationTypes} {...form.getInputProps(`qualifications.${index}.type`)} />
                <TextInput
                  label="附件"
                  withAsterisk
                  readOnly
                  placeholder="点右侧回形针选择文件"
                  rightSectionPointerEvents="all"
                  rightSection={
                    <FileButton accept="application/pdf,image/*" onChange={(file) => file && form.setFieldValue(`qualifications.${index}.fileName`, file.name)}>
                      {(props) => (
                        <ActionIcon {...props} variant="subtle" aria-label="选择附件">
                          <IconPaperclip size={16} />
                        </ActionIcon>
                      )}
                    </FileButton>
                  }
                  {...form.getInputProps(`qualifications.${index}.fileName`)}
                />
                <Group gap={6} align="flex-end" wrap="nowrap">
                  <DateInput label="有效期至" placeholder="长期有效可不填" clearable style={{ flex: 1 }} {...form.getInputProps(`qualifications.${index}.validTo`)} />
                  <ActionIcon size="lg" variant="subtle" color="red" aria-label="删除这一项" onClick={() => form.removeListItem('qualifications', index)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </SimpleGrid>
            </Paper>
          ))}
          {!qualifications.length && (
            <Text fz="sm" c="dimmed">
              还没有资质附件
            </Text>
          )}
          <Note>资质类型自由填写，清单未定「32」。原型只记文件名，不上传文件。样品准入未定「35」。</Note>
        </Stack>
      </Card>

      <Group justify="flex-end" gap="xs">
        {admission ? (
          <Button variant="default" onClick={() => form.reset()}>
            撤销修改
          </Button>
        ) : (
          <Button variant="default" component={Link} to="/buyer/admissions">
            放弃
          </Button>
        )}
        <ActionButton state={admission?.actions.edit} variant="light" onClick={() => save(false)}>
          保存草稿
        </ActionButton>
        <ActionButton state={admission?.actions.submit} onClick={() => save(true)}>
          提交资料审查
        </ActionButton>
      </Group>
    </Stack>
  )
}

/** B28 登记准入资料。 */
export function AdmissionCreatePage() {
  const role = useSession((s) => s.identity?.role)
  if (!can(role, 'admission.write')) return <Forbidden message="只有采购员登记准入资料。" />
  return (
    <>
      <PageHeader title="登记准入资料" back={{ to: '/buyer/admissions', label: '供应商准入' }} badges={<StatusBadge kind="admission" value="draft" />} />
      <AdmissionForm />
    </>
  )
}

const stepIndex: Record<AdmissionStatus, number> = { draft: 0, reviewing: 1, waitingErp: 2, created: 4, terminated: 1 }

function AdmissionSteps({ admission }: { admission: AdmissionView }) {
  const mobile = useMediaQuery('(max-width: 48em)')
  const terminated = admission.status === 'terminated'
  return (
    <Stepper
      active={stepIndex[admission.status]}
      size="sm"
      color={terminated ? 'gray' : undefined}
      orientation={mobile ? 'vertical' : 'horizontal'}
      allowNextStepsSelect={false}
    >
      <Stepper.Step label="登记资料" description="采购员登记" />
      <Stepper.Step label="资料审查" description={terminated ? '已终止' : '采购员或品质出具意见'} color={terminated ? 'red' : undefined} />
      <Stepper.Step label="提交ERP建档" description="门户不发编码" />
      <Stepper.Step label="ERP回传编码" description={admission.erpCode ?? 'SUP加6位序号'} />
    </Stepper>
  )
}

function ReviewTimeline({ admission }: { admission: AdmissionView }) {
  if (!admission.reviews.length) {
    return (
      <Text fz="sm" c="dimmed">
        还没有审查意见
      </Text>
    )
  }
  const since = admission.submittedAt ?? 0
  return (
    <Timeline bulletSize={14} lineWidth={2} active={admission.reviews.length - 1}>
      {admission.reviews.map((r, index) => (
        <Timeline.Item
          key={index}
          color={reviewColors[r.result]}
          title={
            <Group gap={6}>
              <Badge size="xs" variant="light" color={reviewColors[r.result]}>
                {r.result}
              </Badge>
              <Text fz="xs" c="dimmed">
                {r.by}（{r.role}）
              </Text>
              {r.at < since && (
                <Text fz={11} c="dimmed">
                  上一轮提交
                </Text>
              )}
            </Group>
          }
        >
          <Text fz="sm" mt={2}>
            {r.note}
          </Text>
          <Text fz="xs" c="dimmed" className="qs-num">
            {fmtDateTime(r.at)}
          </Text>
        </Timeline.Item>
      ))}
    </Timeline>
  )
}

function AdmissionReadonly({ admission }: { admission: AdmissionView }) {
  const today = todayStr()
  return (
    <>
      <Card>
        <SectionTitle>企业资料</SectionTitle>
        <Fields
          cols={3}
          items={[
            { label: '企业名称', value: admission.name },
            { label: '类别', value: admission.category },
            { label: '统一社会信用代码', value: <span className="qs-mono">{admission.creditCode}</span> },
            { label: <PendingLabel label="工商核验" n={32} />, value: '未接入' },
            { label: <PendingLabel label="样品准入" n={35} />, value: '未定' },
            { label: '联系人', value: admission.contactName },
            { label: '联系电话', value: <span className="qs-num">{admission.contactPhone}</span> },
            { label: '地址', value: admission.address },
            { label: '供货范围', value: admission.supplyScope, span: 3 },
            { label: '关联关系声明', value: admission.relatedDeclaration, span: 3 },
          ]}
        />
      </Card>
      <Card>
        <SectionTitle>资质附件</SectionTitle>
        <DataTable
          records={admission.qualifications}
          idAccessor="id"
          withTableBorder
          borderRadius="md"
          minHeight={admission.qualifications.length ? undefined : 100}
          noRecordsText="没有资质附件"
          columns={[
            { accessor: 'type', title: '资质类型' },
            {
              accessor: 'fileName',
              title: '附件',
              render: (q) => (
                <Group gap={4} wrap="nowrap">
                  <IconPaperclip size={14} color="var(--mantine-color-gray-6)" />
                  <Text fz="sm">{q.fileName}</Text>
                </Group>
              ),
            },
            {
              accessor: 'validTo',
              title: '有效期至',
              render: (q) =>
                q.validTo ? (
                  <Group gap={6} wrap="nowrap">
                    <Text fz="sm" className="qs-num">
                      {q.validTo}
                    </Text>
                    {q.validTo < today && (
                      <Badge size="xs" color="red" variant="light">
                        已过期
                      </Badge>
                    )}
                  </Group>
                ) : (
                  <Text fz="sm" c="dimmed">
                    未填
                  </Text>
                ),
            },
          ]}
        />
      </Card>
    </>
  )
}

function ReviewModal({ admission, onClose }: { admission: AdmissionView; onClose: () => void }) {
  const run = useAction()
  const [result, setResult] = useState<ReviewResult>('通过')
  const effect: Record<ReviewResult, string> = {
    通过: '记一条「通过」意见。至少有一条通过意见后，采购员可以提交ERP建档',
    退回补充: '退回草稿，申请人补充资料后重新提交',
    终止: '这份申请结束，不能再提交',
  }
  return (
    <ReasonModal
      opened
      onClose={onClose}
      title={`审查意见 · ${admission.name}`}
      label="审查意见"
      placeholder="写明依据，例如缺哪项资质、有效期是否覆盖"
      color={result === '终止' ? 'red' : undefined}
      confirmLabel={`提交「${result}」`}
      onSubmit={({ reason }) => run(`/admissions/${admission.id}/review`, { result, note: reason }, { success: `已记审查意见：${result}` })}
    >
      <SegmentedControl fullWidth data={['通过', '退回补充', '终止']} value={result} onChange={(value) => setResult(value as ReviewResult)} />
      <Text fz="xs" c="dimmed">
        {effect[result]}
      </Text>
      <Note>分级阈值、资质类型、吊销注销后是否自动冻结见「32」；是否做样品准入见「35」。</Note>
    </ReasonModal>
  )
}

function AdmissionDetailContent({ admission }: { admission: AdmissionView }) {
  const run = useAction()
  const logs = useApi<AuditLog[]>(`/audit-logs?objectId=${admission.id}`)
  const [dialog, setDialog] = useState<'review' | 'erp' | null>(null)
  const editing = !admission.actions.edit.hidden
  const lastReturn = admission.status === 'draft' ? admission.reviews.findLast((r) => r.result === '退回补充') : undefined
  return (
    <>
      <PageHeader
        back={{ to: '/buyer/admissions', label: '供应商准入' }}
        title={admission.name}
        badges={<StatusBadge kind="admission" value={admission.status} />}
        subtitle={`${admissionNo(admission)} · 申请人 ${admission.applicant} · 登记于 ${fmtDateTime(admission.createdAt)}`}
        actions={
          <>
            <ActionButton state={admission.actions.review} onClick={() => setDialog('review')}>
              出具审查意见
            </ActionButton>
            <ActionButton state={admission.actions.requestErp} variant="light" onClick={() => setDialog('erp')}>
              提交ERP建档
            </ActionButton>
          </>
        }
      />
      <Stack gap="md">
        <Card>
          <AdmissionSteps admission={admission} />
        </Card>

        {admission.status === 'created' && admission.erpCode && (
          <Alert color="green" variant="light">
            <Text fz="sm">
              ERP已建档，回传供应商编码{' '}
              <Anchor component={Link} to={`/buyer/suppliers/${admission.erpCode}`} className="qs-mono" fz="sm">
                {admission.erpCode}
              </Anchor>
              （{fmtDateTime(admission.erpCreatedAt)}）。分级为「未分级」，门户未开通，开通前由采购代录。
            </Text>
          </Alert>
        )}
        {admission.status === 'terminated' && (
          <Alert color="gray" variant="light">
            <Text fz="sm">这份申请已终止，不能再提交。需要重新准入时另行登记。</Text>
          </Alert>
        )}
        {lastReturn && (
          <Alert color="orange" variant="light" title="审查退回补充">
            <Text fz="sm">
              {lastReturn.note}（{lastReturn.by}，{fmtDateTime(lastReturn.at)}）
            </Text>
          </Alert>
        )}

        {!admission.actions.simulateErpCreate.hidden && (
          <SimBox title="模拟ERP回传（演示工具）" note="ERP建档后回传SUP编码，供应商档案里出现这家，分级「未分级」，门户未开通。">
            <ActionButton
              state={admission.actions.simulateErpCreate}
              variant="default"
              size="xs"
              onClick={() => run(`/admissions/${admission.id}/simulate-erp`, undefined, { success: 'ERP已建档并回传供应商编码' })}
            >
              模拟ERP建档完成
            </ActionButton>
          </SimBox>
        )}

        <Grid gap="md">
          <Grid.Col span={{ base: 12, lg: 8 }}>
            <Stack gap="md">{editing ? <AdmissionForm key={admission.updatedAt} admission={admission} /> : <AdmissionReadonly admission={admission} />}</Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 4 }}>
            <Card h="100%">
              <SectionTitle>审查意见</SectionTitle>
              <ReviewTimeline admission={admission} />
              {admission.status === 'reviewing' && (
                <Stack mt="sm">
                  <Note>提交ERP建档要求本轮提交之后至少有一条「通过」意见；审查可由采购员或品质出具。</Note>
                </Stack>
              )}
            </Card>
          </Grid.Col>
        </Grid>

        <Card>
          <SectionTitle extra={<ReadonlyLogBadge />}>操作日志</SectionTitle>
          <QueryState query={logs}>{(rows) => <AuditTable logs={rows} withObject={false} />}</QueryState>
        </Card>
      </Stack>

      {dialog === 'review' && <ReviewModal admission={admission} onClose={() => setDialog(null)} />}
      <ReasonModal
        opened={dialog === 'erp'}
        onClose={() => setDialog(null)}
        title="提交ERP建档"
        label={null}
        description="提交后由ERP建档并回传SUP编码。门户不发第二套供应商编码（《6》§二）；回传之前不能为它下单。"
        confirmLabel="提交"
        onSubmit={() => run(`/admissions/${admission.id}/request-erp`, undefined, { success: '已提交ERP建档' })}
      />
    </>
  )
}

/** B28 准入详情：资料、审查意见、提交ERP建档、模拟ERP回传编码。 */
export function AdmissionDetailPage() {
  const { id = '' } = useParams()
  const query = useApi<AdmissionView>(`/admissions/${id}`)
  return <QueryState query={query}>{(admission) => <AdmissionDetailContent key={admission.id} admission={admission} />}</QueryState>
}
