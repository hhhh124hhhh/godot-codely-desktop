import { compareVersions, fetchAvailableReleases } from './version-catalog'

/** 与 update-manager 期望的 checkDesktopUpdate 返回结构对齐的最小策略。 */
export interface GithubUpdatePolicy {
  updateAvailable: boolean
  version: string
  feedUrl: string
}

/**
 * 从 GitHub Releases 选最新一个高于当前版本的本通道发布（vX.Y.Z-unsigned），
 * 返回其资产下载目录作为 electron-updater generic feed。没有更高版本时
 * 返回 updateAvailable=false，不触发降级。
 */
export async function checkGithubUpdate(
  currentVersion: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<GithubUpdatePolicy> {
  const releases = await fetchAvailableReleases(currentVersion, fetchImpl)
  const newer = releases.find((release) => compareVersions(release.version, currentVersion) > 0)
  if (!newer) return { updateAvailable: false, version: currentVersion, feedUrl: '' }
  return { updateAvailable: true, version: newer.version, feedUrl: newer.archiveUrl }
}
