<h1 align="center">
  <img src="build/app-icon.png" width="96" alt="Логотип Godot Codely" valign="middle" />
  Godot Codely
</h1>

<p align="center">
  Публичный MIT-форк <a href="https://github.com/dataelement/dsh-desktop">DSH Desktop</a> для помощи в создании на Godot, на основе
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

## Этот репозиторий

Godot Codely меняет проект Godot командой `godot-codely`. Команда использует пресет `godot-codely-lite`, навыки Godot и Godot MCP. Файлы `.tscn` и `.gd` правятся как текст, поэтому редактор Godot может быть закрыт. Для `project.run`, `project.export` и `editor.launch` нужен `GODOT_PATH`.

Настольный хост под командой — DSH Desktop на `@deepseek-ai/dsh@0.2.0-rc.2`. Этот форк публикует исходный код. Подписанные сборки macOS и установщик Windows NSIS на [сайте upstream](https://www.dshdesktop.com/#download) и в [релизах upstream](https://github.com/dataelement/dsh-desktop/releases) — это исходный DSH Desktop. В них нет команды Godot, пресетов и MCP из этого репозитория.

## Запуск из исходников

Нужен Node.js 22 или новее.

```sh
git clone https://github.com/hhhh124hhhh/godot-codely-desktop.git
cd godot-codely-desktop
npm ci
node packages/dsh-godot-stack/cli/godot-codely.mjs --list-models
```

Задача использует добавленную вами конфигурацию модели. Форма команды описана в [readme стека Godot](packages/dsh-godot-stack/README.md). Не помещайте API-ключи в репозиторий, Issue и журналы.

```sh
node packages/dsh-godot-stack/cli/godot-codely.mjs "Кратко опиши текущий проект Godot"
```

Имя профиля — `godot-codely`. Если `DSH_HOME` не задан, профиль командной строки и общая память лежат в `~/.godot-codely`. Окно рабочего стола хранит свои данные в каталоге данных приложения `godot-codely` (`godot-codely-dev` для сборочной версии) и не открывает upstream-каталог `dsh-desktop`. Это отдельный процесс; при старте оно размещает тот же пресет Godot:

```sh
npm run dev
```

Подготовка, проверки и упаковка — в [руководстве разработчика](docs/development.md). Границы выполнения — в [архитектуре](docs/architecture.md).

## Поведение хоста, которое остаётся

- Режим PPT пишет редактируемый PPTX. На macOS и Windows офлайн-навыки DOCX, PPTX и XLSX поставляются со встроенными библиотеками Python. См. [PPT runtime](packages/ppt-runtime/README.md).
- Сопряжённый телефон может продолжить сессию. Обычный удалённый путь — Cloudflare Quick Tunnel. Если Cloudflare недоступен, используется Pinggy.
- Безопасный режим блокирует сторонние плагины и сохраняет данные пользователя. Если окно не открывается, передайте `--safe-mode`. После упаковки этого форка на macOS: `open -a "Godot Codely" --args --safe-mode`.
- Переносимые пресеты Agent используют [пакеты `.dshpreset`](docs/preset-packages.md).
- Хост можно собрать как подписанный macOS DMG/ZIP или подписанный установщик Windows x64 NSIS. Этот репозиторий такие установщики не публиковал. Linux и Windows ARM64 сейчас вне поддержки хоста. Шаги подписи для будущей сборки — в [регламенте выпуска](docs/release-runbook.md).

## Сообщество upstream

Группа WeChat и Discord ниже принадлежат upstream DSH Desktop.

<p align="center">
  <img src="docs/images/wechat-group-20260815.png" width="220" alt="QR-код группы upstream DSH Desktop в WeChat" /><br />
  <a href="https://discord.gg/7Xgf3qe3Qp">Discord upstream DSH Desktop</a>
</p>

## Участие

- [Участие](CONTRIBUTING.md)
- [Руководство разработчика](docs/development.md)
- [Архитектура](docs/architecture.md)

Перед изменением выполните `npm test`, `npm run typecheck` и `npm run build`, затем пройдите затронутый сценарий.

## Лицензия

Godot Codely распространяется по [лицензии MIT](LICENSE). Уведомление об авторских правах в файле остаётся за DataElement, авторами upstream-десктопа. DeepSeek Harness и приложенные деревья Godot MCP сохраняют свои лицензии.
