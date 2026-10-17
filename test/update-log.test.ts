import { describe, expect, it } from 'vitest'
import { isBrokenPipeError, logToStream } from '../src/main/update/update-log'

function fakeStream(writable = true): NodeJS.WriteStream {
  return { writable } as unknown as NodeJS.WriteStream
}

function epipe(): Error {
  const error = new Error('EPIPE: broken pipe, write')
  Object.assign(error, { code: 'EPIPE' })
  return error
}

describe('update-log broken-pipe boundary', () => {
  it('recognizes EPIPE/EOF and nothing else', () => {
    expect(isBrokenPipeError(epipe())).toBe(true)
    const eof = new Error('write EOF')
    Object.assign(eof, { code: 'EOF' })
    expect(isBrokenPipeError(eof)).toBe(true)
    expect(isBrokenPipeError(new Error('boom'))).toBe(false)
    expect(isBrokenPipeError({ code: 'ENOENT' })).toBe(false)
    expect(isBrokenPipeError(undefined)).toBe(false)
  })

  it('swallows the EPIPE write and stops writing to that stream afterwards', () => {
    const stream = fakeStream()
    let writes = 0
    expect(() => logToStream(stream, () => { writes += 1; throw epipe() })).not.toThrow()
    expect(writes).toBe(1)
    logToStream(stream, () => { writes += 1 })
    expect(writes).toBe(1)
  })

  it('does not swallow non-broken-pipe errors', () => {
    const stream = fakeStream()
    expect(() => logToStream(stream, () => { throw new Error('boom') })).toThrow('boom')
  })

  it('skips writes when the stream is already not writable', () => {
    const stream = fakeStream(false)
    let writes = 0
    logToStream(stream, () => { writes += 1 })
    expect(writes).toBe(0)
  })

  it('keeps writing to other streams after one stream breaks', () => {
    const broken = fakeStream()
    const healthy = fakeStream()
    logToStream(broken, () => { throw epipe() })
    let writes = 0
    logToStream(healthy, () => { writes += 1 })
    expect(writes).toBe(1)
  })
})
