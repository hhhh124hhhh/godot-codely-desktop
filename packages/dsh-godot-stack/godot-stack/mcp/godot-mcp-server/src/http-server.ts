/** MCP HTTP endpoints; /api uses finite JSON responses for Godot HTTPRequest. */
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { GodotConfig } from './better/src/godot/types.js'
import { registerTools } from './better/src/tools/registry.js'
import type { SovereignCtx } from './cs-unique/tools.js'

/** Build both transports from the same tool registry and runtime configuration. */
export function createHttpServer(config: GodotConfig, ctx: SovereignCtx): http.Server {
  const sessions = new Map<string, { server: Server; transport: StreamableHTTPServerTransport; json: boolean }>()
  const fail = (res: http.ServerResponse, status: number, message: string) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message } }))
  }
  return http.createServer(async (req, res) => {
    const endpoint = (req.url || '').split('?')[0]
    const json = endpoint === '/api' || endpoint === '/api/'
    if (!json && endpoint !== '/mcp' && endpoint !== '/mcp/' && endpoint !== '/' && endpoint !== '//') {
      fail(res, 404, 'Endpoint not found')
      return
    }
    if (json) {
      res.setHeader('Connection', 'close')
      // The panel never consumes SSE, including the optional GET event stream.
      if (req.method !== 'POST' && req.method !== 'DELETE') {
        res.setHeader('Allow', 'POST, DELETE')
        fail(res, 405, 'Method not allowed')
        return
      }
    }
    const sessionId = req.headers['mcp-session-id']
    if (Array.isArray(sessionId)) {
      fail(res, 400, 'Invalid session header')
      return
    }
    let session = sessionId ? sessions.get(sessionId) : undefined
    if (sessionId && (!session || session.json !== json)) {
      fail(res, 404, 'Session not found; initialize again')
      return
    }
    if (!session && req.method !== 'POST') {
      fail(res, 400, 'Session not initialized')
      return
    }
    let created = false
    try {
      if (!session) {
        const server = new Server(
          { name: 'godot-mcp-server', version: '2.0.0' },
          { capabilities: { tools: {} } },
        )
        registerTools(server, config, ctx)
        const transport = new StreamableHTTPServerTransport({
          enableJsonResponse: json,
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => { sessions.set(id, { server, transport, json }) },
          onsessionclosed: (id) => { sessions.delete(id) },
        })
        await server.connect(transport)
        session = { server, transport, json }
        created = true
      }
      await session.transport.handleRequest(req, res)
    } catch (error) {
      console.error(`[mcp-http] ${req.method} ${endpoint} transport failed:`, error)
      if (!res.headersSent) fail(res, 500, 'MCP transport failed')
      else if (!res.writableEnded) res.end()
    } finally {
      // Rejected initialization must not leave a registered server behind.
      if (created && session && !session.transport.sessionId) await session.server.close()
    }
  })
}
