import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { TabBar } from './TabBar'
import { useUIStore } from '@/store/ui'

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <TabBar />
    </MemoryRouter>,
  )

describe('TabBar', () => {
  beforeEach(() => {
    useUIStore.setState({ quickAddOpen: false })
  })

  it('shows the four tabs and the add button', () => {
    renderAt('/')
    for (const label of ['Home', 'Activity', 'Loans', 'Reports']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeInTheDocument()
  })

  it('marks the tab matching the current route', () => {
    renderAt('/activity')
    expect(screen.getByRole('link', { name: 'Activity' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it('keeps Home inactive on nested routes', () => {
    renderAt('/loans/new')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Loans' })).toHaveAttribute('aria-current', 'page')
  })

  it('opens the quick-add sheet from the FAB', async () => {
    renderAt('/')
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }))
    expect(useUIStore.getState().quickAddOpen).toBe(true)
  })
})
