# Contributing

This repository is [hhhh124hhhh/godot-codely-desktop](https://github.com/hhhh124hhhh/godot-codely-desktop), a public MIT fork of [dataelement/dsh-desktop](https://github.com/dataelement/dsh-desktop). It keeps the DSH Desktop host and adds the `godot-codely` Godot path. The copyright notice in [LICENSE](LICENSE) stays with the upstream authors. Do not remove it.

## Setup

```sh
git clone https://github.com/hhhh124hhhh/godot-codely-desktop.git
cd godot-codely-desktop
npm ci
```

Node.js 22 or later is required. The [development guide](docs/development.md) covers profiles, patches, and packaging. Runtime boundaries are in the [architecture notes](docs/architecture.md).

## Before a pull request

```sh
npm test
npm run typecheck
npm run build
```

Also exercise the real flow you changed. Pull requests to `main` already run the Windows job in [`.github/workflows/release.yml`](.github/workflows/release.yml), which installs dependencies and runs the test suite, typecheck, and build. A green local run does not replace that job, and that job does not replace a check you did not run.

Say which checks you ran and which you did not. Do not put API keys, tokens, or full credential files in the pull request, logs, screenshots, or fixtures.

## Issues

Use the templates for bugs and feature requests. Include the operating system, whether you built from this fork's source, and the command or screen that failed. Leave out secrets.

## Conduct and vulnerabilities

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and [SECURITY.md](SECURITY.md).
