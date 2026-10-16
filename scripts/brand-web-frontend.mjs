/** Build-time host branding. Native locale owns the document language. */
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function brandFrontendHtml(html, css) {
  const style = `<style id="godot-codely-brand-injected">${css}</style>`
  const clean = html.replace(/\s*<style id="godot-codely-brand-injected">[\s\S]*?<\/style>/g, '')
    .replace(/\s*<script id="godot-codely-brand-injected-js">[\s\S]*?<\/script>/g, '')
  if (!clean.includes('</head>')) throw Error('Godot Codely branding: HTML head is missing')
  return clean.replace(/<title>[^<]*<\/title>/, '<title>Godot Codely</title>').replace(/\s*<\/head>/, `\n${style}\n</head>`)
}

export async function brandFrontend(dist) {
  const css = await readFile(new URL('../build/brand-theme.css', import.meta.url), 'utf8')
  const index = join(dist, 'index.html')
  await writeFile(index, brandFrontendHtml(await readFile(index, 'utf8'), css))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await brandFrontend(process.argv[2] || fileURLToPath(new URL('../node_modules/@deepseek-ai/dsh-web-frontend/dist', import.meta.url)))
}
