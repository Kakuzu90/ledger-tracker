import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Sheet } from './Sheet'

/**
 * Mirrors how the sheets in the app are actually used, because the focus
 * bug needed both halves of it:
 *
 * - `onClose` passed inline, so the prop is a new function every render;
 * - a *controlled* field, so every keystroke re-renders this host.
 *
 * With an uncontrolled input React never re-renders and the bug hides.
 */
function Host({ confirmDiscard = false }: { confirmDiscard?: boolean }) {
  const [open, setOpen] = useState(true)
  const [name, setName] = useState('')

  return (
    <Sheet
      open={open}
      onClose={() => setOpen(false)}
      title="Your name"
      confirmDiscard={confirmDiscard}
    >
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <button type="button">Save</button>
    </Sheet>
  )
}

describe('Sheet', () => {
  it('keeps focus in a field while it is typed into', async () => {
    const user = userEvent.setup()
    render(<Host />)

    const field = screen.getByLabelText('Name')
    await user.click(field)
    await user.type(field, 'Clyde')

    // The open effect moves focus to the panel. It used to depend on a
    // callback that changed identity every render, so it re-ran on every
    // keystroke and took focus off the field after the first letter.
    expect(field).toHaveFocus()
    expect(field).toHaveValue('Clyde')
  })

  it('holds Tab inside the panel', async () => {
    const user = userEvent.setup()
    render(<Host />)

    const panel = screen.getByRole('dialog')
    for (let i = 0; i < 8; i += 1) await user.tab()

    expect(panel.contains(document.activeElement)).toBe(true)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<Host />)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks before discarding when there is something to lose', async () => {
    const user = userEvent.setup()
    render(<Host confirmDiscard />)

    await user.keyboard('{Escape}')

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('backs out of the prompt on a second Escape, leaving the sheet open', async () => {
    const user = userEvent.setup()
    render(<Host confirmDiscard />)

    await user.keyboard('{Escape}')
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('hands focus back to whatever opened it', async () => {
    const user = userEvent.setup()

    function Opener() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <Sheet open={open} onClose={() => setOpen(false)} title="Your name">
            <button type="button">Inside</button>
          </Sheet>
        </>
      )
    }

    render(<Opener />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await user.click(opener)
    await user.keyboard('{Escape}')

    expect(opener).toHaveFocus()
  })

  it('makes the app root inert while it is open, and lets it go after', async () => {
    const user = userEvent.setup()
    const root = document.createElement('div')
    root.id = 'root'
    document.body.append(root)

    try {
      render(<Host />)
      expect(root.hasAttribute('inert')).toBe(true)

      await user.keyboard('{Escape}')
      expect(root.hasAttribute('inert')).toBe(false)
    } finally {
      root.remove()
    }
  })

  it('runs the open effect once per open, not once per render', async () => {
    const user = userEvent.setup()
    render(<Host />)

    const panel = screen.getByRole('dialog')
    const field = screen.getByLabelText('Name')
    // Spied after the sheet has opened, so the effect's own first call is
    // not counted — only a re-run would show up here.
    const grabFocus = vi.spyOn(panel, 'focus')

    await user.click(field)
    await user.type(field, 'abcde')

    expect(grabFocus).not.toHaveBeenCalled()
    grabFocus.mockRestore()
  })
})
