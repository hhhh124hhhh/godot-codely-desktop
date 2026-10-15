<h1 align="center">
  <img src="build/brand-mark.svg" width="96" alt="Godot Codely logo" valign="middle" />
  Godot Codely
</h1>

<p align="center">
  A public MIT fork of <a href="https://github.com/dataelement/dsh-desktop">DSH Desktop</a> for assisting Godot creation, built on
  <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a>.
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ru.md">Русский</a> · <a href="README.es.md">Español</a> · <a href="README.pt.md">Português</a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-171513.svg" /></a>
  <img alt="macOS" src="https://img.shields.io/badge/macOS-Apple%20Silicon%20%7C%20Intel-171513.svg" />
  <img alt="Windows" src="https://img.shields.io/badge/Windows-x64-171513.svg" />
</p>

## This repository

Godot Codely changes a Godot project from the `godot-codely` command. That command uses the `godot-codely-lite` preset, the Godot skills, and the Godot MCP server. `.tscn` and `.gd` files are edited as text, so the Godot editor does not have to stay open. `project.run`, `project.export`, and `editor.launch` need `GODOT_PATH`.

The desktop host under the command is DSH Desktop, pinned to `@deepseek-ai/dsh@0.2.0-rc.2`. This fork publishes source. Signed macOS builds and the Windows NSIS installer on the [upstream website](https://www.dshdesktop.com/#download) and [upstream GitHub Releases](https://github.com/dataelement/dsh-desktop/releases) are the original DSH Desktop. Those files leave out the Godot command, presets, and MCP from this repository.

## Run from source

Node.js 22 or later.

```sh
git clone https://github.com/hhhh124hhhh/godot-codely-desktop.git
cd godot-codely-desktop
npm ci
node packages/dsh-godot-stack/cli/godot-codely.mjs --list-models
```

A task uses a model configuration you add yourself. The command shape is in the [Godot stack readme](packages/dsh-godot-stack/README.md). Leave API keys out of the repository, issues, and logs.

```sh
node packages/dsh-godot-stack/cli/godot-codely.mjs "Summarize the current Godot project"
```

The profile name is `godot-codely`. With `DSH_HOME` unset, the command-line profile and shared memories live under `~/.godot-codely`. The desktop window keeps its own data in the `godot-codely` app-data directory (`godot-codely-dev` for a development build) and does not open the upstream `dsh-desktop` directory. It is a separate process and provisions the same Godot preset when it starts:

```sh
npm run dev
```

Setup, checks, and packaging are in the [development guide](docs/development.md). Runtime boundaries are in the [architecture notes](docs/architecture.md).

## Host behavior that comes along

These parts belong to the forked desktop host.

- PPT mode writes editable PPTX. Offline DOCX, PPTX, and XLSX skills ship with bundled Python libraries on macOS and Windows. See the [PPT runtime guide](packages/ppt-runtime/README.md).
- A paired phone can continue a session. Cloudflare Quick Tunnel is the usual remote path. Pinggy is the fallback when Cloudflare is unavailable.
- Safe Mode blocks third-party plugins and keeps user data. If the window cannot open, pass `--safe-mode`. After you package this fork on macOS: `open -a "Godot Codely" --args --safe-mode`.
- Portable Agent presets use [`.dshpreset` packages](docs/preset-packages.md).
- The host can be packaged as a signed macOS DMG/ZIP or a code-signed Windows x64 NSIS installer. After signing secrets and the Windows self-hosted signer are configured on GitHub, **Orchestrate desktop release** triggers formal or pre-releases into [Releases](https://github.com/hhhh124hhhh/godot-codely-desktop/releases). See [Release automation](docs/release-automation.md) and the [release runbook](docs/release-runbook.md). Linux and Windows ARM64 are outside the host's current support.

## Upstream community

The WeChat group and Discord below are the upstream DSH Desktop community.

<p align="center">
  <img src="docs/images/wechat-group-20260815.png" width="220" alt="Upstream DSH Desktop WeChat group QR code" /><br />
  <a href="https://discord.gg/7Xgf3qe3Qp">Upstream DSH Desktop Discord</a>
</p>

## Contributing

- [Contributing](CONTRIBUTING.md) — issues and the checks to run before a pull request
- [Development guide](docs/development.md) — setup, validation, patches, and packaging
- [Architecture](docs/architecture.md) — startup, data, security boundaries, recovery, phone access, and updates

Before a change, run `npm test`, `npm run typecheck`, and `npm run build`, then exercise the flow you touched.

## License

Godot Codely is released under the [MIT License](LICENSE). The copyright notice in that file stays with DataElement, the upstream desktop authors. DeepSeek Harness and the vendored Godot MCP trees keep their own licenses.
