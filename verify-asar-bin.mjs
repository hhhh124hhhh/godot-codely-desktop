// verify-asar-bin.mjs — 二进制搜索 app.asar 内品牌化证据
import { readFileSync } from 'node:fs'
const app = 'D:/godot-codely-desktop/dist/win-unpacked/resources/app.asar'
const buf = readFileSync(app)
const needle = (s) => buf.includes(Buffer.from(s, 'utf8'))
const checks = [
  ['onboarding 品牌名', 'Godot Codely'],
  ['onboarding 副标', '开源 · MIT'],
  ['onboarding GitHub', 'hhhh124hhhh/godot-codely-desktop'],
  ['onboarding 旧鲸鱼路径(应无)', 'M478.318 218C605.318'],
  ['client-ui 品牌名', 'Godot Codely'],
  ['client-ui 旧鲸鱼(应无)', 'BRAND_MARK_PATH'],
  ['index.html title', '<title>Godot Codely</title>'],
  ['index.html 品牌CSS', 'godot-codely-brand-injected'],
  ['index.html 旧标题(应无)', '<title>DeepSeek Harness</title>']
]
for (const [label, s] of checks) console.log(`${needle(s) ? 'PASS' : 'FAIL'} ${label}`)
