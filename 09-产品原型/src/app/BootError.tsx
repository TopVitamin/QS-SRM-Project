/** MSW没起来时的兜底页。此时Mantine还没挂载，只用内联样式。 */
export function BootError({ error }: { error: unknown }) {
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
