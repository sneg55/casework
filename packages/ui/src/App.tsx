// The shell. Queue and case are routes with URLs, because "link a judge to a case" and
// "every number is clickable" are both routing problems. The agent's chat docks beside them
// when a harness is configured; see agent/README.md.
import { useEffect, useState } from 'react'

import { AgentDock } from './components/AgentDock'
import { REQUEST_EVENT } from './lib/agent'
import { Case } from './routes/Case'
import { Queue } from './routes/Queue'

function caseFromHash(): string | null {
  // Tolerates a query or trailing junk after the id: a pasted link should still open.
  const match = /^#\/cases\/([0-9a-f]{12})\b/.exec(window.location.hash)
  return match?.[1] ?? null
}

export function App() {
  const [caseId, setCaseId] = useState<string | null>(caseFromHash())
  const [dockOpen, setDockOpen] = useState(false)

  useEffect(() => {
    const onHash = () => {
      setCaseId(caseFromHash())
    }
    // Asking the agent for something is what opens the dock; the case route never reaches
    // into it, and the dock is the only place a gated call can be approved.
    const onAsk = () => {
      setDockOpen(true)
    }
    window.addEventListener('hashchange', onHash)
    window.addEventListener(REQUEST_EVENT, onAsk)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener(REQUEST_EVENT, onAsk)
    }
  }, [])

  const open = (id: string) => {
    window.location.hash = `#/cases/${id}`
  }
  const back = () => {
    window.location.hash = ''
  }

  return (
    <div className={dockOpen ? 'shell docked' : 'shell'}>
      <div className="page">
        <header className="masthead">
          <h1>Casework</h1>
          <span className="edition">
            California GTFS · public Mobility Database
            <br />
            <span className="strapline">
              feed failures, grouped by cause and addressed to whoever can fix them
            </span>
          </span>
        </header>
        {caseId === null ? <Queue onOpen={open} /> : <Case caseId={caseId} onBack={back} />}
      </div>
      <AgentDock
        open={dockOpen}
        onToggle={() => {
          setDockOpen((was) => !was)
        }}
      />
    </div>
  )
}
