import { Alert, Button, Group, Modal, Select, SimpleGrid, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { IconUserShare } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import { proxyBasisTypes } from '../domain/labels'
import { RichText } from './marks'

export interface ProxyValue {
  basisType: string
  basisNote: string
}

export const emptyProxy: ProxyValue = { basisType: '电话', basisNote: '' }

/** 代录依据：门户未开通的供应商由采购代录，依据必填，日志记代录人、时间和依据（《9》§2.4）。 */
export function ProxyFields({ value, onChange, error }: { value: ProxyValue; onChange: (value: ProxyValue) => void; error?: string }) {
  return (
    <Alert color="cyan" variant="light" icon={<IconUserShare size={16} />} title="代录依据（必填）" p="sm">
      <Stack gap="xs">
        <Text fz="xs" c="dimmed">
          这家供应商没有开通门户，由采购代为操作。数量、关闭和超量校验与供应商自己操作相同，不能改价。
        </Text>
        <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="xs">
          <Select
            label="依据类型"
            data={proxyBasisTypes}
            value={value.basisType}
            onChange={(basisType) => onChange({ ...value, basisType: basisType ?? '电话' })}
          />
          <TextInput
            label="依据说明"
            placeholder="例如：供应商业务员电话告知，时间、人名"
            value={value.basisNote}
            error={error}
            onChange={(event) => onChange({ ...value, basisNote: event.currentTarget.value })}
            style={{ gridColumn: 'span 2' }}
          />
        </SimpleGrid>
      </Stack>
    </Alert>
  )
}

interface ReasonModalProps {
  opened: boolean
  onClose: () => void
  title: string
  /** 为null时不显示文本框，只做确认。 */
  label?: string | null
  placeholder?: string
  required?: boolean
  description?: ReactNode
  confirmLabel?: string
  color?: string
  proxy?: boolean
  children?: ReactNode
  onSubmit: (input: { reason: string; proxy?: ProxyValue }) => Promise<unknown>
}

/** 驳回、拒绝、取消、作废这类要写原因的动作共用。提交失败时弹窗不关，原因留着改。 */
export function ReasonModal({
  opened,
  onClose,
  title,
  label = '原因',
  placeholder,
  required = true,
  description,
  confirmLabel = '确定',
  color,
  proxy,
  children,
  onSubmit,
}: ReasonModalProps) {
  const [reason, setReason] = useState('')
  const [proxyValue, setProxyValue] = useState<ProxyValue>(emptyProxy)
  const [errors, setErrors] = useState<{ reason?: string; proxy?: string }>({})
  const [busy, setBusy] = useState(false)

  const close = () => {
    setReason('')
    setProxyValue(emptyProxy)
    setErrors({})
    onClose()
  }

  const submit = async () => {
    const next: typeof errors = {}
    if (label !== null && required && !reason.trim()) next.reason = `请填写${label}`
    if (proxy && !proxyValue.basisNote.trim()) next.proxy = '请填写代录依据说明'
    setErrors(next)
    if (next.reason || next.proxy) return
    setBusy(true)
    const result = await onSubmit({ reason: reason.trim(), proxy: proxy ? proxyValue : undefined })
    setBusy(false)
    if (result !== undefined) close()
  }

  return (
    <Modal opened={opened} onClose={close} title={title} size="lg">
      <Stack gap="sm">
        {description &&
          (typeof description === 'string' ? (
            <Text fz="sm">
              <RichText>{description}</RichText>
            </Text>
          ) : (
            description
          ))}
        {children}
        {label !== null && (
          <Textarea
            label={label}
            placeholder={placeholder}
            withAsterisk={required}
            value={reason}
            error={errors.reason}
            minRows={3}
            data-autofocus
            onChange={(event) => setReason(event.currentTarget.value)}
          />
        )}
        {proxy && <ProxyFields value={proxyValue} onChange={setProxyValue} error={errors.proxy} />}
        <Group justify="flex-end" gap="xs" mt="xs">
          <Button variant="default" onClick={close}>
            取消
          </Button>
          <Button color={color} loading={busy} onClick={submit}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
