/** Read exact application identity from an explicitly enabled loopback CI inspector. */
import assert from 'node:assert/strict'
const [endpoint, action] = process.argv.slice(2)
assert.equal(new URL(endpoint).hostname, '127.0.0.1')
const deadline = Date.now() + 90000
let lastError
while (Date.now() < deadline) {
  let socket
  try {
    const targets = await (await fetch(endpoint + '/json/list', { signal: AbortSignal.timeout(2000) })).json()
    assert.ok(targets[0]?.webSocketDebuggerUrl)
    socket = new WebSocket(targets[0].webSocketDebuggerUrl)
    await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', reject, { once: true }) })
    const result = await new Promise((done, reject) => {
      const timer = setTimeout(() => reject(Error('Main identity query timed out')), 5000)
      socket.addEventListener('message', event => {
        const value = JSON.parse(event.data)
        if (value.id !== 1) return
        clearTimeout(timer)
        if (value.error || value.result?.exceptionDetails) reject(Error(JSON.stringify(value.error ?? value.result.exceptionDetails)))
        else done(value.result.result.value)
      })
      const trigger = action === 'check-updates' ? `const flatten=items=>items.flatMap(item=>[item,...flatten(item.submenu?.items??[])]);const command=flatten(e.Menu.getApplicationMenu()?.items??[]).find(item=>/^(Check for Updates|检查更新)/i.test(item.label));if(!command)throw Error('Shipped update menu command unavailable');command.click(command,e.BrowserWindow.getAllWindows()[0],{});` : ''
      socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `(()=>{const e=process.getBuiltinModule('module').createRequire(process.execPath)('electron');if(!e.app.isReady()||!e.BrowserWindow.getAllWindows().length)return {};${trigger}return {ready:e.app.isReady(),windows:e.BrowserWindow.getAllWindows().length,version:e.app.getVersion(),userData:e.app.getPath('userData'),isPackaged:e.app.isPackaged,resourcesPath:process.resourcesPath}})()`, returnByValue: true } }))
    })
    assert.ok(result.ready && result.windows > 0 && result.isPackaged && result.version && result.userData, 'Wait for initialized app identity and a real window')
    console.log(JSON.stringify(result))
    process.exitCode = 0
    break
  } catch (error) { lastError = error; process.exitCode = 1; await new Promise(done => setTimeout(done, 500)) }
  finally { socket?.close() }
}
if (process.exitCode) throw lastError
