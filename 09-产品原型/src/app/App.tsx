import { MantineProvider } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'
import { ApiError } from '../api/client'
import { useConfigWatcher } from '../api/hooks'
import { cssVariablesResolver, theme } from '../theme/theme'
import { router } from './router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 新鲜度靠示例数据版本号驱动（见usePulseWatcher），这里只防止切页时重复请求。
      staleTime: 10_000,
      retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
})

function ConfigWatcher() {
  useConfigWatcher()
  return null
}

export function App() {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} defaultColorScheme="light">
      <DatesProvider settings={{ locale: 'zh-cn', firstDayOfWeek: 1, weekendDays: [0, 6], consistentWeeks: true }}>
        <QueryClientProvider client={queryClient}>
          <Notifications position="top-right" limit={4} />
          <ConfigWatcher />
          <RouterProvider router={router} />
        </QueryClientProvider>
      </DatesProvider>
    </MantineProvider>
  )
}
