# 上游与社区协作 / Upstream collaboration

Godot Codely 是社区独立开发与维护的非官方项目。下面的来源与社区关联不表示上游审核、合作或背书。

## 已发布的社区介绍 / Published community introduction

- DSH：[Show Your Plugins! #10104](https://github.com/deepseek-ai/deepseek-harness/discussions/10104)，2026-10-18 发布，包含真实开发截图。
- Godot Forum：[Plugins #145595](https://forum.godotengine.org/t/godot-codely-open-source-ai-workspace-for-game-creation-early-development/145595)，2026-10-18 审核通过并公开，正文和真实截图已核对。 / Approved and public on 2026-10-18; project text and screenshot verified.

## 项目来源

| 项目 | 本项目与其关系 | 仓库 |
| --- | --- | --- |
| DeepSeek Harness | 复用 Agent runtime、Web UI 和插件机制 | https://github.com/deepseek-ai/deepseek-harness |
| DSH Desktop | Electron 宿主的 fork 来源，保留其版权与许可证 | https://github.com/dataelement/dsh-desktop |
| Godot Engine | 集成的游戏引擎，连接 CLI、编辑器与工程工作流 | https://github.com/godotengine/godot |

本项目：https://github.com/hhhh124hhhh/godot-codely-desktop 。试用请阅读本项目 Releases 的平台、版本和已知限制；上游安装包不包含本项目新增能力。

## 展示与反馈入口

- DSH：[Show Your Plugins!](https://github.com/deepseek-ai/deepseek-harness/discussions/categories/show-your-plugins)。遵守[专区规则](https://github.com/deepseek-ai/deepseek-harness/discussions/2004)：一个项目一个主题，标题采用 `DSH | Godot Codely | ...`，显著注明非官方，附项目链接、集成说明和真实截图。
- Godot：[官方社区入口](https://godotengine.org/community/)与[论坛](https://forum.godotengine.org/)。发帖前核对 Plugins 等适用分类规则，注明开发阶段、模型配置要求和已验证范围。
- 本项目：[Issues](https://github.com/hhhh124hhhh/godot-codely-desktop/issues) 用于产品缺陷与需求。展示帖发布后在本页登记永久链接；尚未发布的草稿不能作为已建立上游回链的证据。

GitHub Topics 使用 `dsh-plugin`、`godot`、`godot-engine` 帮助发现。Topics 是本仓库元数据，不等于加入官方目录。

## 贡献回流

政策核验日期：2026-10-18。每次实际提交前重新核对官方指南。

- **DSH**：[贡献指南](https://github.com/deepseek-ai/deepseek-harness/blob/master/CONTRIBUTING.md)目前暂不接受外部 PR。通用缺陷通过 Discussions 提供最小复现与修复建议；可复用能力以生态插件贡献。
- **Godot**：[贡献指南](https://github.com/godotengine/godot/blob/master/CONTRIBUTING.md)要求缺陷报告提供最小复现工程及版本信息。引擎缺陷走主仓库 issue/修复 PR，新能力走 [Godot Proposals](https://github.com/godotengine/godot-proposals)。遵守提交时的测试、风格和 AI 披露要求。
- **DSH Desktop**：宿主通用修复先在其仓库查重并核对贡献要求；本项目独有的工作台和 Godot 产品流程在本仓库维护。

每个贡献候选记录：本地 patch ID、原因、最小复现、回归测试、上游讨论/PR、合并提交、首个包含修复的发行版，以及本地补丁退役 PR。只有目标发行版确实包含修复，并且移除补丁后的行为回归通过，才删除补丁。没有真实引擎缺陷时不为宣传制造 Godot issue。

## 持续兼容实施队列

- [#38 总方案](https://github.com/hhhh124hhhh/godot-codely-desktop/issues/38)
- [#39 P0：双上游监测与兼容清单](https://github.com/hhhh124hhhh/godot-codely-desktop/issues/39)
- [#40 P0：补丁台账与自动适配](https://github.com/hhhh124hhhh/godot-codely-desktop/issues/40)
- [#41 P0：组合验收与发布门禁](https://github.com/hhhh124hhhh/godot-codely-desktop/issues/41)
- [#42 P1：贡献回流与补丁退役](https://github.com/hhhh124hhhh/godot-codely-desktop/issues/42)

上述是实施计划，不能据此声称自动跟版已可用。兼容结论必须绑定实际应用提交、DSH/Godot 完整版本、目标平台和验收证据。



## English: upstream collaboration

Godot Codely is an independently maintained, unofficial community project. References to upstream projects do not imply review, partnership, or endorsement.

### Origins and sharing

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) supplies the agent runtime, Web UI, and plugin system.
- [DSH Desktop](https://github.com/dataelement/dsh-desktop) is the upstream Electron host fork. Preserve its copyright and license.
- [Godot Engine](https://github.com/godotengine/godot) is integrated through engine CLI, editor, and project workflows.
- Use this project's [Releases](https://github.com/hhhh124hhhh/godot-codely-desktop/releases) and read their supported platforms and limitations. Upstream desktop installers do not include this fork's additions.

Share the DSH integration in [Show Your Plugins!](https://github.com/deepseek-ai/deepseek-harness/discussions/categories/show-your-plugins), following its [rules](https://github.com/deepseek-ai/deepseek-harness/discussions/2004): one thread per project, a `DSH | Godot Codely | ...` title, an explicit unofficial label, project URL, integration details, and real screenshots. For Godot, use an appropriate category in the [official community](https://godotengine.org/community/) or [forum](https://forum.godotengine.org/) after checking its rules. Register permanent post URLs here only after publication; drafts are not evidence of upstream listing.

The repository topics `dsh-plugin`, `godot`, and `godot-engine` help discovery and do not establish official endorsement.

### Contributing fixes upstream

Policies were checked on 2026-10-18; check the official guidance again before submission.

- DSH's [contribution guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/CONTRIBUTING.md) currently does not accept external PRs. Submit minimal reproductions and proposed fixes through Discussions, or contribute reusable ecosystem plugins.
- Follow [Godot's contribution guide](https://github.com/godotengine/godot/blob/master/CONTRIBUTING.md) for engine bug reports and focused fix PRs, including a minimal reproduction project and exact versions. New engine features belong in [Godot Proposals](https://github.com/godotengine/godot-proposals). Follow the applicable testing, style, and AI disclosure requirements.
- Check DSH Desktop's current contribution requirements and existing reports before proposing general host fixes. Product-specific workbench behavior belongs in this repository.

Track each candidate's local patch ID, cause, minimal reproduction, regression test, upstream discussion/PR, merged commit, first released version containing the fix, and local patch removal PR. Remove a patch only after that released version includes the fix and the original regression passes without it. Do not create engine bug reports solely to promote this project.

### Compatibility implementation queue

[#38](https://github.com/hhhh124hhhh/godot-codely-desktop/issues/38) is the overall plan. Implement [#39 monitoring and compatibility manifests](https://github.com/hhhh124hhhh/godot-codely-desktop/issues/39), [#40 patch tracking and adaptation](https://github.com/hhhh124hhhh/godot-codely-desktop/issues/40), and [#41 combination acceptance and release gates](https://github.com/hhhh124hhhh/godot-codely-desktop/issues/41) as P0 work; [#42 upstream contributions and patch retirement](https://github.com/hhhh124hhhh/godot-codely-desktop/issues/42) is P1, with contribution records established alongside patch tracking.

These are implementation tasks, not claims of working automatic upgrades. Compatibility evidence must identify the exact application commit, DSH/Godot versions, target platform, and completed acceptance stages.
