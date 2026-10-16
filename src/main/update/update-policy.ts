export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000
export const UPDATE_STARTUP_DELAY_MS = 15_000
export const UPDATE_STARTUP_JITTER_MS = 15_000
export const AUTO_INSTALL_ON_APP_QUIT = false
// This fork has no qualified update/report service. Never use the upstream
// DSH service to select binaries or upload Godot Codely failure reports.
export const DESKTOP_SERVICE_ENABLED = false
// Godot Codely 自己的 GitHub Releases 更新通道（tag vX.Y.Z-unsigned）。
// 与上游服务无关；crash 上报仍由 DESKTOP_SERVICE_ENABLED=false 关闭。
export const GITHUB_UPDATES_ENABLED = true

export function supportsAutoUpdates(isPackaged: boolean, platform: NodeJS.Platform): boolean {
  // 仅 Windows：macOS 未签名包无法通过 electron-updater 完成自动更新，
  // 未签名 Linux 没有受支持的更新器入口，两者都回退到手动更新提示。
  return GITHUB_UPDATES_ENABLED && isPackaged && platform === 'win32'
}

export function shouldCheckAfterResume(lastCheckedAt: number, now = Date.now()): boolean {
  return now - lastCheckedAt >= UPDATE_CHECK_INTERVAL_MS
}
