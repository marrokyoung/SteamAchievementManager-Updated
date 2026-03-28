import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!(window as any).ResizeObserver) {
  ;(window as any).ResizeObserver = ResizeObserverStub
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  ;(window as any).electron = {
    getConfig: vi.fn().mockResolvedValue({
      baseUrl: 'http://localhost:3000',
      token: 'test-token',
    }),
    windowMinimize: vi.fn(),
    windowMaximize: vi.fn(),
    windowClose: vi.fn(),
    startServiceForApp: vi.fn().mockResolvedValue({
      success: true,
      baseUrl: 'http://localhost:3000',
      token: 'test-token',
    }),
    restartServiceNeutral: vi.fn().mockResolvedValue({
      success: true,
      baseUrl: 'http://localhost:3000',
      token: 'test-token',
    }),
    getCurrentAppId: vi.fn().mockResolvedValue(null),
  }
})
