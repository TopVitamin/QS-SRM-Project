import { Alert, Badge, Box, Button, Card, Container, Group, Radio, Select, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconArrowRight, IconBuildingFactory2, IconDeviceDesktop, IconRefresh, IconUserShare } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../api/client'
import { useApi } from '../api/hooks'
import { ReasonModal } from '../components/modals'
import { Note, SampleBadge } from '../components/marks'
import { LoadingBlock } from '../components/QueryState'
import { fmtDateTime } from '../domain/format'
import { roleLabels } from '../domain/labels'
import type { EnterpriseRole } from '../domain/types'
import type { DemoIdentities } from '../domain/views'
import { useSession } from '../stores/session'
import { Brand, SampleStrip } from './shell'

const roleHints: Record<EnterpriseRole, string> = {
  buyer: '建单、审核、推送ERP、发起变更、处理交期建议；替门户未开通的供应商代录',
  finance: '对账、生成开票申请、发起或确认红字确认单',
  warehouse: '确认送货预约，或退回改约',
  quality: '复核缺料反馈，审查准入资料',
  planner: '只读：采购订单、交付预警',
  admin: '给供应商开通门户账号',
}

export function EntryPage() {
  const query = useApi<DemoIdentities>('/identities')
  const identity = useSession((s) => s.identity)
  const setIdentity = useSession((s) => s.setIdentity)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [enterpriseId, setEnterpriseId] = useState('u-b1')
  const [supplierCode, setSupplierCode] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [resetOpened, resetHandlers] = useDisclosure(false)

  const data = query.data
  const supplier = data?.suppliers.find((s) => s.code === supplierCode) ?? data?.suppliers[0]
  const user = supplier?.users.find((u) => u.id === userId) ?? supplier?.users.find((u) => u.isPrimary) ?? supplier?.users[0]

  const enterBuyer = () => {
    const picked = data?.enterprise.find((u) => u.id === enterpriseId)
    if (!picked) return
    setIdentity({ party: 'enterprise', role: picked.role as EnterpriseRole, userId: picked.id, userName: picked.name })
    navigate('/buyer')
  }

  const enterPortal = () => {
    if (!supplier || !user) return
    setIdentity({
      party: 'supplier',
      role: 'supplier',
      userId: user.id,
      userName: user.displayName,
      supplierCode: supplier.code,
      supplierName: supplier.name,
    })
    navigate('/portal')
  }

  const reset = async () => {
    try {
      await api('/demo/reset', { method: 'POST', body: {} })
      await queryClient.invalidateQueries()
      notifications.show({ color: 'jade', message: '示例数据已重置' })
      return true
    } catch (error) {
      notifications.show({ color: 'red', title: '没有成功', message: (error as Error).message })
      return undefined
    }
  }

  return (
    <Box mih="100vh">
      <SampleStrip />
      <Container size={1100} py={{ base: 'lg', sm: 40 }} px="md">
        <Group justify="space-between" mb="xl">
          <Brand subtitle="可运行原型 · 演示入口" to="/" />
          <SampleBadge />
        </Group>

        <Title order={1}>选择演示身份</Title>
        <Text c="dimmed" fz="sm" mt={6} maw={760}>
          这里没有真实登录。身份只用来演示权限：企业侧所有角色进同一个采购工作台，按角色控制按钮；供应商进门户，只看本公司的订单、发货、对账和税票。
        </Text>

        {identity && (
          <Alert mt="lg" color="jade" variant="light" p="sm">
            <Group justify="space-between" gap="xs">
              <Text fz="sm">
                当前身份：{identity.userName}
                {identity.party === 'supplier' ? ` · ${identity.supplierName}` : ` · ${roleLabels[identity.role]}`}
              </Text>
              <Button
                size="xs"
                variant="light"
                rightSection={<IconArrowRight size={14} />}
                component={Link}
                to={identity.party === 'supplier' ? '/portal' : '/buyer'}
              >
                继续
              </Button>
            </Group>
          </Alert>
        )}

        {!data ? (
          <LoadingBlock label="正在准备示例数据" />
        ) : (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mt="lg">
            <Card>
              <Group gap="sm" mb="md" wrap="nowrap">
                <ThemeIcon size={40} radius="md" variant="light">
                  <IconDeviceDesktop size={22} />
                </ThemeIcon>
                <div>
                  <Text fw={700}>采购工作台</Text>
                  <Text fz="xs" c="dimmed">
                    企业侧 · 桌面使用
                  </Text>
                </div>
              </Group>
              <Radio.Group value={enterpriseId} onChange={setEnterpriseId} aria-label="企业侧演示身份">
                <Stack gap={6}>
                  {data.enterprise.map((u) => (
                    <Radio.Card key={u.id} value={u.id} radius="md" px="sm" py={8}>
                      <Group wrap="nowrap" align="flex-start" gap="sm">
                        <Radio.Indicator size="sm" mt={3} />
                        <div>
                          <Group gap={6}>
                            <Text fz="sm" fw={600}>
                              {u.name}
                            </Text>
                            <Badge size="xs" variant="light" color="gray">
                              {roleLabels[u.role as EnterpriseRole]}
                            </Badge>
                          </Group>
                          <Text fz="xs" c="dimmed" mt={2}>
                            {roleHints[u.role as EnterpriseRole]}
                          </Text>
                        </div>
                      </Group>
                    </Radio.Card>
                  ))}
                </Stack>
              </Radio.Group>
              <Button fullWidth mt="md" rightSection={<IconArrowRight size={16} />} onClick={enterBuyer}>
                进入采购工作台
              </Button>
            </Card>

            <Card>
              <Group gap="sm" mb="md" wrap="nowrap">
                <ThemeIcon size={40} radius="md" variant="light" color="cyan">
                  <IconBuildingFactory2 size={22} />
                </ThemeIcon>
                <div>
                  <Text fw={700}>供应商门户</Text>
                  <Text fz="xs" c="dimmed">
                    供应商用户 · 手机和电脑都能用
                  </Text>
                </div>
              </Group>
              <Stack gap="sm">
                <Select
                  label="供应商"
                  data={data.suppliers.map((s) => ({ value: s.code, label: s.name }))}
                  value={supplier?.code ?? null}
                  onChange={(code) => {
                    setSupplierCode(code)
                    setUserId(null)
                  }}
                  renderOption={({ option }) => {
                    const s = data.suppliers.find((x) => x.code === option.value)
                    return (
                      <Group gap={6} wrap="nowrap">
                        <Text fz="sm">{option.label}</Text>
                        {s && s.tier !== '未分级' && (
                          <Badge size="xs" variant="light" color={s.tier === '参股核心' ? 'indigo' : 'red'}>
                            {s.tier}
                          </Badge>
                        )}
                      </Group>
                    )
                  }}
                />
                <Select
                  label="门户账号"
                  description="登录名独立于供应商编码（「34」）"
                  data={(supplier?.users ?? []).map((u) => ({ value: u.id, label: `${u.displayName}（${u.loginName}）` }))}
                  value={user?.id ?? null}
                  onChange={setUserId}
                />
                {supplier && supplier.tier !== '未分级' && (
                  <Text fz="xs" c="dimmed">
                    这家是「{supplier.tier}」。
                    {supplier.tier === '参股核心'
                      ? '参股核心厂也只看本公司的数据，在门户里没有特殊权限。'
                      : '暂停或待淘汰不接新订单，在途订单、退货和对账照常。'}
                  </Text>
                )}
              </Stack>
              <Button fullWidth mt="md" color="cyan" rightSection={<IconArrowRight size={16} />} onClick={enterPortal} disabled={!user}>
                进入供应商门户
              </Button>
              {data.proxySuppliers.length > 0 && (
                <Alert mt="md" color="cyan" variant="light" p="sm" icon={<IconUserShare size={16} />}>
                  <Text fz="xs">
                    门户未开通的供应商不能从这里进入：{data.proxySuppliers.map((s) => s.name).join('、')}。它们的接单、交期建议、齐套、发货和预约由采购员在工作台代录，并填写代录依据（《9》§2.4）。
                  </Text>
                </Alert>
              )}
            </Card>
          </SimpleGrid>
        )}

        <Group justify="space-between" align="flex-start" mt="xl" gap="md">
          <Box maw={640}>
            <Note>
              示例数据只用于演示流程，不是验收数据「38」。公司、SKU、价格和日期都是虚构的；推送、通知单、入库、建档和用途确认由页面上虚线框里的模拟按钮触发。
            </Note>
          </Box>
          <Group gap="sm">
            {data && (
              <Text fz="xs" c="dimmed">
                示例数据生成于 {fmtDateTime(data.seededAt)}
              </Text>
            )}
            <Button variant="default" size="xs" leftSection={<IconRefresh size={14} />} onClick={resetHandlers.open}>
              重置示例数据
            </Button>
          </Group>
        </Group>
      </Container>

      <ReasonModal
        opened={resetOpened}
        onClose={resetHandlers.close}
        title="重置示例数据"
        label={null}
        description="所有演示操作都会丢失，示例数据回到初始状态，日期按今天重新生成。原型配置开关不变。"
        confirmLabel="重置"
        color="red"
        onSubmit={reset}
      />
    </Box>
  )
}
