import { Badge, Box, Button, Card, Checkbox, Group, NumberInput, Paper, Radio, SegmentedControl, Stack, Switch, Text, TextInput } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconRefresh, IconRestore, IconSearch } from '@tabler/icons-react'
import { DataTable } from 'mantine-datatable'
import { useState, type ReactNode } from 'react'
import { useDemoReset, usePulseData } from '../api/hooks'
import { Note, PendingTag, RichText } from '../components/marks'
import { ReasonModal } from '../components/modals'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { matchText } from '../components/urlState'
import { fmtDateTime } from '../domain/format'
import { pendingIndex, pendingSource } from '../domain/pending'
import type { PrototypeConfig } from '../domain/types'
import { defaultConfig, useConfig } from '../stores/config'

type Option<V> = { value: V; label: string }
type ChoiceKey = Exclude<keyof PrototypeConfig, 'changeFields' | 'invoiceTolerance'>

const switchable = new Set([2, 3, 4, 5, 6, 16, 17, 19, 24, 34, 41])

const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b)

function Choice<V>({ value, options, onChange }: { value: V; options: Option<V>[]; onChange: (value: V) => void }) {
  const mobile = useMediaQuery('(max-width: 48em)')
  const index = String(options.findIndex((o) => o.value === value))
  const pick = (i: string) => onChange(options[Number(i)].value)
  if (options.some((o) => o.label.length > 9)) {
    return (
      <Radio.Group value={index} onChange={pick}>
        <Stack gap={8}>
          {options.map((o, i) => (
            <Radio key={o.label} value={String(i)} label={o.label} />
          ))}
        </Stack>
      </Radio.Group>
    )
  }
  return (
    <SegmentedControl
      fullWidth
      orientation={mobile ? 'vertical' : 'horizontal'}
      value={index}
      onChange={pick}
      data={options.map((o, i) => ({ value: String(i), label: o.label }))}
    />
  )
}

function SettingRow({ n, title, effect, changed, defaultText, children }: { n?: number; title: string; effect: string; changed: boolean; defaultText: string; children: ReactNode }) {
  return (
    <Paper p="md" radius="md" withBorder style={changed ? { borderColor: 'var(--mantine-color-orange-4)' } : undefined}>
      <Group align="flex-start" justify="space-between" gap="md" wrap="wrap">
        <Stack gap={4} style={{ flex: '1 1 280px', minWidth: 0 }}>
          <Group gap={6} wrap="wrap">
            <Text fz="sm" fw={600}>
              {title}
            </Text>
            {n !== undefined && <PendingTag n={n} />}
            {changed && (
              <Badge size="xs" color="orange" variant="light">
                已改
              </Badge>
            )}
          </Group>
          <Text fz="xs" c="dimmed">
            影响：<RichText>{effect}</RichText>
          </Text>
          <Text fz="xs" c="dimmed">
            原型默认：{defaultText}
          </Text>
        </Stack>
        <Box style={{ flex: '1 1 340px', minWidth: 0 }}>{children}</Box>
      </Group>
    </Paper>
  )
}

function ChoiceRow<K extends ChoiceKey>({ k, n, title, effect, options }: { k: K; n?: number; title: string; effect: string; options: Option<PrototypeConfig[K]>[] }) {
  const value = useConfig((s) => s.config[k])
  const setConfig = useConfig((s) => s.setConfig)
  return (
    <SettingRow
      n={n}
      title={title}
      effect={effect}
      changed={differs(value, defaultConfig[k])}
      defaultText={options.find((o) => o.value === defaultConfig[k])?.label ?? '-'}
    >
      <Choice value={value} options={options} onChange={(next) => setConfig({ [k]: next } as Partial<PrototypeConfig>)} />
    </SettingRow>
  )
}

const changeFieldItems = [
  { key: 'qty', label: '采购数量' },
  { key: 'price', label: '含税单价' },
  { key: 'warehouse', label: '收货仓库' },
] as const

function ChangeFieldsRow() {
  const fields = useConfig((s) => s.config.changeFields)
  const setConfig = useConfig((s) => s.setConfig)
  return (
    <SettingRow n={3} title="推送后可变更的字段" effect="发起变更。承诺交期常开" changed={differs(fields, defaultConfig.changeFields)} defaultText="只开承诺交期">
      <Group gap="lg">
        <Checkbox label="承诺交期（常开）" checked disabled />
        {changeFieldItems.map((item) => (
          <Checkbox
            key={item.key}
            label={item.label}
            checked={fields[item.key]}
            onChange={(event) => setConfig({ changeFields: { ...fields, [item.key]: event.currentTarget.checked } })}
          />
        ))}
      </Group>
    </SettingRow>
  )
}

