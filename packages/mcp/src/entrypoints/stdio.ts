#!/usr/bin/env node
// casework-mcp over stdio. Read tools only, at this stage: nothing here can send anything.
// outreach.send is the one gated tool and it lands with the approval work on 08-29.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { createServer } from '../server.js'
import { openStore } from '../services/store.js'
import { env } from '../utils/env.js'

const store = openStore(env.CASEWORK_DB)
const server = createServer(store)

process.on('SIGINT', () => {
  store.close()
  process.exit(0)
})

await server.connect(new StdioServerTransport())
