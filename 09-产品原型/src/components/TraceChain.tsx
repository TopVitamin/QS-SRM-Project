import { Alert, Anchor, Badge, Group, Paper, Stack, Text, Timeline } from '@mantine/core'
import { IconAlertTriangle, IconBuildingBank, IconBuildingWarehouse, IconReceiptTax, IconWorld } from '@tabler/icons-react'
import { Link } from 'react-router'
import type { TraceNode } from '../domain/views'

const layerStyle: Record<TraceNode['layer'], { color: string; icon: typeof IconWorld }> = {
  门户: { color: 'jade', icon: IconWorld },
  ERP: { color: 'gray', icon: IconBuildingWarehouse },
  税务: { color: 'orange', icon: IconReceiptTax },
  金蝶: { color: 'indigo', icon: IconBuildingBank },
}

/** 追溯链沿用《5》§四。金蝶只写明「在金蝶」，不画假节点。 */
export function TraceChain({ nodes }: { nodes: TraceNode[] }) {
  const warn = nodes.find((n) => n.warn)?.warn
  return (
    <Stack gap="md">
      {warn && (
        <Alert color="red" variant="filled" icon={<IconAlertTriangle size={18} />} title="作废箱码">
          {warn}
        </Alert>
      )}
      <Timeline bulletSize={26} lineWidth={2} active={nodes.length}>
        {nodes.map((node) => {
          const style = layerStyle[node.layer]
          const Icon = style.icon
          return (
            <Timeline.Item
              key={node.key}
              color={node.warn ? 'red' : style.color}
              bullet={<Icon size={14} />}
              title={
                <Group gap="xs" wrap="wrap">
                  <Badge size="xs" variant="light" color={style.color}>
                    {node.layer}
                  </Badge>
                  <Text fz="sm" fw={650}>
                    {node.type}
                  </Text>
                  {node.link ? (
                    <Anchor component={Link} to={node.link} fz="sm" className="qs-mono">
                      {node.no}
                    </Anchor>
                  ) : (
                    <Text fz="sm" className="qs-mono">
                      {node.no}
                    </Text>
                  )}
                  {node.status && (
                    <Badge size="sm" variant="light" color={node.statusColor ?? 'gray'}>
                      {node.status}
                    </Badge>
                  )}
                </Group>
              }
            >
              {(node.detail || node.highlight) && (
                <Paper
                  mt={4}
                  px="sm"
                  py={6}
                  radius="md"
                  withBorder={node.highlight}
                  bg={node.highlight ? (node.warn ? 'red.0' : 'jade.0') : undefined}
                  style={node.highlight ? { borderColor: node.warn ? 'var(--mantine-color-red-3)' : 'var(--mantine-color-jade-3)' } : undefined}
                >
                  <Text fz="xs" c={node.highlight ? undefined : 'dimmed'}>
                    {node.detail}
                  </Text>
                </Paper>
              )}
            </Timeline.Item>
          )
        })}
      </Timeline>
    </Stack>
  )
}
