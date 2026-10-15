import { Avatar, Badge, Box, Button, Group, Loader, Menu, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconAdjustments, IconArrowsExchange, IconChevronDown, IconDoor, IconPlugConnectedX } from '@tabler/icons-react'
import { Link, useNavigate } from 'react-router'
import { enterpriseUsers } from '../domain/identities'
import { roleLabels } from '../domain/labels'
import { useConfig } from '../stores/config'
import { useSession, type Identity } from '../stores/session'
import { Forbidden } from '../components/QueryState'
import { SampleBadge } from '../components/marks'

export function Brand({ subtitle, to }: { subtitle: string; to: string }) {
  return (
    <UnstyledButton component={Link} to={to} aria-label="回到首页">
      <Group gap={10} wrap="nowrap">
        <div className="qs-brand-mark">QS</div>
        <Stack gap={0}>
          <Text fz={14} fw={700} lh={1.2} c="#14212e">
            强盛SRM
          </Text>
          <Text fz={11} c="dimmed" lh={1.2} style={{ whiteSpace: 'nowrap' }}>
            {subtitle}
          </Text>
        </Stack>
      </Group>
    </UnstyledButton>
  )
}

/** 页头常驻的示例数据提示（10.4）。 */
export function SampleStrip() {
  return (
    <Box className="qs-sample-strip" px="md" h={26} style={{ display: 'flex', alignItems: 'center' }}>
      <Text fz={11.5} fw={600} truncate="end">
        示例数据：公司、SKU、价格、数量和日期都是演示虚构，不代表强盛的事实；ERP、WMS、税务平台的回传由「模拟回传」按钮触发。
      </Text>
    </Box>
  )
}

export function SystemIndicators({ pushing }: { pushing?: number }) {
  const erpAvailable = useConfig((s) => s.config.erpAvailable)
  return (
    <Group gap={6} wrap="nowrap">
      {!!pushing && (
        <Badge color="blue" variant="light" leftSection={<Loader size={10} color="blue" />} style={{ textTransform: 'none' }}>
          ERP推送中 {pushing}
        </Badge>
      )}
      {!erpAvailable && (
        <Tooltip label="原型配置把模拟ERP接口设为不可用，推送都会失败">
          <Badge color="red" variant="light" leftSection={<IconPlugConnectedX size={12} />}>
            ERP不可用（模拟）
          </Badge>
        </Tooltip>
      )}
      <SampleBadge visibleFrom="sm" />
    </Group>
  )
}

export function IdentityMenu({ identity, enterprise }: { identity: Identity; enterprise: boolean }) {
  const setIdentity = useSession((s) => s.setIdentity)
  const navigate = useNavigate()
  const initial = identity.userName.slice(0, 1)
  return (
    <Menu position="bottom-end" width={260}>
      <Menu.Target>
        <UnstyledButton aria-label="当前演示身份">
          <Group gap={8} wrap="nowrap">
            <Avatar size={30} radius="xl" color="jade" variant="light">
              {initial}
            </Avatar>
            <Stack gap={0} visibleFrom="sm" maw={180}>
              <Text fz={12.5} fw={650} lh={1.25} truncate="end">
                {identity.userName}
              </Text>
              <Text fz={11} c="dimmed" lh={1.25} truncate="end">
                {enterprise ? roleLabels[identity.role] : identity.supplierName}
              </Text>
            </Stack>
            <IconChevronDown size={14} color="var(--mantine-color-dimmed)" />
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>演示身份（不是真实登录）</Menu.Label>
        {enterprise && (
          <>
            {enterpriseUsers.map((user) => (
              <Menu.Item
                key={user.id}
                leftSection={<IconArrowsExchange size={14} />}
                rightSection={user.id === identity.userId ? <Badge size="xs">当前</Badge> : undefined}
                onClick={() => setIdentity({ party: 'enterprise', role: user.role, userId: user.id, userName: user.name })}
              >
                <Text fz="sm">{user.name}</Text>
              </Menu.Item>
            ))}
            <Menu.Divider />
            <Menu.Item leftSection={<IconAdjustments size={14} />} component={Link} to="/buyer/prototype-settings">
              原型配置
            </Menu.Item>
          </>
        )}
        <Menu.Item leftSection={<IconDoor size={14} />} onClick={() => navigate('/')}>
          回到入口，换一个身份
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}

/** 用供应商身份打开工作台，或反过来：就地显示无权查看。 */
export function WrongEntry({ entry }: { entry: 'buyer' | 'portal' }) {
  return (
    <Box maw={640} mx="auto" pt={80} px="md">
      <Forbidden
        message={entry === 'buyer' ? '当前演示身份是供应商用户，不能进入采购工作台。' : '当前演示身份是企业侧用户，供应商门户只给供应商使用。'}
      />
      <Group justify="center" mt="md">
        <Button variant="subtle" component={Link} to="/">
          去入口切换身份
        </Button>
      </Group>
    </Box>
  )
}
