<h1 align="center">
  <img src="docs/images/readme-logo-black-rounded.svg" width="64" alt="Logotipo de Godot Codely" valign="middle" />
  Godot Codely
</h1>

<p align="center">
  Fork MIT público de <a href="https://github.com/dataelement/dsh-desktop">DSH Desktop</a> para ayudar a crear con Godot, sobre
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

## Este repositorio

Godot Codely modifica un proyecto de Godot con el comando `godot-codely`. El comando usa el preset `godot-codely-lite`, las habilidades de Godot y el MCP de Godot. Los archivos `.tscn` y `.gd` se editan como texto, así que el editor de Godot puede permanecer cerrado. `project.run`, `project.export` y `editor.launch` necesitan `GODOT_PATH`.

El host de escritorio bajo el comando es DSH Desktop, fijado en `@deepseek-ai/dsh@0.2.0-rc.2`. Este fork publica el código fuente. Las compilaciones firmadas de macOS y el instalador NSIS de Windows en el [sitio upstream](https://www.dshdesktop.com/#download) y en [GitHub Releases upstream](https://github.com/dataelement/dsh-desktop/releases) son el DSH Desktop original. Esos archivos omiten el comando, los presets y el MCP de Godot de este repositorio.

## Ejecutar desde el código

Hace falta Node.js 22 o posterior.

```sh
git clone https://github.com/hhhh124hhhh/godot-codely-desktop.git
cd godot-codely-desktop
npm ci
node packages/dsh-godot-stack/cli/godot-codely.mjs --list-models
```

Una tarea usa la configuración de modelo que añadas tú. La forma del comando está en la [guía del stack de Godot](packages/dsh-godot-stack/README.md). No pongas claves de API en el repositorio, en issues ni en registros.

```sh
node packages/dsh-godot-stack/cli/godot-codely.mjs "Resume el proyecto Godot actual"
```

El perfil se llama `godot-codely`. Si `DSH_HOME` no está definido, el perfil y las memorias compartidas viven en `~/.dsh`. La ventana de escritorio es otro proceso y, al arrancar, coloca el mismo preset de Godot:

```sh
npm run dev
```

La preparación, las comprobaciones y el empaquetado están en la [guía de desarrollo](docs/development.md). Los límites de ejecución están en la [arquitectura](docs/architecture.md).

## Comportamiento del host que se conserva

- El modo PPT escribe PPTX editables. En macOS y Windows, las habilidades sin conexión DOCX, PPTX y XLSX incluyen bibliotecas de Python. Consulta la [guía del runtime PPT](packages/ppt-runtime/README.md).
- Un teléfono emparejado puede continuar una sesión. La ruta remota habitual es Cloudflare Quick Tunnel. Si Cloudflare no está disponible, se usa Pinggy.
- El modo seguro bloquea plugins de terceros y conserva los datos del usuario. Si la ventana no abre, pasa `--safe-mode`. Después de empaquetar este fork en macOS: `open -a "Godot Codely" --args --safe-mode`.
- Los presets portátiles de Agent usan [paquetes `.dshpreset`](docs/preset-packages.md).
- El host puede empaquetarse como un DMG/ZIP firmado de macOS o como un instalador NSIS firmado de Windows x64. Este repositorio no ha publicado esos instaladores. Linux y Windows ARM64 quedan fuera del soporte actual del host. Los pasos de firma para un paquete futuro están en la [guía de publicación](docs/release-runbook.md).

## Comunidad upstream

El grupo de WeChat y Discord de abajo pertenecen al DSH Desktop upstream.

<p align="center">
  <img src="docs/images/wechat-group-20260815.png" width="220" alt="Código QR del grupo de WeChat de DSH Desktop upstream" /><br />
  <a href="https://discord.gg/7Xgf3qe3Qp">Discord de DSH Desktop upstream</a>
</p>

## Contribuir

- [Contribuir](CONTRIBUTING.md)
- [Guía de desarrollo](docs/development.md)
- [Arquitectura](docs/architecture.md)

Antes de un cambio, ejecuta `npm test`, `npm run typecheck` y `npm run build`, y recorre el flujo que tocaste.

## Licencia

Godot Codely se publica bajo la [Licencia MIT](LICENSE). El aviso de copyright de ese archivo sigue siendo de DataElement, los autores del escritorio upstream. DeepSeek Harness y los árboles de Godot MCP incluidos conservan sus propias licencias.
