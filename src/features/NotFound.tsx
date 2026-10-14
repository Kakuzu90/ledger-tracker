import { Link } from 'react-router-dom'
import { Screen } from '@/ui/Screen'

export function NotFound() {
  return (
    <Screen title="Not found" back>
      <section className="card">
        <p className="text-muted">That screen does not exist.</p>
        <Link to="/" className="btn-primary mt-4 w-full">
          Go home
        </Link>
      </section>
    </Screen>
  )
}