function ToleranceRow() {
  const tolerance = useConfig((s) => s.config.invoiceTolerance)
  const setConfig = useConfig((s) => s.setConfig)
  return (
    <SettingRow n={17} title="尾差容差" effect="税票预校验。未设定时只提示差额，不判定通过" changed={tolerance !== defaultConfig.invoiceTolerance} defaultText="未设定">
      <Group gap="md" align="flex-end">
        <Switch label="填一个金额" checked={tolerance !== null} onChange={(event) => setConfig({ invoiceTolerance: event.currentTarget.checked ? 0 : null })} mb={8} />
        <NumberInput
          label="容差（元）"
          disabled={tolerance === null}
          value={tolerance ?? ''}
          min={0}
          max={100}
          step={0.01}
          decimalScale={2}
          onChange={(value) => setConfig({ invoiceTolerance: typeof value === 'number' ? value : 0 })}
          w={150}
        />
      </Group>
    </SettingRow>
  )
}

function PendingIndexCard() {
  const [q, setQ] = useState('')
  const entries = [...pendingIndex.values()].filter((e) => matchText(q, e.fact, e.where, String(e.n).padStart(2, '0')))
  return (
    <Card>
      <SectionTitle
        extra={
          <Text fz="xs" c="dimmed">
            原文读自{pendingSource}
          </Text>
        }
      >
        全部待确认（{pendingIndex.size}条）
      </SectionTitle>
      <TextInput
        leftSection={<IconSearch size={14} />}
        placeholder="编号或关键词，例如：红字、账期、34"
        value={q}
        onChange={(event) => setQ(event.currentTarget.value)}
        mb="sm"
        w={{ base: '100%', sm: 320 }}
      />
      <DataTable
        records={entries}
        idAccessor="n"
        height={440}
        withTableBorder
        borderRadius="md"
        noRecordsText="没有匹配的待确认事项"
        columns={[
          { accessor: 'n', title: '编号', width: 110, render: (e) => <PendingTag n={e.n} /> },
          { accessor: 'fact', title: '缺的事实', render: (e) => <Text fz="sm">{e.fact}</Text> },
          {
            accessor: 'where',
            title: '涉及',
            width: 180,
            render: (e) => (
              <Text fz="xs" c="dimmed">
                {e.where}
              </Text>
            ),
          },
          {
            accessor: 'switch',
            title: '本页开关',
            width: 96,
            render: (e) =>
              switchable.has(e.n) ? (
                <Badge size="xs" variant="light">
                  有
                </Badge>
              ) : (
                <Text fz="xs" c="dimmed">
                  -
                </Text>
              ),
          },
        ]}
      />
    </Card>
  )
}

