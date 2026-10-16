import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/** 筛选和页签放在地址里，待办卡片的链接能直接带着条件打开列表。 */
export function useUrlValue(name: string, fallback = ''): [string, (value: string) => void] {
  const [params, setParams] = useSearchParams()
  const value = params.get(name) ?? fallback
  const set = useCallback(
    (next: string) =>
      setParams(
        (prev) => {
          const copy = new URLSearchParams(prev)
          if (next && next !== fallback) copy.set(name, next)
          else copy.delete(name)
          return copy
        },
        { replace: true },
      ),
    [name, fallback, setParams],
  )
  return [value, set]
}

export function useUrlList(name: string): [string[], (value: string[]) => void] {
  const [raw, setRaw] = useUrlValue(name)
  const list = raw ? raw.split(',').filter(Boolean) : []
  const set = useCallback((next: string[]) => setRaw(next.join(',')), [setRaw])
  return [list, set]
}

export function matchText(query: string, ...fields: (string | undefined)[]) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return fields.some((field) => field?.toLowerCase().includes(q))
}
