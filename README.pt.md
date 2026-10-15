<h1 align="center">
  <img src="build/brand-mark.svg" width="96" alt="Logotipo do Godot Codely" valign="middle" />
  Godot Codely
</h1>

<p align="center">
  Fork MIT público do <a href="https://github.com/dataelement/dsh-desktop">DSH Desktop</a> para ajudar a criar com Godot, sobre o
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

## Este repositório

O Godot Codely altera um projeto Godot com o comando `godot-codely`. O comando usa o preset `godot-codely-lite`, as habilidades do Godot e o MCP do Godot. Arquivos `.tscn` e `.gd` são editados como texto, então o editor do Godot pode ficar fechado. `project.run`, `project.export` e `editor.launch` precisam de `GODOT_PATH`.

O host desktop sob o comando é o DSH Desktop, fixado em `@deepseek-ai/dsh@0.2.0-rc.2`. Este fork publica o código-fonte. As builds assinadas de macOS e o instalador NSIS do Windows no [site upstream](https://www.dshdesktop.com/#download) e nas [versões upstream do GitHub](https://github.com/dataelement/dsh-desktop/releases) são o DSH Desktop original. Esses arquivos deixam de fora o comando, os presets e o MCP de Godot deste repositório.

## Executar a partir do código

É preciso Node.js 22 ou mais recente.

```sh
git clone https://github.com/hhhh124hhhh/godot-codely-desktop.git
cd godot-codely-desktop
npm ci
node packages/dsh-godot-stack/cli/godot-codely.mjs --list-models
```

Uma tarefa usa a configuração de modelo que você mesmo adiciona. A forma do comando está no [readme da stack Godot](packages/dsh-godot-stack/README.md). Não coloque chaves de API no repositório, em issues ou em logs.

```sh
node packages/dsh-godot-stack/cli/godot-codely.mjs "Resuma o projeto Godot atual"
```

O perfil se chama `godot-codely`. Sem `DSH_HOME`, o perfil de linha de comando e as memórias compartilhadas ficam em `~/.godot-codely`. A janela desktop guarda os próprios dados no diretório de dados do aplicativo `godot-codely` (`godot-codely-dev` numa build de desenvolvimento) e não abre o diretório upstream `dsh-desktop`. Ela é outro processo e, ao iniciar, coloca o mesmo preset Godot:

```sh
npm run dev
```

Preparação, verificações e empacotamento estão no [guia de desenvolvimento](docs/development.md). Os limites de execução estão na [arquitetura](docs/architecture.md).

## Comportamento do host que permanece

- O modo PPT grava PPTX editáveis. No macOS e no Windows, as habilidades offline DOCX, PPTX e XLSX vêm com bibliotecas Python. Veja o [guia do runtime PPT](packages/ppt-runtime/README.md).
- Um celular pareado pode continuar uma sessão. O caminho remoto usual é Cloudflare Quick Tunnel. Quando o Cloudflare não está disponível, usa-se Pinggy.
- O modo de segurança bloqueia plugins de terceiros e mantém os dados do usuário. Se a janela não abrir, passe `--safe-mode`. Depois de empacotar este fork no macOS: `open -a "Godot Codely" --args --safe-mode`.
- Presets portáteis de Agent usam [pacotes `.dshpreset`](docs/preset-packages.md).
- O host pode ser empacotado como um DMG/ZIP assinado do macOS ou um instalador NSIS assinado do Windows x64. Este repositório não publicou esses instaladores. Linux x64 possui build AppImage e verificações nativas de CI; use apenas quando a versão escolhida incluir esse arquivo. Linux não inclui o runtime do Office. Windows ARM64 não é suportado. Os passos de assinatura para um pacote futuro estão no [guia de lançamento](docs/release-runbook.md).

## Comunidade upstream

O grupo do WeChat e o Discord abaixo pertencem ao DSH Desktop upstream.

<p align="center">
  <img src="docs/images/wechat-group-20260815.png" width="220" alt="QR code do grupo WeChat do DSH Desktop upstream" /><br />
  <a href="https://discord.gg/7Xgf3qe3Qp">Discord do DSH Desktop upstream</a>
</p>

## Contribuir

- [Contribuir](CONTRIBUTING.md)
- [Guia de desenvolvimento](docs/development.md)
- [Arquitetura](docs/architecture.md)

Antes de uma alteração, execute `npm test`, `npm run typecheck` e `npm run build`, e percorra o fluxo que você tocou.

## Licença

O Godot Codely é distribuído sob a [Licença MIT](LICENSE). O aviso de copyright nesse arquivo permanece com a DataElement, autora do desktop upstream. O DeepSeek Harness e as árvores de Godot MCP incluídas mantêm as próprias licenças.
