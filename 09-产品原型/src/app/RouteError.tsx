import { Alert, Box, Button, Center, Code, Group, Loader, Stack, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Link, isRouteErrorResponse, useRouteError } from 'react-router'
import { NotFound } from '../components/QueryState'

/** 页面渲染出错时就地显示，不白屏。 */
export function RouteError() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />
  const message = error instanceof Error ? error.message : isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : String(error)
  const chunk = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(message)
  return (
    <Box maw={720} mx="auto" py="xl" px="md">
      <Alert color="red" icon={<IconAlertTriangle size={18} />} title={chunk ? '页面文件没有加载成功' : '页面出错了'}>
        <Stack gap="sm">
          <Text fz="sm">
            {chunk ? '可能刚重新构建过原型，浏览器还拿着旧文件。刷新一次即可。' : '这是原型本身的问题，不是业务规则的拦截。刷新后仍出现，可以先重置示例数据。'}
          </Text>
          <Code block>{message}</Code>
          <Group gap="xs">
            <Button size="xs" color="red" onClick={() => window.location.reload()}>
              刷新
            </Button>
            <Button size="xs" variant="default" component={Link} to="/">
              回到入口
            </Button>
          </Group>
        </Stack>
      </Alert>
    </Box>
  )
}

export function StandaloneNotFound() {
  return (
    <Box maw={640} mx="auto" pt={80} px="md">
      <NotFound />
    </Box>
  )
}

export function BootLoading() {
  return (
    <Center h="100vh">
      <Loader size="sm" />
    </Center>
  )
}
