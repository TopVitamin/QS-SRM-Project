import { notifications } from '@mantine/notifications'
import { CONFIG_HEADER, IDENTITY_HEADER } from '../domain/protocol'
import { useConfig } from '../stores/config'
import { useSession } from '../stores/session'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type Method = 'GET' | 'POST' | 'PUT'

const encode = (value: unknown) => encodeURIComponent(JSON.stringify(value))

/**
 * 所有页面只通过这里访问示例数据。路径固定以`/api`开头：MSW按站点根路径匹配，
 * 页面放在子路径下静态托管时也一样。
 */
export async function api<T>(path: string, options: { method?: Method; body?: unknown } = {}): Promise<T> {
  const identity = useSession.getState().identity
  const headers: Record<string, string> = { [CONFIG_HEADER]: encode(useConfig.getState().config) }
  if (identity) headers[IDENTITY_HEADER] = encode({ party: identity.party, userId: identity.userId })
  const method = options.method ?? 'GET'
  if (method !== 'GET') headers['content-type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
    })
  } catch {
    throw new ApiError('模拟接口没有响应，请刷新页面后重试', 0)
  }

  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError('模拟接口没有接管这次请求（Service Worker未就绪），请刷新页面', 503)
  }
  const data = (await response.json()) as unknown
  if (!response.ok) {
    const message = (data as { message?: string } | null)?.message ?? `请求失败（${response.status}）`
    if (response.status === 401 && identity) {
      useSession.getState().setIdentity(null)
      notifications.show({ id: 'identity-expired', color: 'orange', title: '需要重新选择演示身份', message })
    }
    throw new ApiError(message, response.status)
  }
  return data as T
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}
