import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { UnsavedChangesProvider, useUnsavedChanges } from '@/contexts/UnsavedChangesContext'

function ContextProbe() {
  const {
    hasUnsavedChanges,
    setHasUnsavedChanges,
    isNavigatingBack,
    setIsNavigatingBack,
  } = useUnsavedChanges()

  return (
    <div>
      <p data-testid="has-unsaved">{String(hasUnsavedChanges)}</p>
      <p data-testid="is-navigating-back">{String(isNavigatingBack)}</p>
      <button type="button" onClick={() => setHasUnsavedChanges(true)}>
        mark-unsaved
      </button>
      <button type="button" onClick={() => setHasUnsavedChanges(false)}>
        clear-unsaved
      </button>
      <button type="button" onClick={() => setIsNavigatingBack(true)}>
        start-back-nav
      </button>
      <button type="button" onClick={() => setIsNavigatingBack(false)}>
        stop-back-nav
      </button>
    </div>
  )
}

describe('UnsavedChangesContext', () => {
  it('tracks unsaved changes and back-navigation state', async () => {
    const user = userEvent.setup()

    render(
      <UnsavedChangesProvider>
        <ContextProbe />
      </UnsavedChangesProvider>
    )

    expect(screen.getByTestId('has-unsaved')).toHaveTextContent('false')
    expect(screen.getByTestId('is-navigating-back')).toHaveTextContent('false')

    await user.click(screen.getByRole('button', { name: 'mark-unsaved' }))
    expect(screen.getByTestId('has-unsaved')).toHaveTextContent('true')

    await user.click(screen.getByRole('button', { name: 'start-back-nav' }))
    expect(screen.getByTestId('is-navigating-back')).toHaveTextContent('true')

    await user.click(screen.getByRole('button', { name: 'clear-unsaved' }))
    await user.click(screen.getByRole('button', { name: 'stop-back-nav' }))
    expect(screen.getByTestId('has-unsaved')).toHaveTextContent('false')
    expect(screen.getByTestId('is-navigating-back')).toHaveTextContent('false')
  })
})
