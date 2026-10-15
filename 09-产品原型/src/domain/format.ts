import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import 'dayjs/locale/zh-cn'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale('zh-cn')

export const TZ = 'Asia/Shanghai'
export const EMPTY = '-'
export const HOUR = 3600_000
export const DAY = 24 * HOUR

export function bj(value?: number | string) {
  return dayjs(value).tz(TZ)
}

export function parseBjDate(date: string) {
  return dayjs.tz(date, TZ)
}

export function bjAt(date: string, time = '00:00') {
  return dayjs.tz(`${date} ${time}`, TZ).valueOf()
}

export function fmtDateTime(value?: number) {
  return value ? bj(value).format('YYYY-MM-DD HH:mm') : EMPTY
}

export function fmtDate(value?: string | number) {
  if (value === undefined || value === null || value === '') return EMPTY
  return typeof value === 'number' ? bj(value).format('YYYY-MM-DD') : value
}

export function todayStr(now = Date.now()) {
  return bj(now).format('YYYY-MM-DD')
}

export function addDays(date: string, days: number) {
  return parseBjDate(date).add(days, 'day').format('YYYY-MM-DD')
}

export function dateOffset(days: number, now = Date.now()) {
  return addDays(todayStr(now), days)
}

export function daysBetween(from: string, to: string) {
  return parseBjDate(to).diff(parseBjDate(from), 'day')
}

export function stamp(now = Date.now()) {
  return bj(now).format('YYYYMMDD')
}

export function periodOf(date: string) {
  return date.slice(0, 7)
}

export function fmtQty(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return EMPTY
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

export function fmtMoney(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return EMPTY
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtPrice(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return EMPTY
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

export function fmtRate(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return EMPTY
  return `${value}%`
}

export function fmtPercent(value: number | null, digits = 1) {
  if (value === null || Number.isNaN(value)) return EMPTY
  return `${(value * 100).toFixed(digits)}%`
}

export function codeName(code?: string, name?: string) {
  if (!code && !name) return EMPTY
  if (!code) return name ?? EMPTY
  if (!name) return code
  return `${code} ${name}`
}

export function remaining(deadline: number, now = Date.now()) {
  const diff = deadline - now
  const overdue = diff < 0
  const abs = Math.abs(diff)
  const hours = Math.floor(abs / HOUR)
  const minutes = Math.floor((abs % HOUR) / 60_000)
  const text = hours > 0 ? `${hours}小时${minutes}分` : `${minutes}分`
  return { overdue, hours, minutes, text }
}
