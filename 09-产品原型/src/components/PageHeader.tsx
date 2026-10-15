import { Anchor, Box, Group, Stack, Text, Title } from '@mantine/core'
import { IconChevronLeft } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { RichText } from './marks'

interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  back?: { to: string; label: string }
  badges?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, back, badges, actions }: PageHeaderProps) {
  return (
    <Stack gap={6} mb="lg">
      {back && (
        <Anchor component={Link} to={back.to} fz="xs" c="dimmed" className="qs-no-print" w="fit-content">
          <Group gap={2}>
            <IconChevronLeft size={14} />
            {back.label}
          </Group>
        </Anchor>
      )}
      <Group justify="space-between" align="flex-start" gap="md">
        <Box style={{ minWidth: 0, flex: '1 1 320px' }}>
          <Group gap="xs" align="center">
            <Title order={2} style={{ wordBreak: 'break-all' }}>
              {title}
            </Title>
            {badges}
          </Group>
          {subtitle && (
            <Text fz="sm" c="dimmed" mt={4}>
              {typeof subtitle === 'string' ? <RichText>{subtitle}</RichText> : subtitle}
            </Text>
          )}
        </Box>
        {actions && (
          <Group gap="xs" className="qs-no-print" wrap="wrap" justify="flex-end">
            {actions}
          </Group>
        )}
      </Group>
    </Stack>
  )
}

export function SectionTitle({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <Group justify="space-between" mb="sm" gap="xs">
      <Text className="qs-section-title">{children}</Text>
      {extra}
    </Group>
  )
}
