import { Badge, type MantineSize } from '@mantine/core'
import { statusDef, type StatusKind } from '../domain/labels'

export function StatusBadge({ kind, value, size = 'sm' }: { kind: StatusKind; value?: string; size?: MantineSize }) {
  const def = statusDef(kind, value)
  return (
    <Badge color={def.color} variant="light" size={size}>
      {def.label}
    </Badge>
  )
}

export function ToneBadge({ color, children, size = 'sm' }: { color: string; children: string; size?: MantineSize }) {
  return (
    <Badge color={color} variant="light" size={size}>
      {children}
    </Badge>
  )
}
