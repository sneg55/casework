// The closed enums from docs/SPEC.md section 6. Adding a value is a spec change first.
// PARTY_FOR_CAUSE is checked against the recipient registry at startup, so a cause kind
// with no channel is caught before a case can reach a human.

export const CAUSE_KINDS = [
  'code_host_path_removed',
  'deprecated_service',
  'content_type_mismatch',
  'tls_expired',
  'auth_rejected',
  'path_not_found',
  'redirect_unresolved',
  'host_unreachable',
  'individual',
] as const

export const PARTY_KINDS = [
  'repository',
  'catalog',
  'host_operator',
  'cert_holder',
  'agency',
] as const

export const CASE_STATES = [
  'watching',
  'ready',
  'snoozed',
  'approved',
  'rejected',
  'resolved',
] as const

export const DECISION_ACTIONS = ['approve', 'edit', 'reject', 'snooze'] as const

export const EVIDENCE_KINDS = ['http', 'catalog', 'repo', 'redirect', 'tls'] as const

export type CauseKind = (typeof CAUSE_KINDS)[number]
export type PartyKind = (typeof PARTY_KINDS)[number]
export type CaseState = (typeof CASE_STATES)[number]
export type DecisionAction = (typeof DECISION_ACTIONS)[number]
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]

export const PARTY_FOR_CAUSE: Readonly<Record<CauseKind, PartyKind>> = {
  code_host_path_removed: 'repository',
  deprecated_service: 'catalog',
  content_type_mismatch: 'host_operator',
  tls_expired: 'cert_holder',
  auth_rejected: 'host_operator',
  path_not_found: 'agency',
  redirect_unresolved: 'host_operator',
  host_unreachable: 'host_operator',
  individual: 'agency',
}

/** Three counted points, per spec section 6. Never a model's estimate. */
export const MAX_CONFIDENCE = 3

/** Consecutive runs a cause must fail before anything is drafted. The operator's SOP. */
export const RUNS_BEFORE_DRAFT = 3
