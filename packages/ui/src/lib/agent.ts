// The harness the chat pane talks to. Set VITE_CASEWORK_HARNESS_URL to the TrueForge API root
// and the dock mounts the real chat; leave it unset and the dock says so rather than pretending.
const configured: unknown = import.meta.env['VITE_CASEWORK_HARNESS_URL']
export const HARNESS_URL: string | null = typeof configured === 'string' ? configured : null

const token: unknown = import.meta.env['VITE_CASEWORK_HARNESS_TOKEN']
export const HARNESS_TOKEN: string | undefined = typeof token === 'string' ? token : undefined

export const REQUEST_EVENT = 'casework:ask-agent'

/** What the analyst should say to get the gated call raised. The agent owns the send. */
export function approvalRequest(docket: string, caseId: string): string {
  return `Send the drafted message for ${docket} (case ${caseId}). Show me the recipient kind and the subject first, then call outreach.send so I can approve the gate prompt.`
}

/** The case route asks; the dock listens. One path to outreach.send, and it is the agent's. */
export function askAgent(text: string): void {
  window.dispatchEvent(new CustomEvent(REQUEST_EVENT, { detail: text }))
}
