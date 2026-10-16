import { expect, it } from 'vitest'
import { brandFrontendHtml } from '../scripts/brand-web-frontend.mjs'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

it('updates an existing brand injection without duplication or overriding the selected language', () => {
  const old = '<html lang="en"><head><title>DeepSeek Harness</title><style id="godot-codely-brand-injected">old</style><script id="godot-codely-brand-injected-js">old language override</script></head><body></body></html>'
  const branded = brandFrontendHtml(old, 'body{color:blue}')
  expect(brandFrontendHtml(branded, 'body{color:blue}')).toBe(branded)
  expect(branded).toContain('<title>Godot Codely</title>')
  expect(branded).toContain('lang="en"')
  expect(branded).not.toContain('old language override')
  expect(branded.match(/<style/g)).toHaveLength(1)
  expect(branded).toContain('body{color:blue}')
  expect(() => brandFrontendHtml('<html></html>', '')).toThrow('head is missing')
})

it('uses host presentation copy while retaining native errors and fallback without the host', async () => {
  const source = await readFile(new URL('../node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', import.meta.url), 'utf8')
  const start = source.indexOf('const defaultT = ctx.locale.bind(NS);')
  const end = source.indexOf('const conversationStore =', start)
  expect(start).toBeGreaterThan(0)
  const create = vm.runInNewContext(`(ctx, NS) => { ${source.slice(start, end)} return t }`)
  let host = {}
  const native = { 'hero.headline': 'Into the Unknown', 'error.failed': 'Native error' }
  const t = create({ locale: { bind: namespace => key => (namespace === 'conversation.presentation' ? host : native)[key] ?? key } }, 'conversation')
  expect(t('hero.headline')).toBe('Into the Unknown')
  host = { 'hero.headline': 'Start with a gameplay idea', 'error.failed': 'Must not override' }
  expect(t('hero.headline')).toBe('Start with a gameplay idea')
  expect(t('error.failed')).toBe('Native error')
  host = { 'hero.headline': '从一个玩法，开始创作' }
  expect(t('hero.headline')).toBe('从一个玩法，开始创作')
})
