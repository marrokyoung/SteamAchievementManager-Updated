import { beforeEach, describe, expect, it } from 'vitest'
import {
  type RuntimeCheck,
  _resetForTesting,
  getElectronBridge,
  validateElectronRuntime
} from './electronBridge'

describe('electronBridge', () => {
  beforeEach(() => {
    _resetForTesting()
    ;(window as any).electron = {
      getConfig: async () => ({ baseUrl: 'http://localhost:3000', token: 'test-token' }),
      windowMinimize: () => {},
      windowMaximize: () => {},
      windowClose: () => {},
      startServiceForApp: async () => ({ success: true, baseUrl: 'http://localhost:3000', token: 'test-token' }),
      restartServiceNeutral: async () => ({ success: true, baseUrl: 'http://localhost:3000', token: 'test-token' }),
      getCurrentAppId: async () => ({ appId: null, baseUrl: 'http://localhost:3000', token: 'test-token' }),
      checkForUpdates: async () => ({ available: false }),
      downloadUpdate: async () => {},
      installUpdate: async () => {},
      onUpdateAvailable: () => () => {},
      onUpdateDownloaded: () => () => {},
      onDownloadProgress: () => () => {},
      onUpdateError: () => () => {}
    }
  })

  describe('validateElectronRuntime', () => {
    it('returns ok with bridge when all methods are present', () => {
      const result = validateElectronRuntime()
      expect(result.ok).toBe(true)
      expect((result as RuntimeCheck & { ok: true }).bridge).toBe((window as any).electron)
    })

    it('returns missing_bridge when window.electron is undefined', () => {
      delete (window as any).electron
      const result = validateElectronRuntime()
      expect(result).toEqual({ ok: false, reason: 'missing_bridge' })
    })

    it('returns invalid_bridge with missing methods when contract is incomplete', () => {
      ;(window as any).electron = { getConfig: async () => ({}) }
      const result = validateElectronRuntime()
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('invalid_bridge')
        expect(result.missingMethods).toContain('windowMinimize')
        expect(result.missingMethods).not.toContain('getConfig')
      }
    })

    it('caches the result on subsequent calls', () => {
      const first = validateElectronRuntime()
      const second = validateElectronRuntime()
      expect(first).toBe(second)
    })
  })

  describe('getElectronBridge', () => {
    it('returns the bridge when runtime is valid', () => {
      expect(getElectronBridge()).toBe((window as any).electron)
    })

    it('throws when runtime validation failed', () => {
      delete (window as any).electron
      validateElectronRuntime() // cache the failure
      expect(() => getElectronBridge()).toThrow('runtime validation failed')
    })
  })
})
