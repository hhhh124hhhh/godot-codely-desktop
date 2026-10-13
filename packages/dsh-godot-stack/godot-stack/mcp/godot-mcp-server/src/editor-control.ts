/** Loopback editor adapter; native ownership remains in the EditorPlugin. */
export async function editorAction(projectPath: string, action: string) {
  const endpoint = new URL(process.env.GODOT_CODELY_BRIDGE_URL || 'http://127.0.0.1:4399')
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.username || endpoint.password) throw new Error('Godot bridge must be a loopback HTTP endpoint')
  const response = await fetch(new URL('/v1/editor/execute', endpoint), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectPath, action }), signal: AbortSignal.timeout(15000),
  })
  const result: unknown = await response.json()
  if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) {
    const message = result && typeof result === 'object' && 'error' in result ? String(result.error) : `HTTP ${response.status}`
    throw new Error(`Godot editor ${action}: ${message}`)
  }
  return result
}
