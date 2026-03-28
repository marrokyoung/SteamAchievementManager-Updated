import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnsavedChangesProvider } from '@/contexts/UnsavedChangesContext'
import type { GameData } from '@/types/api'
import ManagerView from './ManagerView'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/api', () => ({
  updateAPIConfig: vi.fn(),
  apiClient: vi.fn(),
}))

vi.mock('@/components/ui/use-toast', () => ({
  toast: vi.fn(),
}))

// Mock Radix-based UI components that trigger infinite re-render loops
// in jsdom due to compose-refs + React 19 interaction.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogTrigger: ({ children, asChild }: any) => asChild ? children : <button>{children}</button>,
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <span>{children}</span>,
  TooltipProvider: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: any) => asChild ? children : <span>{children}</span>,
}))

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, disabled }: any) => (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange?.(!checked)}
    />
  ),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, asChild, variant, size, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}))

// Stub section components to avoid deep Radix trees.
// Each section exposes just enough to test orchestration-level assertions.
vi.mock('./manager/components/AchievementsSection', () => ({
  AchievementsSection: ({
    totalCount,
    filteredAchievements,
    modifiedAchievements,
    onToggle,
  }: any) => (
    <div data-testid="achievements-section">
      {modifiedAchievements.size > 0 && (
        <span data-testid="ach-modified-badge">
          {modifiedAchievements.size} modified
        </span>
      )}
      {filteredAchievements.map((a: any) => (
        <button
          key={a.id}
          data-testid={`toggle-${a.id}`}
          onClick={() => {
            const current = modifiedAchievements.has(a.id)
              ? modifiedAchievements.get(a.id)
              : a.isAchieved
            onToggle(a.id, !current)
          }}
        >
          {a.name}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('./manager/components/StatsSection', () => ({
  StatsSection: ({
    gameData,
    modifiedStats,
    onUpdate,
  }: any) => (
    <div data-testid="stats-section">
      {modifiedStats.size > 0 && (
        <span data-testid="stat-modified-badge">
          {modifiedStats.size} modified
        </span>
      )}
      {(gameData?.stats ?? []).map((s: any) => (
        <button
          key={s.id}
          data-testid={`edit-${s.id}`}
          onClick={() => onUpdate(s.id, s.value + 40)}
        >
          {s.displayName}
        </button>
      ))}
    </div>
  ),
}))

function makeGameData(appId: number): GameData {
  return {
    appId,
    gameName: `Game ${appId}`,
    achievements: [
      {
        id: 'ach_1',
        name: 'First Blood',
        description: 'Get your first kill',
        isAchieved: false,
        unlockTime: null,
        iconNormal: null,
        iconLocked: null,
        isHidden: false,
        isProtected: false,
      },
    ],
    stats: [
      {
        id: 'stat_kills',
        displayName: 'Total Kills',
        type: 'int' as const,
        value: 10,
        minValue: 0,
        maxValue: 1000,
        incrementOnly: false,
        isProtected: false,
      },
    ],
  }
}

// Pre-build stable game data objects so the mock doesn't create new references
// on every render (which would trigger infinite setOriginalData loops).
const stableGameData: Record<number, GameData> = {
  1: makeGameData(1),
  2: makeGameData(2),
}
const stableRefetch = vi.fn()

// Mock useGameQueries to return deterministic data keyed by appId
vi.mock('@/hooks/useGameQueries', () => {
  const noopMutation = {
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }

  return {
    useGameData: vi.fn((appId: number, serviceReady: boolean) => ({
      data: serviceReady ? stableGameData[appId] : undefined,
      isLoading: false,
      error: null,
      refetch: stableRefetch,
      isRefetching: false,
    })),
    useUpdateAchievements: vi.fn(() => noopMutation),
    useUpdateStats: vi.fn(() => noopMutation),
    useStoreChanges: vi.fn(() => noopMutation),
    useResetStats: vi.fn(() => noopMutation),
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A button that navigates to a different manager route without unmounting,
 * simulating an in-place app switch.
 */
function AppSwitcher({ to }: { to: string }) {
  const navigate = useNavigate()
  return (
    <button onClick={() => navigate(to)} data-testid="switch-app">
      Switch App
    </button>
  )
}

function renderManager(initialAppId: number) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <UnsavedChangesProvider>
        <MemoryRouter initialEntries={[`/manager/${initialAppId}`]}>
          <AppSwitcher to="/manager/2" />
          <Routes>
            <Route path="/manager/:appId" element={<ManagerView />} />
          </Routes>
        </MemoryRouter>
      </UnsavedChangesProvider>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ManagerView app-switch', () => {
  beforeEach(() => {
    const bridge = (window as any).electron
    bridge.startServiceForApp.mockImplementation((appId: number) =>
      Promise.resolve({ success: true, baseUrl: 'http://localhost:3000', token: `token-${appId}` })
    )
    bridge.getCurrentAppId.mockResolvedValue(null)
  })

  it('clears staged achievement edits when navigating to a different app', async () => {
    const user = userEvent.setup()
    renderManager(1)

    // Wait for game data to render
    await waitFor(() => {
      expect(screen.getByText('Game 1')).toBeInTheDocument()
    })

    // Toggle an achievement to stage a change
    await user.click(screen.getByTestId('toggle-ach_1'))

    // Verify modification badge is visible
    expect(screen.getByTestId('ach-modified-badge')).toBeInTheDocument()

    // Save should be enabled
    const saveButton = screen.getByRole('button', { name: /save changes/i })
    expect(saveButton).not.toBeDisabled()

    // Navigate to /manager/2 in-place
    await user.click(screen.getByTestId('switch-app'))

    // Wait for the new game to render
    await waitFor(() => {
      expect(screen.getByText('Game 2')).toBeInTheDocument()
    })

    // Modified badge should be gone
    expect(screen.queryByTestId('ach-modified-badge')).not.toBeInTheDocument()

    // Save button should be disabled (no changes)
    const saveButton2 = screen.getByRole('button', { name: /save changes/i })
    expect(saveButton2).toBeDisabled()
  })

  it('clears staged stat edits when navigating to a different app', async () => {
    const user = userEvent.setup()
    renderManager(1)

    // Wait for game data to render
    await waitFor(() => {
      expect(screen.getByText('Game 1')).toBeInTheDocument()
    })

    // Edit a stat via the stub button (stages value + 40 = 50)
    await user.click(screen.getByTestId('edit-stat_kills'))

    // Verify modification badge is visible
    expect(screen.getByTestId('stat-modified-badge')).toBeInTheDocument()

    // Save should be enabled
    const saveButton = screen.getByRole('button', { name: /save changes/i })
    expect(saveButton).not.toBeDisabled()

    // Navigate to /manager/2 in-place
    await user.click(screen.getByTestId('switch-app'))

    // Wait for the new game to render
    await waitFor(() => {
      expect(screen.getByText('Game 2')).toBeInTheDocument()
    })

    // Modified badge should be gone
    expect(screen.queryByTestId('stat-modified-badge')).not.toBeInTheDocument()

    // Save button should be disabled (no changes)
    const saveButton2 = screen.getByRole('button', { name: /save changes/i })
    expect(saveButton2).toBeDisabled()
  })
})
