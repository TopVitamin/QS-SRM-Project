import { Anchor, Badge, Box, Group, HoverCard, Stack, Text, Tooltip, type BadgeProps } from '@mantine/core'
import { IconFlask, IconInfoCircle, IconLock } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { EMPTY, fmtDateTime } from '../domain/format'
import { suggestedPrefixNote } from '../domain/labels'
import { getPending, pendingSource } from '../domain/pending'
import type { ProxyInfo } from '../domain/types'

const pad = (n: number) => String(n).padStart(2, '0')

/** 琥珀色虚线的「待确认-n」，悬停看待对齐事项里的原文。编号不在索引里时变红。 */
export function PendingTag({ n }: { n: number }) {
  const entry = getPending(n)
  const code = `待确认-${pad(n)}`
  return (
    <HoverCard width={360} position="top" openDelay={60} closeDelay={80}>
      <HoverCard.Target>
        <span className="qs-pending" data-missing={entry ? undefined : true} tabIndex={0} role="note" aria-label={code}>
          {code}
        </span>
      </HoverCard.Target>
      <HoverCard.Dropdown>
        {entry ? (
          <Stack gap={6}>
            <Text fz="xs" fw={650} c="orange.8">
              【{code}】
            </Text>
            <Text fz="sm">{entry.fact}</Text>
            <Text fz="xs" c="dimmed">
              涉及：{entry.where} · 出自{pendingSource}
            </Text>
          </Stack>
        ) : (
          <Text fz="sm" c="red">
            待对齐事项索引里没有【{code}】，先补索引再在原型里引用
          </Text>
        )}
      </HoverCard.Dropdown>
    </HoverCard>
  )
}

/** 字段名或表头后面跟一个「待确认-n」。 */
export function PendingLabel({ label, n }: { label: string; n: number }) {
  return (
    <Group gap={4} wrap="nowrap" component="span" display="inline-flex">
      {label}
      <PendingTag n={n} />
    </Group>
  )
}

const tokenPattern = /待确认-(\d{1,2})|「(\d{1,2})」/g

/** 文字里出现的「待确认-n」或「n」换成可悬停的标记，其余原样输出。 */
export function RichText({ children }: { children: string }) {
  const parts: ReactNode[] = []
  let last = 0
  for (const match of children.matchAll(tokenPattern)) {
    const index = match.index ?? 0
    if (index > last) parts.push(children.slice(last, index))
    parts.push(<PendingTag key={index} n={Number(match[1] ?? match[2])} />)
    last = index + match[0].length
  }
  if (last < children.length) parts.push(children.slice(last))
  return <>{parts}</>
}

/** 小号说明文字，带信息图标；字符串里的待确认编号自动变成标记。 */
export function Note({ children, icon = true, c = 'dimmed' }: { children: ReactNode; icon?: boolean; c?: string }) {
  return (
    <Group gap={6} wrap="nowrap" align="flex-start">
      {icon && <IconInfoCircle size={14} style={{ marginTop: 3, flexShrink: 0, color: 'var(--mantine-color-dimmed)' }} />}
      <Text fz="xs" c={c} lh={1.6}>
        {typeof children === 'string' ? <RichText>{children}</RichText> : children}
      </Text>
    </Group>
  )
}

export function SampleBadge(props: BadgeProps) {
  return (
    <Badge color="grape" variant="light" radius="sm" {...props}>
      示例数据
    </Badge>
  )
}

/** 模拟回传按钮放在虚线框里，和业务按钮分开。 */
export function SimBox({ title = '模拟ERP/WMS回传（演示工具）', note, children }: { title?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <Box className="qs-sim qs-no-print" p="sm">
      <Group gap={6} mb={8}>
        <IconFlask size={14} color="var(--mantine-color-gray-6)" />
        <Text fz="xs" fw={650} c="dimmed">
          {title}
        </Text>
      </Group>
      {note && (
        <Text fz="xs" c="dimmed" mb={8}>
          {typeof note === 'string' ? <RichText>{note}</RichText> : note}
        </Text>
      )}
      <Group gap="xs">{children}</Group>
    </Box>
  )
}

/** ERP回传的内容在门户里只读，灰底加锁。 */
export function ErpReadonly({ title = 'ERP只读副本', extra, children }: { title?: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <Box className="qs-erp" p="md">
      <Group gap={6} mb="xs" justify="space-between">
        <Group gap={6}>
          <IconLock size={14} color="var(--mantine-color-gray-6)" />
          <Text fz="xs" fw={650} c="dimmed">
            {title}
          </Text>
        </Group>
        {extra}
      </Group>
      {children}
    </Box>
  )
}

const suggestedPrefixes = ['FHD', 'YYSH', 'JYJS', 'DZD', 'KPSQ']

/** 单号用等宽字体。建议前缀只是演示，旁边标出来；红字确认单号是模拟编号。 */
export function DocNo({ no, to, size = 'sm' }: { no?: string; to?: string; size?: 'xs' | 'sm' | 'md' }) {
  if (!no) return <Text fz={size}>{EMPTY}</Text>
  const prefix = no.split('-')[0]
  const text = to ? (
    <Anchor component={Link} to={to} fz={size} className="qs-mono" onClick={(event) => event.stopPropagation()}>
      {no}
    </Anchor>
  ) : (
    <Text span fz={size} className="qs-mono">
      {no}
    </Text>
  )
  const tag = suggestedPrefixes.includes(prefix) ? suggestedPrefixNote : prefix === 'HZQRD' ? '模拟编号' : null
  if (!tag) return text
  return (
    <Group gap={4} wrap="nowrap" display="inline-flex">
      {text}
      <Text span fz={10} c="dimmed" style={{ whiteSpace: 'nowrap' }}>
        {tag}
      </Text>
    </Group>
  )
}

/** 主数据引用用Code-Name，编码和名称之间一个空格。 */
export function CodeName({ code, name, size = 'sm' }: { code?: string; name?: string; size?: 'xs' | 'sm' | 'md' }) {
  if (!code && !name) return <Text fz={size}>{EMPTY}</Text>
  return (
    <Text fz={size} span>
      {code && <span className="qs-mono">{code}</span>}
      {code && name ? ' ' : ''}
      {name}
    </Text>
  )
}

export function ProxyBadge({ info }: { info?: ProxyInfo | boolean }) {
  if (!info) return null
  const badge = (
    <Badge color="cyan" variant="light" size="sm">
      代录
    </Badge>
  )
  if (info === true) return badge
  return (
    <Tooltip label={`代录人：${info.proxyBy}；时间：${fmtDateTime(info.proxyAt)}；依据：${info.basisType}，${info.basisNote}`}>{badge}</Tooltip>
  )
}

/** 数量和价格旁的锁：供应商不能改值。 */
export function LockHint({ label = '供应商不能修改数量和价格。有异议只能拒绝接单并写明原因' }: { label?: string }) {
  return (
    <Tooltip label={label}>
      <IconLock size={12} style={{ verticalAlign: -1, marginLeft: 3, color: 'var(--mantine-color-gray-5)' }} aria-label="只读" />
    </Tooltip>
  )
}
