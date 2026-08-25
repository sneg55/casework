// The day's totals. In scope and out of scope are two different populations and the strip
// keeps them apart: the declared-credential feeds are filtered out before `failing` is
// counted, so running all five figures together made 53 minus 32 look like it should be 28.
// Every figure opens the rows it counts, per section 11.
import type { Bucket, RunCounts } from '../lib/api'

function Total({
  n,
  label,
  bucket,
  onOpen,
  lead,
}: {
  n: number
  label: string
  bucket: Bucket
  onOpen: (bucket: Bucket) => void
  lead?: boolean
}) {
  return (
    <button
      type="button"
      className={lead === true ? 'total hi' : 'total'}
      onClick={() => {
        onOpen(bucket)
      }}
    >
      <span className="n">{n}</span>
      <span className="l">{label}</span>
    </button>
  )
}

export function Totals({ run, onOpen }: { run: RunCounts; onOpen: (bucket: Bucket) => void }) {
  return (
    <>
      <div className="strip">
        <Total n={run.checked} label="checked" bucket="checked" onOpen={onOpen} />
        <Total n={run.healthy} label="healthy" bucket="healthy" onOpen={onOpen} />
        <Total n={run.failing} label="failing" bucket="failing" onOpen={onOpen} />
        <Total
          n={run.suppressed_catalog}
          label="answered by the catalog"
          bucket="suppressed_catalog"
          onOpen={onOpen}
        />
        <Total n={run.actionable} label="actionable" bucket="actionable" onOpen={onOpen} lead />
      </div>
      <p className="aside">
        Outside the {run.checked}:{' '}
        <button
          type="button"
          className="inline-n"
          onClick={() => {
            onOpen('suppressed_credential')
          }}
        >
          {run.suppressed_credential} feeds
        </button>{' '}
        the catalog declares need a credential. They answered 401, which is the right answer to a
        request with no key, so they are set aside before the run is counted and never entered the{' '}
        {run.failing}.
      </p>
    </>
  )
}
