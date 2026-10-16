import { Group, Paper, Text, UnstyledButton } from '@mantine/core'
import { IconChevronRight } from '@tabler/icons-react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import type { DashboardCard } from '../domain/views'

/** 待办卡片：左侧色条表示语义，数字为0时淡显。 */
export function StatCard({ card, hint }: { card: DashboardCard; hint?: string }) {
  return (
    <UnstyledButton component={Link} to={card.link} style={{ display: 'block' }}>
      <Paper
        withBorder
        p="md"
        className="qs-stat qs-card-link"
        data-empty={card.count === 0 || undefined}
        style={{ '--qs-stat-tone': `var(--mantine-color-${card.tone}-6)` } as CSSProperties}
      >
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <div>
            <Text fz={26} fw={700} lh={1.1} className="qs-num" c={card.count ? `${card.tone}.8` : 'dimmed'}>
              {card.count}
            </Text>
            <Text fz="sm" fw={600} mt={6}>
              {card.label}
            </Text>
            {hint && (
              <Text fz="xs" c="dimmed" mt={2}>
                {hint}
              </Text>
            )}
          </div>
          <IconChevronRight size={16} color="var(--mantine-color-gray-5)" />
        </Group>
      </Paper>
    </UnstyledButton>
  )
}
