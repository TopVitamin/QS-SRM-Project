import { ActionIcon, Badge, Button, Card, Checkbox, Group, Paper, SimpleGrid, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { useForm } from '@mantine/form'
import { randomId } from '@mantine/hooks'
import { IconMapPin, IconPencil, IconPlus, IconTrash, IconUser } from '@tabler/icons-react'
import { useState } from 'react'
import { useAction } from '../api/hooks'
import { ActionButton } from '../components/ActionButton'
import { SectionTitle } from '../components/PageHeader'
import { EMPTY, fmtDateTime } from '../domain/format'
import type { Address, Contact } from '../domain/types'
import type { SupplierView } from '../domain/views'

type Keyed<T> = T & { key: string }

const keyed = <T extends { id: string }>(item: T): Keyed<T> => ({ ...item, key: item.id || randomId() })
const blankContact = (): Keyed<Contact> => ({ id: '', key: randomId(), name: '', duty: '', mobile: '', email: '', isPrimary: false })
const blankAddress = (): Keyed<Address> => ({ id: '', key: randomId(), label: '', detail: '', contact: '', phone: '' })
const strip = <T extends { key: string }>({ key: _key, ...rest }: T) => rest

function ContactView({ contact }: { contact: Contact }) {
  return (
    <Paper p="sm" radius="md" withBorder>
      <Group gap={6} wrap="nowrap">
        <IconUser size={14} color="var(--mantine-color-gray-6)" />
        <Text fz="sm" fw={600}>
          {contact.name}
        </Text>
        {contact.isPrimary && (
          <Badge size="xs" variant="light">
            主联系人
          </Badge>
        )}
      </Group>
      <Text fz="xs" c="dimmed" mt={2}>
        {contact.duty || EMPTY}
      </Text>
      <Text fz="sm" className="qs-num" mt={4}>
        {contact.mobile}
      </Text>
      <Text fz="sm" c={contact.email ? undefined : 'dimmed'} style={{ wordBreak: 'break-all' }}>
        {contact.email || EMPTY}
      </Text>
    </Paper>
  )
}

function AddressView({ address }: { address: Address }) {
  return (
    <Paper p="sm" radius="md" withBorder>
      <Group gap={6} wrap="nowrap">
        <IconMapPin size={14} color="var(--mantine-color-gray-6)" />
        <Text fz="sm" fw={600}>
          {address.label}
        </Text>
      </Group>
      <Text fz="sm" mt={4}>
        {address.detail}
      </Text>
      <Text fz="xs" c="dimmed" mt={2}>
        {address.contact || EMPTY} · <span className="qs-num">{address.phone || EMPTY}</span>
      </Text>
    </Paper>
  )
}

function CollabForm({ supplier, onDone }: { supplier: SupplierView; onDone: () => void }) {
  const run = useAction()
  const [busy, setBusy] = useState(false)
  const form = useForm({
    initialValues: { contacts: supplier.contacts.map(keyed), addresses: supplier.addresses.map(keyed) },
    validate: {
      contacts: {
        name: (value) => (value.trim() ? null : '请填写姓名'),
        mobile: (value) => (/^1\d{10}$/.test(value.trim()) ? null : '请填写11位手机号'),
        email: (value) => (!value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? null : '邮箱格式不对'),
      },
      addresses: {
        label: (value) => (value.trim() ? null : '请填写地址名称'),
        detail: (value) => (value.trim() ? null : '请填写详细地址'),
      },
    },
  })
  const { contacts, addresses } = form.getValues()

  const setPrimary = (index: number, checked: boolean) => {
    form.setFieldValue(
      'contacts',
      contacts.map((c, i) => ({ ...c, isPrimary: checked ? i === index : i === index ? false : c.isPrimary })),
    )
  }

  const submit = form.onSubmit(async (values) => {
    setBusy(true)
    const result = await run(
      `/suppliers/${supplier.code}/collab`,
      { contacts: values.contacts.map(strip), addresses: values.addresses.map(strip) },
      { method: 'PUT', success: '已保存联系人和送货地址' },
    )
    setBusy(false)
    if (result !== undefined) onDone()
  })

  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        <div>
          <Text fz="sm" fw={600} mb="xs">
            联系人
          </Text>
          <Stack gap="sm">
            {contacts.map((contact, index) => (
              <Paper key={contact.key} p="sm" radius="md" withBorder>
                <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="xs">
                  <TextInput label="姓名" withAsterisk {...form.getInputProps(`contacts.${index}.name`)} />
                  <TextInput label="职务" placeholder="例如：业务经理" {...form.getInputProps(`contacts.${index}.duty`)} />
                  <TextInput label="手机" withAsterisk inputMode="tel" {...form.getInputProps(`contacts.${index}.mobile`)} />
                  <TextInput label="邮箱" {...form.getInputProps(`contacts.${index}.email`)} />
                </SimpleGrid>
                <Group justify="space-between" mt="xs">
                  <Checkbox label="主联系人" checked={contact.isPrimary} onChange={(event) => setPrimary(index, event.currentTarget.checked)} />
                  <Tooltip label="删除这位联系人">
                    <ActionIcon variant="subtle" color="red" aria-label="删除联系人" onClick={() => form.removeListItem('contacts', index)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Paper>
            ))}
            <Button variant="light" leftSection={<IconPlus size={14} />} w="fit-content" onClick={() => form.insertListItem('contacts', blankContact())}>
              添加联系人
            </Button>
          </Stack>
        </div>
        <div>
          <Text fz="sm" fw={600} mb="xs">
            送货地址
          </Text>
          <Stack gap="sm">
            {addresses.map((address, index) => (
              <Paper key={address.key} p="sm" radius="md" withBorder>
                <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="xs">
                  <TextInput label="地址名称" withAsterisk placeholder="例如：东莞二厂" {...form.getInputProps(`addresses.${index}.label`)} />
                  <TextInput label="详细地址" withAsterisk {...form.getInputProps(`addresses.${index}.detail`)} />
                  <TextInput label="联系人" {...form.getInputProps(`addresses.${index}.contact`)} />
                  <TextInput label="电话" inputMode="tel" {...form.getInputProps(`addresses.${index}.phone`)} />
                </SimpleGrid>
                <Group justify="flex-end" mt="xs">
                  <Tooltip label="删除这个地址">
                    <ActionIcon variant="subtle" color="red" aria-label="删除地址" onClick={() => form.removeListItem('addresses', index)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Paper>
            ))}
            <Button variant="light" leftSection={<IconPlus size={14} />} w="fit-content" onClick={() => form.insertListItem('addresses', blankAddress())}>
              添加地址
            </Button>
          </Stack>
        </div>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onDone}>
            取消
          </Button>
          <Button type="submit" loading={busy}>
            保存
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

/** 联系人和送货地址：采购员和供应商本公司都能维护，改动记日志（《3》§3.6）。 */
export function CollabEditor({ supplier }: { supplier: SupplierView }) {
  const [editing, setEditing] = useState(false)
  return (
    <Card>
      <SectionTitle
        extra={
          !editing && (
            <ActionButton state={supplier.actions.collab} size="xs" variant="light" leftSection={<IconPencil size={14} />} onClick={() => setEditing(true)}>
              维护
            </ActionButton>
          )
        }
      >
        联系人和送货地址
      </SectionTitle>
      {editing ? (
        <CollabForm supplier={supplier} onDone={() => setEditing(false)} />
      ) : (
        <Stack gap="md">
          <div>
            <Text fz="xs" c="dimmed" mb={6}>
              联系人
            </Text>
            {supplier.contacts.length ? (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
                {supplier.contacts.map((c) => (
                  <ContactView key={c.id} contact={c} />
                ))}
              </SimpleGrid>
            ) : (
              <Text fz="sm" c="dimmed">
                还没有联系人
              </Text>
            )}
          </div>
          <div>
            <Text fz="xs" c="dimmed" mb={6}>
              送货地址
            </Text>
            {supplier.addresses.length ? (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
                {supplier.addresses.map((a) => (
                  <AddressView key={a.id} address={a} />
                ))}
              </SimpleGrid>
            ) : (
              <Text fz="sm" c="dimmed">
                还没有送货地址
              </Text>
            )}
          </div>
          <Text fz="xs" c="dimmed">
            最近维护：{supplier.updatedBy} · <span className="qs-num">{fmtDateTime(supplier.updatedAt)}</span>
          </Text>
        </Stack>
      )}
    </Card>
  )
}
