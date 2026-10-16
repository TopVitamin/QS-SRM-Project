import '@mantine/core/styles.layer.css'
import '@mantine/dates/styles.layer.css'
import '@mantine/notifications/styles.layer.css'
import '@mantine/charts/styles.layer.css'
import 'mantine-datatable/styles.layer.css'
import './theme/global.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { BootError } from './app/BootError'
import { startMocks } from './mocks/browser'

const root = createRoot(document.getElementById('root')!)

// 先启动MSW再渲染，避免首屏请求落到不存在的后端。
startMocks()
  .then(() =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
  .catch((error: unknown) => root.render(<BootError error={error} />))
