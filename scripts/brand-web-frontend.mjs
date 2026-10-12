/**
 * brand-web-frontend — Godot Codely 品牌注入脚本（postinstall 后执行）。
 *
 * 直接修改 node_modules/@deepseek-ai/dsh-web-frontend/dist：
 *   1. index.html: <title>DeepSeek Harness</title> → Godot Codely
 *   2. 注入品牌 CSS：覆盖 DSH 主题色变量为 Godot Codely 品牌深蓝
 *   3. 注入品牌 script：运行时强设 document.title + lang
 *
 * 界面文案/图形（侧边栏品牌座、首启欢迎页）在 packages 各 client.js 源码中定制，
 * 不在此脚本处理。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = process.argv[2] ?? join(here, '..', 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist')

// Godot Codely 品牌色（深蓝家族，呼应机器人 Logo）
const BRAND_PRIMARY = '#1f4e79'      // 主品牌深蓝
const BRAND_ACCENT = '#4a90d9'       // 强调亮蓝
const BRAND_BG_DARK = '#0d1b2a'      // 暗色背景基调

const BRAND_CSS = `
:root{
  --dsw-alias-brand-primary:${BRAND_PRIMARY} !important;
  --dsw-alias-brand-primary-hover:#173d5e !important;
  --dsw-alias-brand-primary-active:#122f4b !important;
  --dsw-alias-brand-accent:${BRAND_ACCENT} !important;
  --dsw-alias-brand-soft:rgba(31,78,121,.12) !important;
  --dsw-alias-brand-soft-hover:rgba(31,78,121,.18) !important;
}
html[data-theme="dark"]{
  --dsw-alias-bg-base:${BRAND_BG_DARK} !important;
  --dsw-alias-brand-primary:#3d7ab3 !important;
  --dsw-alias-brand-primary-hover:#4a8ac6 !important;
}
`

const BRAND_SCRIPT = `
(function(){
  var apply=function(){document.title="Godot Codely"};
  apply();document.addEventListener("DOMContentLoaded",apply);
  if(document.documentElement){document.documentElement.lang="zh-CN"}
})();
`

async function main() {
  const indexPath = join(dist, 'index.html')
  let html = await readFile(indexPath, 'utf8')

  html = html.replace('<title>DeepSeek Harness</title>', '<title>Godot Codely</title>')
  if (!html.includes('godot-codely-brand-injected')) {
    html = html.replace('</head>',
      `  <style id="godot-codely-brand-injected">${BRAND_CSS}</style>\n` +
      `  <script id="godot-codely-brand-injected-js">${BRAND_SCRIPT}</script>\n</head>`)
  }

  await writeFile(indexPath, html, 'utf8')
  console.log(`brand-web-frontend: title/CSS/script injected -> ${indexPath}`)

  // 兜底：favicon 若还是默认名，确保存在品牌 logo
  const favPath = join(dist, 'dsh-desktop-logo.png')
  try {
    await readFile(favPath)
  } catch {
    console.warn('brand-web-frontend: dsh-desktop-logo.png missing (M0 install-brand-assets should have placed it)')
  }
}

main().catch((error) => {
  console.error('brand-web-frontend failed:', error?.message ?? error)
  process.exitCode = 1
})
