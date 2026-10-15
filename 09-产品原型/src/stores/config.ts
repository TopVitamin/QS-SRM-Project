import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { defaultConfig } from '../domain/defaults'
import type { PrototypeConfig } from '../domain/types'

export { defaultConfig }

interface ConfigState {
  config: PrototypeConfig
  setConfig: (patch: Partial<PrototypeConfig>) => void
  resetConfig: () => void
}

export const useConfig = create<ConfigState>()(
  persist(
    (set) => ({
      config: defaultConfig,
      setConfig: (patch) => set((state) => ({ config: { ...state.config, ...patch } })),
      resetConfig: () => set({ config: defaultConfig }),
    }),
    {
      name: 'qs-srm-demo-config',
      merge: (persisted, current) => ({
        ...current,
        config: { ...defaultConfig, ...((persisted as Partial<ConfigState>)?.config ?? {}) },
      }),
    },
  ),
)
