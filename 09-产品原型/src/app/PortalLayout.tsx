import { AppShell, Badge, Box, Burger, Container, Drawer, Group, Indicator, NavLink, Stack, Text, UnstyledButton } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconCalendarTime,
  IconDots,
  IconDoor,
  IconFileInvoice,
  IconHome,
  IconListDetails,
  IconPackageImport,
  IconReceiptRefund,
  IconReportMoney,
  IconTruckDelivery,
  IconUserCircle,
  type Icon,
} from '@tabler/icons-react'
import { useEffect } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { useBadges, usePulseWatcher } from '../api/hooks'
import { useSession, type Identity } from '../stores/session'
import { Brand, IdentityMenu, SampleStrip, SystemIndicators, WrongEntry } from './shell'

interface PortalNavItem {
  to: string
  label: string
  short: string
  icon: Icon
  badge?: string
}

const items: PortalNavItem[] = [
  { to: '/portal', label: '首页', short: '首页', icon: IconHome },
  { to: '/portal/orders', label: '采购订单', short: '订单', icon: IconListDetails, badge: 'orders' },
  { to: '/portal/shipments', label: '发货单', short: '发货', icon: IconTruckDelivery },
  { to: '/portal/appointments', label: '预约送货', short: '预约', icon: IconCalendarTime, badge: 'appointments' },
  { to: '/portal/receipts', label: '收货与退货', short: '收货', icon: IconPackageImport, badge: 'receipts' },
  { to: '/portal/reconciliations', label: '对账', short: '对账', icon: IconReportMoney, badge: 'reconciliations' },
  { to: '/portal/invoicing', label: '开票', short: '开票', icon: IconFileInvoice, badge: 'invoicing' },
  { to: '/portal/red-letters', label: '红字确认', short: '红字', icon: IconReceiptRefund, badge: 'redLetters' },
  { to: '/portal/account', label: '账户', short: '账户', icon: IconUserCircle },
]

const tabPaths = ['/portal', '/portal/orders', '/portal/shipments', '/portal/reconciliations']
const tabs = items.filter((item) => tabPaths.includes(item.to))
const moreItems = items.filter((item) => !tabPaths.includes(item.to))

function isActive(pathname: string, to: string) {
  return to === '/portal' ? pathname === '/portal' || pathname === '/portal/' : pathname === to || pathname.startsWith(`${to}/`)
}

export function PortalLayout() {
  const identity = useSession((s) => s.identity)
  if (!identity) return <Navigate to="/" replace />
  if (identity.party !== 'supplier') return <WrongEntry entry="portal" />
  return <PortalShell identity={identity} />
}

function PortalShell({ identity }: { identity: Identity }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const pulse = usePulseWatcher()
  const badges = useBadges().data ?? {}
  const [menu, { toggle: toggleMenu, close: closeMenu }] = useDisclosure(false)
  const [more, { open: openMore, close: closeMore }] = useDisclosure(false)
  const count = (item: PortalNavItem) => (item.badge ? (badges[item.badge] ?? 0) : 0)
  const moreCount = moreItems.reduce((total, item) => total + count(item), 0)

  useEffect(() => {
    closeMenu()
    closeMore()
    window.scrollTo({ top: 0 })
  }, [pathname, closeMenu, closeMore])

  // 弹窗渲染在body下，44px的可点区域规则要覆盖到弹窗里
  useEffect(() => {
    document.body.dataset.portal = ''
    return () => {
      delete document.body.dataset.portal
    }
  }, [])

  const navList = (list: PortalNavItem[]) =>
    list.map((item) => (
      <NavLink
        key={item.to}
        component={Link}
        to={item.to}
        label={item.label}
        active={isActive(pathname, item.to)}
        leftSection={<item.icon size={18} stroke={1.7} />}
        rightSection={count(item) > 0 ? <Badge size="sm">{count(item)}</Badge> : undefined}
        py={10}
      />
    ))

  return (
    <AppShell header={{ height: 78 }} padding="md">
      <AppShell.Header>
        <Group h={52} px="md" justify="space-between" wrap="nowrap" gap="sm">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={menu} onClick={toggleMenu} visibleFrom="sm" hiddenFrom="lg" size="sm" aria-label="展开导航" />
            <Brand subtitle="供应商门户" to="/portal" />
          </Group>
          <Group gap={2} visibleFrom="lg" wrap="nowrap" component="nav" aria-label="门户导航">
            {items.map((item) => (
              <UnstyledButton key={item.to} component={Link} to={item.to} className="qs-portal-nav" data-active={isActive(pathname, item.to) || undefined}>
                <Indicator disabled={count(item) === 0} label={count(item)} size={15} offset={-3} color="orange">
                  {item.label}
                </Indicator>
              </UnstyledButton>
            ))}
          </Group>
          <Group gap="sm" wrap="nowrap">
            <SystemIndicators pushing={pulse?.pushing} />
            <IdentityMenu identity={identity} enterprise={false} />
          </Group>
        </Group>
        <SampleStrip />
      </AppShell.Header>

      <AppShell.Main>
        <Container size={1200} px={0} pb={{ base: 96, sm: 'xl' }}>
          <Outlet />
        </Container>
      </AppShell.Main>

      <Box className="qs-bottom-tabs" hiddenFrom="sm" component="nav" aria-label="门户底部导航">
        <Group gap={0} wrap="nowrap">
          {tabs.map((item) => (
            <UnstyledButton key={item.to} component={Link} to={item.to} className="qs-bottom-tab" data-active={isActive(pathname, item.to) || undefined}>
              <Indicator disabled={count(item) === 0} label={count(item)} size={15} offset={2} color="orange">
                <item.icon size={22} stroke={1.7} />
              </Indicator>
              {item.short}
            </UnstyledButton>
          ))}
          <UnstyledButton
            className="qs-bottom-tab"
            data-active={moreItems.some((item) => isActive(pathname, item.to)) || undefined}
            onClick={openMore}
          >
            <Indicator disabled={moreCount === 0} label={moreCount} size={15} offset={2} color="orange">
              <IconDots size={22} stroke={1.7} />
            </Indicator>
            更多
          </UnstyledButton>
        </Group>
      </Box>

      <Drawer opened={menu} onClose={closeMenu} title="供应商门户" size={300} padding="sm">
        <Stack gap={2}>{navList(items)}</Stack>
      </Drawer>

      <Drawer opened={more} onClose={closeMore} title="更多" position="bottom" size="auto" padding="sm" radius="lg">
        <Stack gap={2} pb="sm">
          {navList(moreItems)}
          <NavLink
            label="切换身份"
            description="回到入口，换一家供应商或企业侧身份"
            leftSection={<IconDoor size={18} stroke={1.7} />}
            onClick={() => navigate('/')}
            py={10}
          />
          <Text fz={11} c="dimmed" px="sm" pt="xs">
            当前：{identity.supplierName} · {identity.userName}
          </Text>
        </Stack>
      </Drawer>
    </AppShell>
  )
}
