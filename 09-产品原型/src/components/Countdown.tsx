import { Badge, Text } from '@mantine/core'
import { IconClockHour4 } from '@tabler/icons-react'
import { useNow } from '../api/hooks'
import { remaining } from '../domain/format'

/** 24小时确认、72小时红字确认的倒计时。超时只标红，不自动处理（《4》§三）。 */
export function Countdown({ deadline, variant = 'badge', overdueText = '已超时' }: { deadline?: number; variant?: 'badge' | 'text'; overdueText?: string }) {
  const now = useNow(30_000)
  if (!deadline) return null
  const left = remaining(deadline, now)
  const label = left.overdue ? `${overdueText} ${left.text}` : `剩余 ${left.text}`
  const color = left.overdue ? 'red' : left.hours < 6 ? 'orange' : 'gray'
  if (variant === 'text') {
    return (
      <Text span fz="xs" c={left.overdue ? 'red.7' : left.hours < 6 ? 'orange.8' : 'dimmed'} fw={left.overdue ? 650 : undefined} className="qs-num">
        {label}
      </Text>
    )
  }
  return (
    <Badge color={color} variant={left.overdue ? 'filled' : 'light'} leftSection={<IconClockHour4 size={12} />} className="qs-num">
      {label}
    </Badge>
  )
}
