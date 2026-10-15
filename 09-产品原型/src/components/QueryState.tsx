import { Alert, Button, Center, EmptyState, Loader, Stack, Text } from '@mantine/core'
import { IconFileUnknown, IconLock } from '@tabler/icons-react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import type { ApiError } from '../api/client'

export function LoadingBlock({ label = '加载中' }: { label?: string }) {
  return (
    <Center py={60}>
      <Stack align="center" gap="xs">
        <Loader size="sm" />
        <Text fz="xs" c="dimmed">
          {label}
        </Text>
      </Stack>
    </Center>
  )
}

/** C02 无权查看：越权时就地显示，不跳转。 */
export function Forbidden({ message }: { message?: string }) {
  const navigate = useNavigate()
  return (
    <EmptyState
      py={60}
      icon={<IconLock size={28} />}
      color="red"
      title="无权查看"
      description={
        <>
          {message ?? '这条数据不属于当前身份。'}
          <br />
          供应商身份只看本公司的订单、发货、对账和税票，参股核心厂也一样（《4》§四）。
        </>
      }
    >
      <EmptyState.Actions>
        <Button variant="default" onClick={() => navigate(-1)}>
          返回上一页
        </Button>
        <Button component={Link} to="/">
          回到入口
        </Button>
      </EmptyState.Actions>
    </EmptyState>
  )
}

/** C03 页面不存在。 */
export function NotFound({ message }: { message?: string }) {
  return (
    <EmptyState py={60} icon={<IconFileUnknown size={28} />} title="页面不存在" description={message ?? '地址可能写错了，或者这条示例数据已经被重置。'}>
      <EmptyState.Actions>
        <Button component={Link} to="/">
          回到入口
        </Button>
      </EmptyState.Actions>
    </EmptyState>
  )
}

export function ErrorBlock({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  if (error.status === 403) return <Forbidden message={error.message} />
  if (error.status === 404) return <NotFound message={error.message} />
  return (
    <Alert color="red" title="加载失败" my="md">
      <Stack gap="xs" align="flex-start">
        <Text fz="sm">{error.message}</Text>
        {onRetry && (
          <Button size="xs" variant="light" color="red" onClick={onRetry}>
            重试
          </Button>
        )}
      </Stack>
    </Alert>
  )
}

/** 统一处理加载、无权查看和不存在，页面只写拿到数据之后的样子。 */
export function QueryState<T>({ query, children }: { query: UseQueryResult<T, ApiError>; children: (data: T) => ReactNode }) {
  if (query.isPending) return <LoadingBlock />
  if (query.isError) return <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
  return <>{children(query.data)}</>
}
