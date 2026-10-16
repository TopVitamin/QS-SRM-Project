import { Alert, Anchor, Badge, Button, Card, Grid, Group, SimpleGrid, Stack, Text } from '@mantine/core'
import { IconArrowRight, IconRoute } from '@tabler/icons-react'
import { Link } from 'react-router'
import { useApi } from '../api/hooks'
import { AuditTable, ReadonlyLogBadge } from '../components/AuditTable'
import { DocNo } from '../components/marks'
import { PageHeader, SectionTitle } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { StatCard } from '../components/StatCard'
import { alertKinds } from '../domain/alerts'
import { roleLabels } from '../domain/labels'
import type { DashboardData, DemoScenario } from '../domain/views'
import { useSession } from '../stores/session'

/** B01 我的待办：卡片按角色显示（《2》§1.2）。 */
export function Dashboard() {
  const identity = useSession((s) => s.identity)!
  const query = useApi<DashboardData>('/dashboard')
  const scenarios = useApi<DemoScenario[]>('/demo/scenarios')

  return (
    <>
      <PageHeader title="我的待办" subtitle={`${identity.userName} · ${roleLabels[identity.role]}。卡片按角色显示，点开直接进入带筛选的列表。`} />
      <QueryState query={query}>
        {(data) => {
          const mine = data.cards.filter((card) => card.roles.includes(identity.role))
          const others = data.cards.filter((card) => !card.roles.includes(identity.role) && card.count > 0)
          return (
            <Stack gap="lg">
              {mine.length ? (
                <SimpleGrid cols={{ base: 1, xs: 2, md: 3, xl: 4 }} spacing="md">
                  {mine.map((card) => (
                    <StatCard key={card.key} card={card} />
                  ))}
                </SimpleGrid>
              ) : (
                <Alert color="gray">当前角色没有待办卡片。计划是只读角色，可以查看采购订单和交付预警。</Alert>
              )}

              <Grid gap="lg">
                <Grid.Col span={{ base: 12, lg: 7 }}>
                  <Card h="100%">
                    <SectionTitle extra={<Badge variant="light" color="gray">《9》检验场景</Badge>}>演示路线</SectionTitle>
                    <QueryState query={scenarios}>
                      {(list) => (
                        <Stack gap="sm">
                          {list.map((scenario) => (
                            <div key={scenario.key}>
                              <Group gap={6} mb={2}>
                                <IconRoute size={14} color="var(--mantine-color-jade-7)" />
                                <Text fz="sm" fw={650}>
                                  {scenario.title}
                                </Text>
                                <Text fz="xs" c="dimmed">
                                  {scenario.basis}
                                </Text>
                              </Group>
                              <Text fz="xs" c="dimmed" mb={6}>
                                {scenario.summary}
                              </Text>
                              <Group gap={6}>
                                {scenario.links.map((link) => (
                                  <Button key={link.to} size="compact-xs" variant="light" component={Link} to={link.to} rightSection={<IconArrowRight size={12} />}>
                                    {link.label}
                                  </Button>
                                ))}
                                {!scenario.links.length && (
                                  <Text fz="xs" c="dimmed">
                                    当前示例数据里没有这个场景的单据，可以重置示例数据。
                                  </Text>
                                )}
                              </Group>
                            </div>
                          ))}
                        </Stack>
                      )}
                    </QueryState>
                  </Card>
                </Grid.Col>
                <Grid.Col span={{ base: 12, lg: 5 }}>
                  <Card h="100%">
                    <SectionTitle
                      extra={
                        <Anchor component={Link} to="/buyer/alerts" fz="xs">
                          全部预警
                        </Anchor>
                      }
                    >
                      交付预警
                    </SectionTitle>
                    {data.alerts.length === 0 ? (
                      <Text fz="sm" c="dimmed">
                        没有预警
                      </Text>
                    ) : (
                      <Stack gap="xs">
                        {data.alerts.map((alert) => (
                          <Group key={`${alert.orderId}-${alert.kind}`} justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
                            <div style={{ minWidth: 0 }}>
                              <Group gap={6} wrap="nowrap">
                                <Badge size="xs" color={alertKinds[alert.kind].color} variant="light">
                                  {alertKinds[alert.kind].label}
                                </Badge>
                                <DocNo no={alert.orderNo} to={`/buyer/orders/${alert.orderId}`} size="xs" />
                              </Group>
                              <Text fz="xs" c="dimmed" truncate="end">
                                {alert.supplierName} · {alert.message}
                              </Text>
                            </div>
                            <Text fz="xs" className="qs-num" c={alert.daysLeft < 0 ? 'red.7' : undefined} style={{ whiteSpace: 'nowrap' }}>
                              {alert.daysLeft < 0 ? `逾期${-alert.daysLeft}天` : `剩${alert.daysLeft}天`}
                            </Text>
                          </Group>
                        ))}
                      </Stack>
                    )}
                  </Card>
                </Grid.Col>
              </Grid>

              <Card>
                <SectionTitle
                  extra={
                    <Group gap="xs">
                      <ReadonlyLogBadge />
                      <Anchor component={Link} to="/buyer/audit-logs" fz="xs">
                        全部日志
                      </Anchor>
                    </Group>
                  }
                >
                  最近操作
                </SectionTitle>
                <AuditTable logs={data.recentLogs} />
              </Card>

              {others.length > 0 && (
                <Card>
                  <SectionTitle>其他角色的待办</SectionTitle>
                  <Group gap="xs">
                    {others.map((card) => (
                      <Badge key={card.key} variant="default" size="lg" fw={500}>
                        {card.label} {card.count} · {card.roles.map((r) => roleLabels[r as keyof typeof roleLabels]).join('、')}
                      </Badge>
                    ))}
                  </Group>
                </Card>
              )}
            </Stack>
          )
        }}
      </QueryState>
    </>
  )
}
