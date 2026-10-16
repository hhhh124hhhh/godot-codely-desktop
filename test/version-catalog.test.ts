import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  fetchAvailableReleases,
  GITHUB_RELEASES_API_URL,
  parseGithubReleases,
  releaseFeedUrl,
  STABLE_FEED_URL
} from '../src/main/update/version-catalog'

describe('version-catalog constants', () => {
  it('points the catalog and stable feed at this repository, not the upstream service', () => {
    expect(GITHUB_RELEASES_API_URL).toBe('https://api.github.com/repos/hhhh124hhhh/godot-codely-desktop/releases')
    expect(STABLE_FEED_URL).toBe('https://github.com/hhhh124hhhh/godot-codely-desktop/releases/download/')
  })

  it('builds a per-tag download feed url with a trailing slash', () => {
    expect(releaseFeedUrl('v1.2.3-unsigned')).toBe(
      'https://github.com/hhhh124hhhh/godot-codely-desktop/releases/download/v1.2.3-unsigned/'
    )
  })
})

describe('compareVersions', () => {
  it('orders by numeric segments', () => {
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1)
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('treats a prerelease as lower than its release', () => {
    expect(compareVersions('1.2.3-rc.1', '1.2.3')).toBe(-1)
    expect(compareVersions('1.2.3', '1.2.3-rc.1')).toBe(1)
    expect(compareVersions('1.2.3-rc.1', '1.2.3-rc.2')).toBe(-1)
  })

  it('compares prerelease counters numerically, not lexicographically', () => {
    // "rc.10" < "rc.9" under string comparison; semver says the reverse.
    expect(compareVersions('1.2.3-rc.10', '1.2.3-rc.9')).toBe(1)
    expect(compareVersions('1.2.3-rc.9', '1.2.3-rc.10')).toBe(-1)
    expect(compareVersions('1.2.3-alpha.10', '1.2.3-alpha.9')).toBe(1)
    expect(compareVersions('1.2.3-rc.10', '1.2.3-rc.1')).toBe(1)
  })

  it('follows semver identifier precedence', () => {
    // fewer identifiers < more ("alpha" < "alpha.1")
    expect(compareVersions('1.2.3-alpha', '1.2.3-alpha.1')).toBe(-1)
    // numeric identifiers < alphanumeric ones ("1" < "alpha")
    expect(compareVersions('1.2.3-1', '1.2.3-alpha')).toBe(-1)
    expect(compareVersions('1.2.3-alpha', '1.2.3-beta')).toBe(-1)
    expect(compareVersions('1.2.3-rc.10', '1.2.3-rc.10')).toBe(0)
  })
})

function release(tag: string, draft = false): Record<string, unknown> {
  return { tag_name: tag, draft, prerelease: true }
}

describe('parseGithubReleases', () => {
  it('keeps unsigned releases and drops drafts, off-channel tags and malformed entries', () => {
    const parsed = parseGithubReleases([
      release('v1.2.3-unsigned'),
      release('v1.2.4-unsigned', true),
      release('v1.0.0'),
      { tag_name: 42 },
      'nope'
    ])
    expect(parsed.map((r) => r.version)).toEqual(['1.2.3'])
    expect(parsed[0]?.archiveUrl).toBe(releaseFeedUrl('v1.2.3-unsigned'))
  })

  it('returns an empty array for non-arrays', () => {
    expect(parseGithubReleases(null)).toEqual([])
    expect(parseGithubReleases({})).toEqual([])
    expect(parseGithubReleases('nope')).toEqual([])
  })
})

describe('fetchAvailableReleases', () => {
  const releases = [release('v1.0.0-unsigned'), release('v1.2.0-unsigned'), release('v1.1.0-unsigned')]
  const ok = () =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(releases) } as Response)

  it('drops the current version and sorts descending', async () => {
    const result = await fetchAvailableReleases('1.1.0', ok as unknown as typeof fetch)
    expect(result.map((r) => r.version)).toEqual(['1.2.0', '1.0.0'])
  })

  it('throws when the request fails', async () => {
    const bad = () => Promise.resolve({ ok: false, status: 503 } as Response)
    await expect(
      fetchAvailableReleases('1.1.0', bad as unknown as typeof fetch)
    ).rejects.toThrow('GitHub releases request failed: 503')
  })

  it('throws when the network rejects', async () => {
    const boom = () => Promise.reject(new Error('offline'))
    await expect(
      fetchAvailableReleases('1.1.0', boom as unknown as typeof fetch)
    ).rejects.toThrow('offline')
  })
})
