// State at a glance, in the sense a control panel means it: lit, dark, or half.
export function Lamp({ state }: { state: string }) {
  return <span className={`lamp ${state}`} aria-hidden="true" />
}