/** B31 原型配置：待确认开关、模拟ERP接口状态、重置示例数据（前端设计说明9.2）。演示工具，不是业务权限。 */
export function PrototypeSettings() {
  const config = useConfig((s) => s.config)
  const resetConfig = useConfig((s) => s.resetConfig)
  const reset = useDemoReset()
  const pulse = usePulseData()
  const [resetOpened, setResetOpened] = useState(false)
  const changedCount = (Object.keys(defaultConfig) as (keyof PrototypeConfig)[]).filter((key) => differs(config[key], defaultConfig[key])).length
  return (
    <>
      <PageHeader
        title="原型配置"
        badges={
          <Badge color="grape" variant="light">
            演示工具
          </Badge>
        }
        subtitle="开关对应还没定的事实。默认值是原型为了能演示而选的，不是结论。切换只影响之后的操作，不改写已有示例数据；想从头演示，重置示例数据。"
        actions={
          <>
            <Button variant="default" leftSection={<IconRestore size={16} />} disabled={!changedCount} onClick={resetConfig}>
              恢复默认{changedCount ? `（已改${changedCount}项）` : ''}
            </Button>
            <Button variant="light" color="red" leftSection={<IconRefresh size={16} />} onClick={() => setResetOpened(true)}>
              重置示例数据
            </Button>
          </>
        }
      />
      <Stack gap="md">
        <Card>
          <SectionTitle>采购订单与ERP</SectionTitle>
          <Stack gap="sm">
            <ChoiceRow
              k="dispatchTiming"
              n={2}
              title="下发供应商的时点"
              effect="审核、推送、门户待确认"
              options={[
                { value: 'onApprove', label: '审核通过即下发，同时推送' },
                { value: 'afterErpAccepted', label: 'ERP接收成功后才下发' },
                { value: 'confirmBeforePush', label: '先请供应商确认，确认后才推送，拒绝的不推送' },
              ]}
            />
            <ChoiceRow
              k="erpNoMode"
              n={5}
              title="ERP采购订单号"
              effect="推送结果、核对"
              options={[
                { value: 'erpOwn', label: 'ERP另编CGDD，SRM单号存为来源' },
                { value: 'reuseSrm', label: 'ERP沿用SRM单号' },
              ]}
            />
            <ChoiceRow
              k="manualRetry"
              n={6}
              title="推送失败后的重推"
              effect="推送监控、订单详情。原型不模拟自动重试"
              options={[
                { value: true, label: '采购员可手工重推' },
                { value: false, label: '只允许系统自动重试' },
              ]}
            />
            <ChoiceRow
              k="closeInitiator"
              n={4}
              title="关闭、取消的发起方"
              effect="订单详情"
              options={[
                { value: 'undecided', label: '未定（按钮置灰）' },
                { value: 'srm', label: '演示由SRM采购员发起' },
              ]}
            />
            <ChoiceRow
              k="erpAvailable"
              title="模拟ERP接口状态"
              effect="演示推送失败和重推"
              options={[
                { value: true, label: '正常' },
                { value: false, label: '不可用（推送都失败）' },
              ]}
            />
          </Stack>
        </Card>

        <Card>
          <SectionTitle>订单变更</SectionTitle>
          <Stack gap="sm">
            <ChangeFieldsRow />
            <ChoiceRow
              k="reconfirmAfterChange"
              n={3}
              title="变更生效后请供应商重新确认"
              effect="变更生效后的确认状态"
              options={[
                { value: true, label: '是' },
                { value: false, label: '否' },
              ]}
            />
            <ChoiceRow
              k="changeNeedsApproval"
              n={41}
              title="订单变更须审核"
              effect="变更、审核中心"
              options={[
                { value: true, label: '是（单级）' },
                { value: false, label: '否（提交即推送）' },
              ]}
            />
          </Stack>
        </Card>

        <Card>
          <SectionTitle>交付</SectionTitle>
          <Stack gap="sm">
            <ChoiceRow
              k="shipBeforeConfirm"
              n={19}
              title="未确认的订单能否发货"
              effect="新建发货单"
              options={[
                { value: false, label: '不允许' },
                { value: true, label: '允许' },
              ]}
            />
            <ChoiceRow
              k="appointmentNeedsConfirm"
              n={24}
              title="预约须仓库人工确认"
              effect="预约"
              options={[
                { value: true, label: '是' },
                { value: false, label: '否' },
              ]}
            />
            <ChoiceRow
              k="alertDays"
              title="交付预警提前天数"
              effect="交付预警。两档都写在《4》§三，不是待确认"
              options={[
                { value: 10, label: '阶段4：10天' },
                { value: 7, label: '阶段5：7天' },
              ]}
            />
          </Stack>
        </Card>

        <Card>
          <SectionTitle>对账与开票</SectionTitle>
          <Stack gap="sm">
            <ChoiceRow
              k="reconInitiator"
              n={16}
              title="对账发起方"
              effect="对账列表"
              options={[
                { value: 'enterprise', label: '企业侧' },
                { value: 'supplier', label: '供应商' },
                { value: 'both', label: '双方' },
              ]}
            />
            <ChoiceRow
              k="reconCancelAllowed"
              n={16}
              title="已发送未开票的对账单能否取消"
              effect="对账详情"
              options={[
                { value: false, label: '不允许' },
                { value: true, label: '允许' },
              ]}
            />
            <ToleranceRow />
          </Stack>
        </Card>

        <Card>
          <SectionTitle>数据范围</SectionTitle>
          <ChoiceRow
            k="buyerScopeAssigned"
            n={34}
            title="采购员按人分管供应商"
            effect="企业侧列表范围"
            options={[
              { value: false, label: '否，企业侧看全部供应商' },
              { value: true, label: '是，采购员只看分管的供应商' },
            ]}
          />
        </Card>

        <Card>
          <SectionTitle>示例数据</SectionTitle>
          <Group justify="space-between" gap="sm" wrap="wrap">
            <Text fz="sm">
              生成于 <span className="qs-num">{fmtDateTime(pulse?.seededAt)}</span>，日期按生成当天推算。数据存在本浏览器里，不同浏览器互不影响。
            </Text>
            <Button variant="light" color="red" size="xs" leftSection={<IconRefresh size={14} />} onClick={() => setResetOpened(true)}>
              重置示例数据
            </Button>
          </Group>
          <Stack mt="xs">
            <Note>示例数据只用于演示，不是验收数据；一期演示场景的验收数据和通过标准见「38」。</Note>
          </Stack>
        </Card>

        <PendingIndexCard />
      </Stack>

      <ReasonModal
        opened={resetOpened}
        onClose={() => setResetOpened(false)}
        title="重置示例数据"
        label={null}
        description="所有演示操作都会丢失，示例数据回到初始状态，日期按今天重新生成。原型配置开关不变。"
        confirmLabel="重置"
        color="red"
        onSubmit={reset}
      />
    </>
  )
}
