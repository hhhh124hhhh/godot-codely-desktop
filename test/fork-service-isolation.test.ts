import { expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  updater: { setFeedURL: vi.fn(), checkForUpdates: vi.fn(), downloadUpdate: vi.fn(), quitAndInstall: vi.fn(), on: vi.fn() }
}))
vi.mock('electron', () => ({
  app: { isPackaged: true, getVersion: () => '0.1.0', getPath: vi.fn(), isReady: () => true },
  net: { fetch: mocks.request }, dialog: { showMessageBox: vi.fn() },
  ipcMain: { handle: (name: string, handler: (...args: unknown[]) => unknown) => mocks.handlers.set(name, handler) },
  BrowserWindow: { getAllWindows: () => [] }, powerMonitor: { on: vi.fn(), removeListener: vi.fn() }
}))
vi.mock('electron-updater', () => ({ default: { autoUpdater: mocks.updater } }))
// 本仓库自己的更新目录：测试环境没有发布，列表为空 -> 无可用更新。
vi.mock('../src/main/update/version-catalog', async importOriginal => ({
  ...(await importOriginal<object>()),
  fetchAvailableReleases: async () => []
}))

it('does not activate the upstream reporting service; feed URLs point only at this repository', async () => {
  const service = await import('../src/main/desktop-service')
  const manager = await import('../src/main/update/update-manager')
  service.initializeDesktopService()
  expect(service.desktopDiagnostics).toBeUndefined()
  manager.registerUpdateHandlers()
  manager.startUpdateManager({ prepareToInstall: async () => {} })
  try {
    await manager.checkForUpdates(true)
    expect(manager.getUpdateStatus().phase).toBe('up-to-date')
    expect(await mocks.handlers.get('updates:list-versions')?.()).toEqual([])
    // 上游服务的网络请求从未发生（服务未实例化）。
    expect(mocks.request).not.toHaveBeenCalled()
    // 自家通道启用；指定历史版本时 feed 只指向本仓库 GitHub，绝不回退到上游 URL。
    await manager.installSpecificVersion('0.9.9')
    const calls = mocks.updater.setFeedURL.mock.calls as Array<Array<{ url?: string }>>
    expect(calls.length).toBeGreaterThan(0)
    for (const [config] of calls) {
      expect(config?.url ?? '').not.toContain('dshdesktop.com')
      expect(config?.url ?? '').toContain('github.com/hhhh124hhhh/godot-codely-desktop')
    }
    // 无可用版本时不下载任何二进制。
    expect(mocks.updater.downloadUpdate).not.toHaveBeenCalled()
  } finally {
    manager.stopUpdateManager()
  }
})
