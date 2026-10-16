import { Box, Group } from '@mantine/core'
import type { ReactNode } from 'react'

/** 门户手机端的主要动作固定在底部标签栏上方；宽屏仍放在页头，这个栏不显示（10.6）。 */
export function StickyActions({ children }: { children: ReactNode }) {
  return (
    <Box className="qs-sticky-actions qs-no-print" hiddenFrom="sm" mt="lg">
      <Group gap="xs" grow wrap="wrap">
        {children}
      </Group>
    </Box>
  )
}

/** 门户页头里的动作只在宽屏显示，手机上交给StickyActions。工作台照常显示。 */
export function HeaderActions({ portal, children }: { portal: boolean; children: ReactNode }) {
  if (!portal) return <>{children}</>
  return (
    <Group gap="xs" visibleFrom="sm" wrap="wrap" justify="flex-end">
      {children}
    </Group>
  )
}
