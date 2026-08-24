// tls.inspect. The probe records that a handshake failed; the certificate detail is read
// here, at attribution time, because a classifier that opened a second connection per feed
// would be doing this step's job 256 times over.
import { connect } from 'node:tls'

export interface CertificateFacts {
  host: string
  reachable: boolean
  authorized: boolean
  authorization_error: string | null
  subject: string | null
  issuer: string | null
  valid_from: string | null
  valid_to: string | null
}

const TLS_TIMEOUT_MS = 10_000

function name(field: Record<string, string | string[]> | undefined): string | null {
  if (field === undefined) return null
  const cn = field['CN']
  if (typeof cn === 'string') return cn
  const o = field['O']
  return typeof o === 'string' ? o : null
}

export async function inspectCertificate(host: string): Promise<CertificateFacts> {
  const blank: CertificateFacts = {
    host,
    reachable: false,
    authorized: false,
    authorization_error: null,
    subject: null,
    issuer: null,
    valid_from: null,
    valid_to: null,
  }

  return await new Promise<CertificateFacts>((resolve) => {
    // rejectUnauthorized false on purpose: an expired chain is exactly what we came to read.
    const socket = connect(
      { host, port: 443, servername: host, rejectUnauthorized: false, timeout: TLS_TIMEOUT_MS },
      () => {
        const cert = socket.getPeerCertificate()
        const error = socket.authorizationError as Error | null | undefined
        resolve({
          host,
          reachable: true,
          authorized: socket.authorized,
          authorization_error: error != null ? String(error) : null,
          subject: name(cert.subject as unknown as Record<string, string | string[]>),
          issuer: name(cert.issuer as unknown as Record<string, string | string[]>),
          valid_from: cert.valid_from,
          valid_to: cert.valid_to,
        })
        socket.end()
      },
    )
    socket.on('error', () => {
      resolve(blank)
      socket.destroy()
    })
    socket.on('timeout', () => {
      resolve(blank)
      socket.destroy()
    })
  })
}
