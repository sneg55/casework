// The agent's chat, docked beside the screens. `@truefoundry/trueforge-ui` is the chat shell
// and it is loaded only when a harness is configured, because it carries the assistant-ui
// runtime and there is nothing for it to talk to otherwise.
import { lazy, Suspense, useEffect, useState } from 'react'

import { approvalRequest, HARNESS_TOKEN, HARNESS_URL, REQUEST_EVENT } from '../lib/agent'
import { ChatBoundary } from './ChatBoundary'

const Chat = lazy(async () => {
  const [{ TrueForgeUI }] = await Promise.all([
    import('@truefoundry/trueforge-ui'),
    import('@truefoundry/trueforge-ui/styles.css'),
  ])
  return { default: TrueForgeUI }
})

/**
 * An absent token is an absent key, not a key set to undefined. Built once, at module scope:
 * the chat shell subscribes to this object, so a fresh one per render drives its store into
 * "Maximum update depth exceeded" and takes the dock down. Both inputs are module constants,
 * so there is nothing to recompute.
 */
function harnessServer(baseUrl: string, token: string | undefined) {
  return token === undefined
    ? ({ type: 'trueforge', baseUrl } as const)
    : ({ type: 'trueforge', baseUrl, token } as const)
}

const SERVER = HARNESS_URL === null ? null : harnessServer(HARNESS_URL, HARNESS_TOKEN)

function Unconfigured({ staged }: { staged: string | null }) {
  return (
    <div className="dock-empty">
      <h3>No harness configured</h3>
      <p>
        The chat pane mounts <code>@truefoundry/trueforge-ui</code> against a running TrueForge
        harness. Point <code>VITE_CASEWORK_HARNESS_URL</code> at its API root and reload. Setup is
        in <code>agent/README.md</code>.
      </p>
      <p>
        Approval is a gated <code>outreach.send</code> call inside the agent, so this screen cannot
        stand in for it. Nothing here sends.
      </p>
      {staged === null ? null : (
        <>
          <p className="staged-label">What to ask the agent:</p>
          <pre className="staged">{staged}</pre>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(staged)
            }}
          >
            Copy the request
          </button>
        </>
      )}
    </div>
  )
}

export function AgentDock({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const [staged, setStaged] = useState<string | null>(null)

  useEffect(() => {
    const onAsk = (event: Event) => {
      const { detail } = event as CustomEvent<string>
      setStaged(detail)
    }
    window.addEventListener(REQUEST_EVENT, onAsk)
    return () => {
      window.removeEventListener(REQUEST_EVENT, onAsk)
    }
  }, [])

  return (
    <aside className={open ? 'dock open' : 'dock'} aria-label="The agent">
      <button type="button" className="dock-tab" onClick={onToggle} aria-expanded={open}>
        {open ? 'Hide the agent' : 'The agent'}
      </button>
      {!open ? null : SERVER === null ? (
        <Unconfigured staged={staged} />
      ) : (
        <ChatBoundary>
          <Suspense fallback={<p className="dock-empty">Loading the chat shell…</p>}>
            <Chat server={SERVER} layout="dock" />
          </Suspense>
        </ChatBoundary>
      )}
    </aside>
  )
}

export { approvalRequest }
