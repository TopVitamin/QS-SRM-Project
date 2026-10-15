import { AppShell, Badge, Box, Burger, Group, NavLink, ScrollArea, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconAdjustments,
  IconAlertTriangle,
  IconBuildingStore,
  IconCalendarTime,
  IconChartBar,
  IconChecklist,
  IconCloudUpload,
  IconFileInvoice,
  IconGitPullRequest,
  IconHistory,
  IconLayoutDashboard,
  IconListDetails,
  IconMessage2Question,
  IconPackageImport,
  IconReceipt,
  IconReceiptRefund,
  IconReportMoney,
  IconRoute,
  IconTruckDelivery,
  IconUserPlus,
  type Icon,
} from '@tabler/icons-react'
import { useEffect } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { useBadges, usePulseWatcher } from '../api/hooks'
import { roleLabels } from '../domain/labels'
import { useSession, type Identity } from '../stores/session'
import { Brand, IdentityMenu, SampleStrip, SystemIndicators, WrongEntry } from './shell'

interface NavItem {
  to: string
  label: string
  icon: Icon
  badge?: string
  /** 红色角标：失败、差异这类要尽快处理的。 */
  urgent?: boolean
}

const navGroups: { label: string; items: NavItem[] }[] = [
  { label: '工作台', items: [{ to: '/buyer', label: '我的待办', icon: IconLayoutDashboard }] },
  {
    label: '采购订单',
    items: [
      { to: '/buyer/orders', label: '采购订单', icon: IconListDetails },
      { to: '/buyer/approvals', label: '审核中心', icon: IconChecklist, badge: 'approvals' },
      { to: '/buyer/changes', label: '订单变更', icon: IconGitPullRequest },
      { to: '/buyer/suggestions', label: '交期建议', icon: IconMessage2Question, badge: 'suggestions' },
      { to: '/buyer/erp-sync', label: 'ERP推送监控', icon: IconCloudUpload, badge: 'erpSync', urgent: true },
    ],
  },
  {
    label: '交付协同',
    items: [
      { to: '/buyer/shipments', label: '发货单', icon: IconTruckDelivery },
      { to: '/buyer/appointments', label: '预约看板', icon: IconCalendarTime, badge: 'appointments' },
      { to: '/buyer/receipts', label: '收货结果', icon: IconPackageImport },
      { to: '/buyer/alerts', label: '交付预警', icon: IconAlertTriangle, badge: 'alerts' },
      { to: '/buyer/trace', label: '箱码追溯', icon: IconRoute },
    ],
  },
  {
    label: '对账与发票',
    items: [
      { to: '/buyer/reconciliations', label: '对账单', icon: IconReportMoney, badge: 'reconciliations', urgent: true },
      { to: '/buyer/invoice-requests', label: '开票申请', icon: IconFileInvoice },
      { to: '/buyer/invoices', label: '税票登记', icon: IconReceipt },
      { to: '/buyer/red-letters', label: '红字确认', icon: IconReceiptRefund, badge: 'redLetters' },
    ],
  },
  {
    label: '供应商',
    items: [
      { to: '/buyer/suppliers', label: '供应商档案', icon: IconBuildingStore },
      { to: '/buyer/admissions', label: '供应商准入', icon: IconUserPlus, badge: 'admissions' },
      { to: '/buyer/performance', label: '绩效看板', icon: IconChartBar },
    ],
  },
  {
    label: '系统',
    items: [
      { to: '/buyer/audit-logs', label: '操作日志', icon: IconHistory },
      { to: '/buyer/prototype-settings', label: '原型配置', icon: IconAdjustments },
    ],
  },
]

function isActive(pathname: string, to: string) {
  return to === '/buyer' ? pathname === '/buyer' || pathname === '/buyer/' : pathname === to || pathname.startsWith(`${to}/`)
}

export function BuyerLayout() {
  const identity = useSession((s) => s.identity)
  if (!identity) return <Navigate to="/" replace />
  if (identity.party !== 'enterprise') return <WrongEntry entry="buyer" />
  return <BuyerShell identity={identity} />
}

function BuyerShell({ identity }: { identity: Identity }) {
  const [opened, { toggle, close }] = useDisclosure(false)
  const { pathname } = useLocation()
  const pulse = usePulseWatcher()
  const badges = useBadges().data ?? {}

  useEffect(() => {
    close()
    window.scrollTo({ top: 0 })
  }, [pathname, close])

  return (
    <AppShell header={{ height: 78 }} navbar={{ width: 232, breakpoint: 'md', collapsed: { mobile: !opened } }} padding="lg">
      <AppShell.Header>
        <Group h={52} px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="md" size="sm" aria-label="展开导航" />
            <Brand subtitle="采购工作台" to="/buyer" />
          </Group>
          <Group gap="md" wrap="nowrap">
            <SystemIndicators pushing={pulse?.pushing} />
            <IdentityMenu identity={identity} enterprise />
          </Group>
        </Group>
        <SampleStrip />
      </AppShell.Header>

      <AppShell.Navbar>
        <AppShell.Section grow component={ScrollArea} px="xs" pb="md">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="qs-nav-group">{group.label}</div>
              {group.items.map((item) => {
                const count = item.badge ? (badges[item.badge] ?? 0) : 0
                return (
                  <NavLink
                    key={item.to}
                    component={Link}
                    to={item.to}
                    label={item.label}
                    active={isActive(pathname, item.to)}
                    leftSection={<item.icon size={17} stroke={1.7} />}
                    rightSection={
                      count > 0 ? (
                        <Badge size="xs" variant={item.urgent ? 'filled' : 'light'} color={item.urgent ? 'red' : 'jade'} circle={count < 10}>
                          {count}
                        </Badge>
                      ) : undefined
                    }
                    py={7}
                  />
                )
              })}
            </div>
          ))}
        </AppShell.Section>
        <AppShell.Section px="md" py="sm" style={{ borderTop: '1px solid var(--qs-border)' }}>
          <Text fz={11} c="dimmed" lh={1.5}>
            当前角色：{roleLabels[identity.role]}。企业侧菜单相同，能点哪些按钮按权限矩阵控制。
          </Text>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Box maw={1480} mx="auto">
          <Outlet />
        </Box>
      </AppShell.Main>
    </AppShell>
  )
}
