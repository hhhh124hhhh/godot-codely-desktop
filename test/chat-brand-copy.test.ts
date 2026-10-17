import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..')

describe('chat thinking-status brand copy', () => {
  it('replaces upstream DeepSeek-flavored deepDiving copy in every shipped locale', async () => {
    const client = await readFile(
      path.join(projectRoot, 'node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js'),
      'utf8'
    )

    // The zh copy ships inside the packaged asar; keep it free of the
    // upstream "深度求索" phrasing and on the neutral product voice.
    expect(client).toContain('"chat.deepDiving": "正在深度分析中"')
    expect(client).toContain('"chat.deepDivingFor": "正在深度分析中，用时 {duration} ···"')
    expect(client).not.toContain('深度求索')

    // Same key in the English dictionary.
    expect(client).toContain('"chat.deepDiving": "Analyzing in depth"')
    expect(client).toContain('"chat.deepDivingFor": "Analyzing in depth for {duration} ···"')
    expect(client).not.toContain('"chat.deepDiving": "Deep diving"')
  })
})
