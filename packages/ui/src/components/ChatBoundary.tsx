// The chat shell is third-party code mounted inside our page. Without a boundary a throw
// anywhere in it unmounts the whole tree, and the steward loses the register they were reading
// along with the agent they were not. The queue is the product; the dock is an attachment.
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Rendered under the error, so what the steward asked for is not lost with the chat. */
  fallbackExtra?: ReactNode
}

interface State {
  message: string | null
}

export class ChatBoundary extends Component<Props, State> {
  override state: State = { message: null }

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // The stack is the only lead when a vendored component throws.
    console.error('[casework] the chat shell threw', error, info.componentStack)
  }

  override render(): ReactNode {
    const { message } = this.state
    if (message === null) return this.props.children
    return (
      <div className="dock-empty">
        <h3>The chat shell stopped</h3>
        <p>
          The agent pane failed and the queue beside it is unaffected. Approving still works: the
          gate is drawn on the case itself, not here. Reopen the dock to try again, or check that
          the harness on <code>CASEWORK_HARNESS_ORIGIN</code> is still running.
        </p>
        {this.props.fallbackExtra}
        <pre className="staged">{message}</pre>
      </div>
    )
  }
}
