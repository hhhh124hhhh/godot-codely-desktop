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

it('does not activate upstream reporting, version discovery or binary downloads in installed fork builds', async () => {
  const service = await import('../src/main/desktop-service')
  const manager = await import('../src/main/update/update-manager')
  service.initializeDesktopService()
  expect(service.desktopDiagnostics).toBeUndefined()
  manager.registerUpdateHandlers()
  manager.startUpdateManager({ prepareToInstall: async () => {} })
  try {
    await manager.checkForUpdates(true)
    await manager.installSpecificVersion('0.9.9')
    expect(await mocks.handlers.get('updates:list-versions')?.()).toEqual([])
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.updater.setFeedURL).not.toHaveBeenCalled()
    expect(mocks.updater.checkForUpdates).not.toHaveBeenCalled()
    expect(mocks.updater.downloadUpdate).not.toHaveBeenCalled()
    expect(manager.getUpdateStatus().phase).toBe('unsupported')
  } finally {
    manager.stopUpdateManager()
  }
})
