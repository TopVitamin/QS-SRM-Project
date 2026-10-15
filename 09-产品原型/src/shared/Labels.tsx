import { Alert, Box, Group, SimpleGrid, Stack, Text } from '@mantine/core'
import { IconPrinter } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { useParams } from 'react-router'
import { useAction, useApi } from '../api/hooks'
import { useEntry } from '../app/entry'
import { ActionButton } from '../components/ActionButton'
import { Note, PendingTag } from '../components/marks'
import { PageHeader } from '../components/PageHeader'
import { QueryState } from '../components/QueryState'
import { fmtQty } from '../domain/format'
import type { BoxView, ShipmentDetail } from '../domain/views'

function LabelRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group gap={6} wrap="nowrap" align="baseline">
      <Text fz={11} c="dimmed" w={64} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Text fz="sm" style={{ minWidth: 0, wordBreak: 'break-all' }}>
        {children}
      </Text>
    </Group>
  )
}

function BoxLabel({ box, shipment }: { box: BoxView; shipment: ShipmentDetail }) {
  return (
    <Box className="qs-label" p="sm">
      <Group justify="space-between" align="flex-start" mb={6} wrap="nowrap">
        <div>
          <Text fz={11} c="dimmed">
            箱码
          </Text>
          <Text fz={20} fw={700} className="qs-mono" lh={1.2}>
            {box.code}
          </Text>
        </div>
        <Text fz="lg" fw={700} className="qs-num">
          {box.seq}/{box.total}
        </Text>
      </Group>
      <Box className="qs-barcode-slot" h={44} mb={8} style={{ display: 'grid', placeItems: 'center' }}>
        <Text fz={11} c="dimmed">
          条码区占位，码制待定
        </Text>
      </Box>
      <Stack gap={2}>
        <LabelRow label="SKU">
          <span className="qs-mono">{box.skuCode}</span> {box.skuName}
        </LabelRow>
        <LabelRow label="本箱数量">
          <b className="qs-num">{fmtQty(box.qty)}</b> {box.unit}
        </LabelRow>
        <LabelRow label="供应商批号">
          <span className="qs-mono">{box.batchNo}</span>
        </LabelRow>
        <LabelRow label="采购订单">
          <span className="qs-mono">{box.orderNo}</span>
        </LabelRow>
        <LabelRow label="发货单">
          <span className="qs-mono">{shipment.no}</span>
        </LabelRow>
        <LabelRow label="收货仓">{shipment.warehouseName}</LabelRow>
        <LabelRow label="供应商">{shipment.supplierName}</LabelRow>
      </Stack>
      <Text fz={10} c="dimmed" mt={6} className="qs-no-print">
        已打印{box.printCount}次{box.replaces ? ` · 替换${box.replaces}` : ''}
      </Text>
    </Box>
  )
}

/** P07 箱码打印：只打有效箱码。条码图形和标签版式未定，条码区只占位（「23」）。 */
export function LabelsPage() {
  const { id = '' } = useParams()
  const { base } = useEntry()
  const run = useAction()
  const query = useApi<ShipmentDetail>(`/shipments/${id}`)
  return (
    <QueryState query={query}>
      {(shipment) => {
        const boxes = shipment.boxes.filter((b) => b.status === 'valid')
        const print = async () => {
          const result = await run(`/shipments/${shipment.id}/print`, {}, { success: `已记录打印${boxes.length}箱` })
          if (result !== undefined) window.print()
        }
        return (
          <>
            <PageHeader
              back={{ to: `${base}/shipments/${shipment.id}`, label: '发货单详情' }}
              title={`箱码打印 · ${shipment.no}`}
              subtitle={`${boxes.length}张有效箱码。${shipment.status === 'draft' ? '提交前可以重新装箱、重打。' : '提交后单张补打在发货单详情里操作，打印次数留痕。'}`}
              actions={
                <ActionButton state={shipment.actions.print} leftSection={<IconPrinter size={16} />} onClick={print} disabled={!boxes.length}>
                  打印全部
                </ActionButton>
              }
            />
            <Alert color="gray" variant="light" mb="md" p="sm" className="qs-no-print">
              <Stack gap={4}>
                <Note>箱码是内部流水的演示格式；码制、标签尺寸和版式见「23」。标签上的条码区只占位，不画条码。</Note>
                {shipment.warehouseName.includes('电商仓') && (
                  <Text fz="xs" c="dimmed">
                    {shipment.warehouseName}的箱唛另有平台规则，这里的版式不能直接用 <PendingTag n={22} />
                  </Text>
                )}
              </Stack>
            </Alert>
            {boxes.length ? (
              <SimpleGrid className="qs-print-area" cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                {boxes.map((box) => (
                  <BoxLabel key={box.code} box={box} shipment={shipment} />
                ))}
              </SimpleGrid>
            ) : (
              <Text c="dimmed">没有有效箱码</Text>
            )}
          </>
        )
      }}
    </QueryState>
  )
}
