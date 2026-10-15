import type { Db } from '../domain/types'
import { DB_VERSION, buildSeed } from './seed'

const DB_KEY = 'qs-srm-demo-db'
export const REV_KEY = 'qs-srm-demo-rev'

let cache: Db | null = null

function storedRev() {
  return Number(localStorage.getItem(REV_KEY) ?? 0)
}

function readStored(): Db | null {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (!raw) return null
    const db = JSON.parse(raw) as Db
    return db.version === DB_VERSION ? db : null
  } catch {
    return null
  }
}

/** 多个标签页共用一份示例数据：版本号变了就重新读取，避免旧标签页覆盖新数据。 */
export function currentDb(): Db {
  if (cache && cache.rev === storedRev()) return cache
  cache = readStored() ?? commit(buildSeed(Date.now()))
  return cache
}

export function commit(db: Db): Db {
  db.rev = Math.max(db.rev, storedRev()) + 1
  localStorage.setItem(DB_KEY, JSON.stringify(db))
  localStorage.setItem(REV_KEY, String(db.rev))
  cache = db
  return db
}

export function resetDb(): Db {
  return commit(buildSeed(Date.now()))
}
