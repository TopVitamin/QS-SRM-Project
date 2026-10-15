import { notifications } from '@mantine/notifications'
import { keepPreviousData, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { REV_STORAGE_KEY } from '../domain/protocol'
import type { Meta, NavBadges, Pulse } from '../domain/views'
import { useConfig } from '../stores/config'
import { identityKey, useSession } from '../stores/session'
import { ApiError, api, errorMessage } from './client'

export const PULSE_PATH = '/pulse'

export function useIdentityKey() {
  return identityKey(useSession((s) => s.identity))
}

type ApiQueryOptions<T> = Omit<UseQueryOptions<T, ApiError, T, readonly unknown[]>, 'queryKey' | 'queryFn'>

/** 查询键带上演示身份，切换身份后不会串用别人的缓存。传null表示暂不请求。 */
export function useApi<T>(path: string | null, options: ApiQueryOptions<T> = {}) {
  const key = useIdentityKey()
  return useQuery<T, ApiError, T, readonly unknown[]>({
    queryKey: [key, path],
    queryFn: () => api<T>(path!),
    enabled: path !== null && (options.enabled ?? true),
    ...options,
  })
}

/** 只计算、不改数据的POST，例如税票预校验。body传JSON字符串，按值比较；传null暂不计算。重算期间保留上一次结果。 */
export function useCompute<T>(path: string, body: string | null) {
  const key = useIdentityKey()
  return useQuery<T, ApiError, T, readonly unknown[]>({
    queryKey: [key, path, body],
    queryFn: () => api<T>(path, { method: 'POST', body: JSON.parse(body!) as unknown }),
    enabled: body !== null,
    placeholderData: keepPreviousData,
  })
}

export function useMeta() {
  return useApi<Meta>('/meta', { staleTime: 60_000 })
}

export function useBadges() {
  return useApi<NavBadges>('/badges')
}

export function usePulseData() {
  return useApi<Pulse>(PULSE_PATH).data
}

type RunOptions = { method?: 'POST' | 'PUT'; success?: string | false }

/**
 * 写操作。成功后只让版本脉搏重新取一次；版本号一变，由PulseWatcher统一刷新其余查询，
 * 不会每个写操作都把全部查询刷两遍。失败时弹出接口返回的原因，返回undefined。
 */
export function useAction() {
  const queryClient = useQueryClient()
  const key = useIdentityKey()
  return useCallback(
    async <T = unknown>(path: string, body?: unknown, options: RunOptions = {}): Promise<T | undefined> => {
      try {
        const result = await api<T>(path, { method: options.method ?? 'POST', body: body ?? {} })
        if (options.success !== false) notifications.show({ color: 'jade', message: options.success ?? '已完成' })
        await queryClient.invalidateQueries({ queryKey: [key, PULSE_PATH] })
        return result
      } catch (error) {
        notifications.show({ color: 'red', title: '没有成功', message: errorMessage(error), autoClose: 8000 })
        return undefined
      }
    },
    [queryClient, key],
  )
}

/** 重置示例数据。版本号可能和重置前碰巧相同，所以直接刷新全部查询。成功返回true，失败返回undefined。 */
export function useDemoReset() {
  const queryClient = useQueryClient()
  return useCallback(async () => {
    try {
      await api('/demo/reset', { method: 'POST', body: {} })
      await queryClient.invalidateQueries()
      notifications.show({ color: 'jade', message: '示例数据已重置' })
      return true
    } catch (error) {
      notifications.show({ color: 'red', title: '没有成功', message: errorMessage(error) })
      return undefined
    }
  }, [queryClient])
}

/** 布局里挂一次：示例数据版本号变化（本页写入、推送结算、其他标签页写入）时刷新所有查询。 */
export function usePulseWatcher() {
  const queryClient = useQueryClient()
  const key = useIdentityKey()
  const pulse = useApi<Pulse>(PULSE_PATH, {
    refetchInterval: (query) => (query.state.data?.pushing ? 700 : 5000),
    staleTime: 0,
  })
  const rev = pulse.data?.rev
  const seen = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (rev === undefined) return
    if (seen.current !== undefined && seen.current !== rev) {
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[1] !== PULSE_PATH })
    }
    seen.current = rev
  }, [rev, queryClient])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === REV_STORAGE_KEY) void queryClient.invalidateQueries({ queryKey: [key, PULSE_PATH] })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [queryClient, key])

  return pulse.data
}

/** 原型配置会改变按钮能否点、推送结果等，切换后全部重取。首次挂载不触发。 */
export function useConfigWatcher() {
  const queryClient = useQueryClient()
  const config = useConfig((s) => s.config)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    void queryClient.invalidateQueries()
  }, [config, queryClient])
}

/** 倒计时用的当前时间。 */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}
