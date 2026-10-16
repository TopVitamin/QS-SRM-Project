import { Button, Tooltip, type ButtonProps } from '@mantine/core'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { ActionState } from '../domain/views'

interface ActionButtonProps extends ButtonProps {
  /** 接口给出的动作状态。hidden时不渲染；不可点时置灰，悬停看原因。 */
  state?: ActionState
  onClick?: () => unknown
  children: ReactNode
}

export function ActionButton({ state, onClick, children, ...props }: ActionButtonProps) {
  const [busy, setBusy] = useState(false)
  if (state?.hidden) return null
  const denied = !!state && !state.ok
  const button = (
    <Button
      {...props}
      loading={busy}
      data-disabled={denied || undefined}
      aria-disabled={denied || undefined}
      onClick={async (event) => {
        event.stopPropagation()
        if (denied || !onClick) return
        setBusy(true)
        try {
          await onClick()
        } finally {
          setBusy(false)
        }
      }}
    >
      {children}
    </Button>
  )
  if (!denied) return button
  // 手机上没有悬停，点一下置灰的按钮也要能看到原因
  return (
    <Tooltip label={state?.reason ?? '当前不能操作'} position="top" multiline maw={300} events={{ hover: true, focus: true, touch: true }}>
      {button}
    </Tooltip>
  )
}

/** 跳转到另一个页面的动作（编辑、发起变更、去发货）：可点时是链接，不可点时和ActionButton一样置灰并说明原因。 */
export function LinkAction({ state, to, children, ...props }: ButtonProps & { state?: ActionState; to: string; children: ReactNode }) {
  if (state?.hidden) return null
  if (state && !state.ok) return <ActionButton state={state} {...props}>{children}</ActionButton>
  return (
    <Button component={Link} to={to} {...props}>
      {children}
    </Button>
  )
}
