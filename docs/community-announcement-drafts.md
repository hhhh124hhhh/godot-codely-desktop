# 社区项目介绍草稿

状态：DSH 已发布至 [Show Your Plugins! #10104](https://github.com/deepseek-ai/deepseek-harness/discussions/10104)，含真实截图；Godot Forum 仍为未发布草稿。下文保留初始文案供维护参考，勿重复发布 DSH 主题。

## DSH：Show Your Plugins!

标题：DSH | Godot Codely | 面向 Godot 游戏创作的开源 AI 工作台

> 非官方项目，由社区成员独立开发和维护。

项目地址：https://github.com/hhhh124hhhh/godot-codely-desktop

Godot Codely 是基于 DSH Desktop 的公开 MIT fork，复用 DeepSeek Harness 的 Agent runtime、Web UI、会话和插件机制，通过 Godot 预设、技能与 MCP 集成游戏创作流程。

目前重点是 Godot 工程上下文、脚本与场景文件修改，以及引擎运行和日志反馈。项目处于早期开发阶段；请以本仓库具体 Release 的平台、能力和已知限制为准，并自行配置模型。DSH Desktop 上游安装包不包含本项目新增的 Godot 能力。

我们正在整理 DSH 与 Godot 的持续兼容机制，也希望将通用问题的最小复现、修复建议和可复用插件回馈社区。自动跟版仍是实施计划：
https://github.com/hhhh124hhhh/godot-codely-desktop/issues/38

欢迎对插件边界、Godot 集成和上游兼容给出反馈，或通过本仓库 issue / PR 参与。
感谢 DeepSeek Harness、DSH Desktop、Godot 及集成组件的开源贡献者。

截图：发布前上传本地真实工作台截图。可使用 2026-10-18 Windows 临时工程原生验收截图，并标注为开发构建、Godot 4.6.3；它不证明已安装发行版或全部编辑器功能通过。

## Godot Forum：适用的 Plugins / 项目展示分类

Title: Godot Codely — an open-source AI workspace for Godot game creation (early development)

Godot Codely is an unofficial community project, independently maintained and not endorsed by Godot or DeepSeek.

Source: https://github.com/hhhh124hhhh/godot-codely-desktop

It is a public MIT fork of DSH Desktop, using DeepSeek Harness for the agent runtime, conversations, and plugin UI. The Godot integration combines presets, skills, and MCP tools for working with project context, GDScript and scene files, and engine execution/logs.

This is an early development project. Please check this repository's release notes for the actual supported platforms and limitations. You need to configure your own model; the original DSH Desktop downloads do not contain this fork's Godot integration.

I would welcome feedback on useful Godot workflows, editor integration, and reproducible compatibility problems. We are also tracking continuous compatibility and upstream contributions:
https://github.com/hhhh124hhhh/godot-codely-desktop/issues/38
https://github.com/hhhh124hhhh/godot-codely-desktop/issues/42

Engine bugs will be reduced to minimal reproduction projects and reported through Godot's contribution process. Product-specific issues and contributions are welcome in our own repository.

Screenshot: attach the real development-build workbench image, captioned with the exact environment. Do not imply that this demonstrates complete agent, editor, or installer acceptance.
