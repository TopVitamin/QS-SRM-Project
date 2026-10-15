import indexMarkdown from '../../../01-全局背景信息/11.待对齐事项.md?raw'

export interface PendingEntry {
  n: number
  fact: string
  where: string
}

function parseIndex(markdown: string) {
  const entries = new Map<number, PendingEntry>()
  const pattern = /^\|\s*【待确认-(\d+)】\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/
  for (const line of markdown.split('\n')) {
    const match = line.match(pattern)
    if (!match) continue
    const n = Number(match[1])
    entries.set(n, { n, fact: match[2], where: match[3] })
  }
  return entries
}

export const pendingIndex = parseIndex(indexMarkdown)

export function getPending(n: number) {
  return pendingIndex.get(n)
}

export const pendingSource = '01-全局背景信息/11.待对齐事项.md'
