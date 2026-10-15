import '@mantine/core/styles.layer.css'
import '@mantine/dates/styles.layer.css'
import '@mantine/notifications/styles.layer.css'
import '@mantine/charts/styles.layer.css'
import 'mantine-datatable/styles.layer.css'
import './theme/global.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { startMocks } from './mocks/browser'

const root = createRoot(document.getElementById('root')!)

function BootError({ error }: { error: unknown }) {
  return (
    <div style={{ maxWidth: 560, margin: '80px auto', padding: 24, fontFamily: 'system-ui, sans-serif', lineHeight: 1.7 }}>
      <h2 style={{ fontSize: 18 }}>模拟接口没有启动</h2>
      <p>
        原型没有真实后端，示例数据由浏览器里的Service Worker（MSW）提供。请用 <code>npm run dev</code> 或{' '}
        <code>npm run preview</code> 打开，或者部署到 https 站点；直接双击打开 index.html 不行。
      </p>
      <pre style={{ whiteSpace: 'pre-wrap', color: '#b42318', fontSize: 12 }}>{String((error as Error)?.message ?? error)}</pre>
    </div>
  )
}

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
