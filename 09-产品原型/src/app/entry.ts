import { useLocation } from 'react-router'

export type Entry = 'buyer' | 'portal'

/** 工作台和门户共用的页面按地址判断自己在哪个入口，链接都拼在对应前缀下。 */
export function useEntry() {
  const { pathname } = useLocation()
  const entry: Entry = pathname.startsWith('/portal') ? 'portal' : 'buyer'
  return { entry, base: `/${entry}`, portal: entry === 'portal' }
}
