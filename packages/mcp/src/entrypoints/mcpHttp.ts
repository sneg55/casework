#!/usr/bin/env node
// casework-mcp over streamable HTTP, which is the only transport a TrueForge harness will
// register: its MCP server manifest takes a URL and nothing else. The tools, the store and the
// gate are the stdio server's, unchanged. This is a second door onto the same room.
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

import { createServer } from '../server.js'
import { openStore } from '../services/store.js'
import { env } from '../utils/env.js'

// One store for the process. It is a SQLite handle and the thing that actually holds state,
// which is why the sessionless transport below costs nothing.
const store = openStore(env.CASEWORK_DB)

function cors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id')
}

/**
 * A transport and a server per request. A stateless transport carries one initialize, so a
 * shared instance answers the first caller and returns 500 to the second, which is how the
 * harness's tools/list fails while a hand-run curl looks fine. Omitting sessionIdGenerator is
 * what selects stateless mode; passing it as undefined is rejected by exactOptionalPropertyTypes.
 */
async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const transport = new StreamableHTTPServerTransport({})
  const server = createServer(store)
  res.on('close', () => {
    void transport.close()
    void server.close()
  })
  // The SDK's streamable transport exposes onclose through a getter and setter typed
  // `(() => void) | undefined`, while its own Transport interface declares `onclose?: () => void`.
  // Under exactOptionalPropertyTypes those are different types, so the cast is to the SDK's own
  // interface rather than around it.
  await server.connect(transport as unknown as Transport)
  await transport.handleRequest(req, res)
}

const http = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
  cors(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  // A liveness probe that does not open an MCP session, so `curl` can answer "is it up".
  if (req.method === 'GET' && (req.url ?? '').startsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, server: 'casework-mcp' }))
    return
  }
  handleMcp(req, res).catch((error: unknown) => {
    process.stderr.write(`mcp request failed: ${String(error)}\n`)
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'mcp request failed' }))
  })
})

process.on('SIGINT', () => {
  store.close()
  http.close()
  process.exit(0)
})

http.listen(env.CASEWORK_MCP_PORT, () => {
  process.stderr.write(`casework-mcp on http://localhost:${String(env.CASEWORK_MCP_PORT)}/mcp\n`)
})
