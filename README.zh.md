<h1 align="center">
  <img src="build/brand-mark.svg" width="96" alt="Godot Codely Logo" valign="middle" />
  Godot Codely
</h1>

<p align="center">
  <a href="https://github.com/dataelement/dsh-desktop">DSH Desktop</a> 的公开 MIT fork，用来辅助 Godot 创作，运行在
  <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a> 上。
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ru.md">Русский</a> · <a href="README.es.md">Español</a> · <a href="README.pt.md">Português</a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-171513.svg" /></a>
  <img alt="macOS" src="https://img.shields.io/badge/macOS-Apple%20Silicon%20%7C%20Intel-171513.svg" />
  <img alt="Windows" src="https://img.shields.io/badge/Windows-x64-171513.svg" />
</p>

## 这个仓库

Godot Codely 用 `godot-codely` 命令改 Godot 工程。命令走 `godot-codely-lite` 预设、Godot 技能和 Godot MCP。`.tscn` 与 `.gd` 按文本修改，Godot 编辑器不必一直开着。`project.run`、`project.export` 和 `editor.launch` 需要 `GODOT_PATH`。

命令下面的桌面宿主是 DSH Desktop，锁定 `@deepseek-ai/dsh@0.2.0-rc.2`。本 fork 发布源码。[上游网站](https://dshdesktop.com/zh/)和[上游 GitHub Releases](https://github.com/dataelement/dsh-desktop/releases) 上的 macOS 签名包和 Windows NSIS 安装包是原版 DSH Desktop，里面没有本仓库的 Godot 命令、预设和 MCP。

## 从源码运行

需要 Node.js 22 或更新版本。

```sh
git clone https://github.com/hhhh124hhhh/godot-codely-desktop.git
cd godot-codely-desktop
npm ci
node packages/dsh-godot-stack/cli/godot-codely.mjs --list-models
```

任务使用你自己添加的模型配置。命令写法见 [Godot 栈说明](packages/dsh-godot-stack/README.md)。API key 不要写进仓库、Issue 或日志。

```sh
node packages/dsh-godot-stack/cli/godot-codely.mjs "概括当前 Godot 工程"
```

Profile 名称是 `godot-codely`。未设置 `DSH_HOME` 时，命令行 Profile 和共用记忆在 `~/.godot-codely`。桌面窗口的数据在应用数据目录 `godot-codely`（开发构建是 `godot-codely-dev`），不读取上游的 `dsh-desktop`。桌面窗口是另一个进程，启动时会落位同一套 Godot 预设：

```sh
npm run dev
```

环境、检查和打包见[开发指南](docs/development.md)。运行边界见[架构说明](docs/architecture.md)。

## 一并带上的宿主行为

这些能力属于 fork 过来的桌面宿主。

- PPT 模式输出可继续编辑的 PPTX。macOS 和 Windows 上，离线 DOCX、PPTX、XLSX 技能带有捆绑的 Python 库。详见 [PPT 说明](packages/ppt-runtime/README.md)。
- 配对后的手机可以接着会话。远程路径通常是 Cloudflare Quick Tunnel。Cloudflare 不可用时用 Pinggy。
- 安全模式会挡住第三方插件，并保留用户数据。窗口打不开时加上 `--safe-mode`。本 fork 在 macOS 上打包之后：`open -a "Godot Codely" --args --safe-mode`。
- 可移植 Agent Preset 使用 [`.dshpreset` 包](docs/preset-packages.md)。
- 宿主可以打成已签名的 macOS DMG/ZIP，或已签名的 Windows x64 NSIS 安装包。在 GitHub 配好签名 secrets 与 Windows 自托管签名机后，用 Actions 里的 **Orchestrate desktop release** 可一键触发正式版或预发布并写入 [Releases](https://github.com/hhhh124hhhh/godot-codely-desktop/releases)。说明见[发布自动化](docs/release-automation.md)与[发布手册](docs/release-runbook.md)。Linux 和 Windows ARM64 不在宿主当前支持范围内。

## 上游社区

下面的微信群和 Discord 属于上游 DSH Desktop。

<p align="center">
  <img src="docs/images/wechat-group-20260815.png" width="220" alt="上游 DSH Desktop 微信群二维码" /><br />
  <a href="https://discord.gg/7Xgf3qe3Qp">上游 DSH Desktop Discord</a>
</p>

## 参与修改

- [贡献说明](CONTRIBUTING.md) — 如何报告问题，以及提交拉取请求前要跑的检查
- [开发指南](docs/development.md) — 本地环境、验证、补丁与打包
- [运行架构](docs/architecture.md) — 启动、数据、安全边界、恢复、手机连接与更新

提交前运行 `npm test`、`npm run typecheck` 和 `npm run build`，并实际走一遍改到的流程。

## 许可证

Godot Codely 采用 [MIT License](LICENSE)。该文件里的版权声明仍属于上游桌面作者 DataElement。DeepSeek Harness 和随仓库附带的 Godot MCP 目录保留各自的许可证。
