import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Party, Role } from '../domain/types'

export interface Identity {
  party: Party
  role: Role
  userId: string
  userName: string
  supplierCode?: string
  supplierName?: string
}

interface SessionState {
  identity: Identity | null
  setIdentity: (identity: Identity | null) => void
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      identity: null,
      setIdentity: (identity) => set({ identity }),
    }),
    { name: 'qs-srm-demo-session' },
  ),
)

export function identityKey(identity: Identity | null) {
  if (!identity) return 'anonymous'
  return [identity.role, identity.userId, identity.supplierCode ?? ''].join(':')
}
