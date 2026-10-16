import type { AvailableRelease } from '../../shared/contracts'

export type { AvailableRelease }

/**
 * Godot Codely 自己的更新目录：直接读 GitHub Releases API。
 * 本 fork 不接入上游 DSH 的 dshdesktop.com 更新/上报服务（update-policy 中
 * DESKTOP_SERVICE_ENABLED=false），因此版本目录、feed 与指定版本安装全部
 * 由本仓库的 GitHub Releases 提供。
 */
export const GITHUB_OWNER = 'hhhh124hhhh'
export const GITHUB_REPO = 'godot-codely-desktop'
export const GITHUB_RELEASES_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`

/**
 * 恢复用 feed。checkForUpdates 每次都会用策略返回的真实 feed 覆盖，
 * 这里只作为 installSpecificVersion 结束后的中性占位，不实际请求。
 */
export const STABLE_FEED_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/`

/** 当前发布通道为 unsigned：tag 形如 v0.1.3-unsigned。 */
const UNSIGNED_TAG_PATTERN = /^v\d+\.\d+\.\d+-unsigned$/

const API_TIMEOUT_MS = 8_000
const API_PER_PAGE = '20'

/** "v0.1.3-unsigned" -> "0.1.3"。非本通道 tag 返回 null。 */
export function releaseVersionFromTag(tag: string): string | null {
  if (!UNSIGNED_TAG_PATTERN.test(tag)) return null
  return tag.slice(1).replace(/-unsigned$/, '')
}

/** 该 tag 对应发布资产的下载目录，electron-updater generic feed 用它拼 latest.yml 与安装包。 */
export function releaseFeedUrl(tag: string): string {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tag}/`
}

/** Split "1.2.3-rc.1" into ([1,2,3], "rc.1"). Non-numeric segments read as 0. */
function splitVersion(value: string): { nums: number[]; pre: string } {
  const [core = '', ...preParts] = value.trim().split('-')
  const nums = core.split('.').map((part) => {
    const parsed = Number.parseInt(part, 10)
    return Number.isFinite(parsed) ? parsed : 0
  })
  while (nums.length < 3) nums.push(0)
  return { nums, pre: preParts.join('-') }
}

export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const left = splitVersion(a)
  const right = splitVersion(b)
  for (let i = 0; i < Math.max(left.nums.length, right.nums.length); i += 1) {
    const diff = (left.nums[i] ?? 0) - (right.nums[i] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return comparePrerelease(left.pre, right.pre)
}

/**
 * Semver-style prerelease precedence once the numeric core is equal. A release
 * (no prerelease) sorts above any prerelease; dot-separated identifiers
 * compare with numeric identifiers numerically and below alphanumeric ones,
 * and fewer identifiers sort below more ("alpha" < "alpha.1"). Plain string
 * comparison would order "rc.10" below "rc.9", mis-sorting the archive index
 * (and the picker/downgrade split in the preload) once a prerelease counter
 * reaches two digits.
 */
function comparePrerelease(left: string, right: string): -1 | 0 | 1 {
  if (left === right) return 0
  if (!left) return 1 // release > prerelease
  if (!right) return -1
  const l = left.split('.')
  const r = right.split('.')
  const length = Math.max(l.length, r.length)
  for (let i = 0; i < length; i += 1) {
    const x = l[i]
    const y = r[i]
    if (x === undefined) return -1 // fewer identifiers sorts below
    if (y === undefined) return 1
    if (x === y) continue
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) {
      // Compare without Number() so leading-zero forms and large counters do
      // not lose precision.
      const nx = x.replace(/^0+/, '') || '0'
      const ny = y.replace(/^0+/, '') || '0'
      if (nx.length !== ny.length) return nx.length < ny.length ? -1 : 1
      if (nx !== ny) return nx < ny ? -1 : 1
      continue
    }
    if (xn) return -1 // numeric identifiers sort below alphanumeric ones
    if (yn) return 1
    if (x < y) return -1
    if (x > y) return 1
  }
  return 0
}

function isGithubRelease(value: unknown): value is { tag_name: string; draft?: unknown } {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.tag_name === 'string' && record.tag_name.length > 0
}

export function parseGithubReleases(raw: unknown): AvailableRelease[] {
  if (!Array.isArray(raw)) return []
  const releases: AvailableRelease[] = []
  for (const value of raw) {
    if (!isGithubRelease(value)) continue
    if (value.draft === true) continue
    const tag = value.tag_name
    const version = releaseVersionFromTag(tag)
    if (version === null) continue
    releases.push({ version, tag, archiveUrl: releaseFeedUrl(tag) })
  }
  return releases
}

export async function fetchAvailableReleases(
  currentVersion: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<AvailableRelease[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    const response = await fetchImpl(`${GITHUB_RELEASES_API_URL}?per_page=${API_PER_PAGE}`, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' }
    })
    if (!response.ok) {
      throw new Error(`GitHub releases request failed: ${response.status}`)
    }
    return parseGithubReleases(await response.json())
      .filter((release) => compareVersions(release.version, currentVersion) !== 0)
      .sort((a, b) => compareVersions(b.version, a.version))
  } finally {
    clearTimeout(timer)
  }
}
