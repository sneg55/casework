// The day's totals. In scope and out of scope are two different populations and the strip
// keeps them apart: the declared-credential feeds are filtered out before `failing` is
// counted, so running all five figures together made 53 minus 32 look like it should be 28.
import type { RunCounts } from '../lib/api'

function Total({ n, label, lead }: { n: number; label: string; lead?: boolean }) {
  return (
    <div className={lead === true ? 'hi' : undefined}>
      <span className="n">{n}</span>
      <span className="l">{label}</span>
    </div>
  )
}

export function Totals({ run }: { run: RunCounts }) {
  return (
    <>
      <div className="strip">
        <Total n={run.checked} label="checked" />
        <Total n={run.healthy} label="healthy" />
        <Total n={run.failing} label="failing" />
        <Total n={run.suppressed_catalog} label="answered by the catalog" />
        <Total n={run.actionable} label="actionable" lead />
      </div>
      <p className="aside">
        Outside the {run.checked}: {run.suppressed_credential} feeds the catalog declares need a
        credential. They answered 401, which is the right answer to a request with no key, so they
        are set aside before the run is counted and never entered the {run.failing}.
      </p>
    </>
  )
}
