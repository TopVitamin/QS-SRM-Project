import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

/** 生产构建也要启用：原型没有真实后端，静态托管时同样由MSW在浏览器里应答/api。 */
export function startMocks() {
  return setupWorker(...handlers).start({
    onUnhandledFrame: 'bypass',
    quiet: true,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  })
}
