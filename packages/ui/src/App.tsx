// The shell. Queue and case are routes with URLs, because "link a judge to a case" and
// "every number is clickable" are both routing problems. The agent's chat docks beside them
// when a harness is configured; see agent/README.md.
import { useEffect, useState } from 'react'

import { Case } from './routes/Case'
import { Queue } from './routes/Queue'

function caseFromHash(): string | null {
  const match = /^#\/cases\/([0-9a-f]{12})$/.exec(window.location.hash)
  return match?.[1] ?? null
}

export function App() {
  const [caseId, setCaseId] = useState<string | null>(caseFromHash())

  useEffect(() => {
    const onHash = () => {
      setCaseId(caseFromHash())
    }
    window.addEventListener('hashchange', onHash)
    return () => {
      window.removeEventListener('hashchange', onHash)
    }
  }, [])

  const open = (id: string) => {
    window.location.hash = `#/cases/${id}`
  }
  const back = () => {
    window.location.hash = ''
  }

  return (
    <div className="shell">
      <header className="masthead">
        <h1>Casework</h1>
        <span className="sub">
          feed failures, grouped by cause and addressed to whoever can fix them
        </span>
      </header>
      {caseId === null ? <Queue onOpen={open} /> : <Case caseId={caseId} onBack={back} />}
    </div>
  )
}
