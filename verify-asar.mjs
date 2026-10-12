// verify-asar.mjs — 核验 app.asar 内 UI 品牌化是否生效
import asar from '@electron/asar'

const app = 'D:/godot-codely-desktop/dist/win-unpacked/resources/app.asar'
const targets = [
  ['\\node_modules\\dsh-desktop-onboarding\\client.js', 'onboarding', ['Godot Codely', '开源 · MIT', 'hhhh124hhhh']],
  ['\\node_modules\\dsh-desktop-client-ui\\client.js', 'client-ui', ['Godot Codely', 'BRAND_MARK_VIEWBOX']],
  ['\\node_modules\\@deepseek-ai\\dsh-web-frontend\\dist\\index.html', 'index.html', ['<title>Godot Codely</title>', 'godot-codely-brand-injected']]
]
for (const [path, label, checks] of targets) {
  try {
    const buf = asar.extractFile(app, path)
    const text = buf.toString('utf8')
    const results = checks.map((c) => `${c}=${text.includes(c)}`)
    console.log(`[${label}] ${results.join(' ')}`)
  } catch (error) {
    console.log(`[${label}] ERROR ${error.message}`)
  }
}
