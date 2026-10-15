# Godot Codely 品牌资源

产品名称为 Godot Codely；桌面、应用界面和 CLI 使用同一机器人身份。

- `build/brand-mark.svg` 是唯一图形源：蓝色、透明背景、无文字，保留耳机、触角、双眼与微笑，适用于小尺寸图标。
- `npm run brand:prepare` 从矢量源生成 `.build/brand-assets` 的 PNG、Windows ICO、macOS ICNS、深浅主题单色 logo 和动画，并安装到 Harness 静态资源目录。postinstall、dev、build、Linux build 和 test 均执行此步骤；不提交生成物。
- 桌面窗口、安装包和 Linux 图标使用生成的彩色版本。侧栏、会话与欢迎页通过同一 `/godot-codely-mark.svg` 蒙版继承 `currentColor`，不复制路径，不另设主题色。
- 两个 CLI 入口共用 `packages/dsh-godot-stack/cli/brand.mjs`，以 `d[o_o]b Godot Codely CLI` 表示终端中的机器人；运行时名称、包标识及 Harness 协议保持各自职责。

`sharp` 是显式锁定的构建依赖，替代图标生成对 macOS `sips/iconutil` 的依赖。ICO/ICNS 容器由固定 PNG 尺寸组装；Windows 安装和 macOS 原生安装包仍需各自 CI 验证，能生成容器不等于已经安装验收。
