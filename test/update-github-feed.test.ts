import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  fetchAvailableReleases,
  parseGithubReleases,
  releaseFeedUrl,
  releaseVersionFromTag
} from '../src/main/update/version-catalog'
import { checkGithubUpdate } from '../src/main/update/github-update'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}

function githubRelease(tag: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { tag_name: tag, draft: false, prerelease: true, ...overrides }
}

describe('releaseVersionFromTag', () => {
  it('strips the v prefix and the -unsigned channel suffix', () => {
    expect(releaseVersionFromTag('v0.1.3-unsigned')).toBe('0.1.3')
  })

  it('rejects tags outside the unsigned channel', () => {
    expect(releaseVersionFromTag('v0.10.0')).toBeNull()
    expect(releaseVersionFromTag('desktop-preview-20260817.1')).toBeNull()
    expect(releaseVersionFromTag('v0.1.3-rc.1')).toBeNull()
    expect(releaseVersionFromTag('0.1.3-unsigned')).toBeNull()
  })
})

describe('parseGithubReleases', () => {
  it('parses version, tag and download feed URL for unsigned releases', () => {
    const releases = parseGithubReleases([githubRelease('v0.1.3-unsigned')])
    expect(releases).toEqual([
      {
        version: '0.1.3',
        tag: 'v0.1.3-unsigned',
        archiveUrl: 'https://github.com/hhhh124hhhh/godot-codely-desktop/releases/download/v0.1.3-unsigned/'
      }
    ])
  })

  it('skips drafts and non-unsigned tags', () => {
    const releases = parseGithubReleases([
      githubRelease('v0.1.3-unsigned', { draft: true }),
      githubRelease('v0.10.0'),
      { tag_name: 42 },
      githubRelease('v0.1.2-unsigned')
    ])
    expect(releases.map((release) => release.version)).toEqual(['0.1.2'])
  })

  it('returns an empty list for a non-array payload', () => {
    expect(parseGithubReleases({})).toEqual([])
  })
})

describe('fetchAvailableReleases', () => {
  it('fetches from GitHub, excludes the current version and sorts descending', async () => {
    const fetchImpl = async (): Promise<Response> =>
      jsonResponse([
        githubRelease('v0.1.3-unsigned'),
        githubRelease('v0.1.2-unsigned'),
        githubRelease('v0.1.4-unsigned')
      ])
    const releases = await fetchAvailableReleases('0.1.3', fetchImpl)
    expect(releases.map((release) => release.version)).toEqual(['0.1.4', '0.1.2'])
  })

  it('throws on a non-OK response', async () => {
    const fetchImpl = async (): Promise<Response> => new Response('rate limited', { status: 429 })
    await expect(fetchAvailableReleases('0.1.3', fetchImpl)).rejects.toThrow('GitHub releases request failed: 429')
  })
})

describe('checkGithubUpdate', () => {
  it('selects the newest higher version and its feed URL', async () => {
    const fetchImpl = async (): Promise<Response> =>
      jsonResponse([githubRelease('v0.1.3-unsigned'), githubRelease('v0.1.2-unsigned')])
    const policy = await checkGithubUpdate('0.1.2', fetchImpl)
    expect(policy.updateAvailable).toBe(true)
    expect(policy.version).toBe('0.1.3')
    expect(policy.feedUrl).toBe(releaseFeedUrl('v0.1.3-unsigned'))
  })

  it('does not offer the installed 0.1.7 build as its own update', async () => {
    const fetchImpl = async (): Promise<Response> =>
      jsonResponse([githubRelease('v0.1.7-unsigned'), githubRelease('v0.1.6-unsigned')])
    const policy = await checkGithubUpdate('0.1.7', fetchImpl)
    expect(policy.updateAvailable).toBe(false)
    expect(policy.version).toBe('0.1.7')
    expect(policy.feedUrl).toBe('')
  })

  it('does not treat a lower release as an update', async () => {
    const fetchImpl = async (): Promise<Response> =>
      jsonResponse([githubRelease('v0.1.1-unsigned')])
    const policy = await checkGithubUpdate('0.1.2', fetchImpl)
    expect(policy.updateAvailable).toBe(false)
  })

  it('does not treat a downgrade as an update', async () => {
    const fetchImpl = async (): Promise<Response> =>
      jsonResponse([githubRelease('v0.1.1-unsigned')])
    const policy = await checkGithubUpdate('0.1.2', fetchImpl)
    expect(policy.updateAvailable).toBe(false)
  })
})

describe('compareVersions', () => {
  it('orders numeric cores and prereleases like semver', () => {
    expect(compareVersions('0.1.3', '0.1.2')).toBe(1)
    expect(compareVersions('0.1.2', '0.1.2')).toBe(0)
    expect(compareVersions('0.1.3', '0.1.3-unsigned')).toBe(1)
    expect(compareVersions('0.1.10', '0.1.9')).toBe(1)
  })
})
