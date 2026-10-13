# Godot Codely 对标 Tuanjie Cowork 检查

检查日期：2026-10-13。源码基线：`9a2718d`，包含面板 LLM 流式对话提交和 OCU 修复 `42dc1a7`。

后续状态：共享仓库的 `033c16c` 已新增面板直连 LLM 的工具循环，所以下文 P0 面板缺少工具循环是基线时的发现；Harness 审批、取消和会话恢复接入仍待验收。此次分工后的 MCP 独立构建闭包修复与实际检查见 [运行时构建说明](godot-runtime-build.md)，豆包独立任务见 [任务清单](doubao-godot-task-list.md)。这些后续进展不改变下面隔离探针的历史结果。

结论：通用 Agent 基础主要已由 Harness 提供。当前差距集中在 **新安装可运行、Godot 专家配置与技能的实际加载、编辑器面板接入完整 Agent、引擎实时上下文和验证能力**。不能用工具数量、README 勾选或这台开发机的既有 Profile 替代交付验收。

## 检查依据与边界

- 复核了当时 REA 工作目录中的《Tuanjie-Cowork-构造拆解》《Codely-提示词技能体系拆解与Godot蓝图》《godot-extensions-融合建议》，以及已有前端扫描记录。此次没有重新执行 REA PE 反编译。
- 当前本地 Cowork 启动器文件版本为 `2.1.2-stable`；这只标识启动器，不能据此推断全部内置 Agent 与前端资源版本。
- 另查当前官方文档，分别核对模式、子代理、模型槽位、实时编辑器工具、工程索引和资产生成。官方文档中的能力不等于本地安装每项均已启用，Unity Insight 官方默认关闭。
- 读取仓库的包、插件、面板、Bridge、Godot MCP、LSP、记忆、技能和构建入口；在独立临时 DSH_HOME 验证 provisioning、技能发现与记忆契约。
- 没有向真实模型发送付费请求，没有执行桌面截图、点击、输入，也没有修改现有用户 Profile、凭据或业务源码。

## 已有基础，不应再列为“从零缺失”

| 能力 | 当前证据 | 判断 |
| --- | --- | --- |
| Agent Loop、文件/终端工具、计划与审批、会话、压缩、token meter | 根 package.json 已声明相应 Harness 包 | 基础存在；本次未逐项重验整套桌面 UI |
| 通用子代理与控制 UI | `dsh-subagent-*`、`dsh-tool-subagent*`、`dsh-client-ui-subagent` | 基础存在；Godot 专家配置的分发另有缺口 |
| 场景、节点、脚本、动画、TileMap、UI、物理等文本操作 | Godot MCP composite tools | 有实现，不能等同编辑器实时对象操作 |
| GDScript 诊断 | `lsp_diagnostics` | 已有诊断工具；完整语义查询仍缺 |
| 图像、精灵图、TTS | `generate_image`、`generate_sprite`、`text_to_speech` | 已有工具；其他资产流程另列 |
| 记忆与领域斜杠命令 | memory 模块、CLI、插件 memory/status 命令 | 已有实现；可靠性和入口一致性另列 |
| OCU 启动和工具发现 | `42dc1a7` 的网关回归与实际 MCP/Harness 注册验收 | 启动链路已修复；真实界面动作未验收 |
| 面板文本流式对话 | `9a2718d` 的 `llm_client.gd` | 流式聊天已实现，尚不具备 Harness 多步工具循环 |

## 缺口清单

P0 为基本交付/主路径阻断；P1 为显著影响开发任务成功率的能力；P2 为扩展或体验完善。以下“未见”限定在此次检查的 Godot 集成与构建入口，不是对整个 Harness 生态的断言。

| 优先级 | 能力 | 当前不足与影响 | 主要证据 |
| --- | --- | --- | --- |
| P0 | 首次安装与运行时闭包 | 根 build 没有 Godot MCP 编译步骤；server build 被 Git 忽略。provisioning 排除 node_modules，已有 build 时仍可能报告 configured 并写注册项。干净 home 实测 SDK 缺失，server 退出 1；开发机手工安装掩盖了问题 | [插件 provisioning](../packages/dsh-godot-stack/index.js)、根 package.json、server .gitignore；探针 A |
| P0 | 完整 Godot 预设与技能加载 | 包内 `godot-codely-lite` 实际是 384 字节、3 行元数据的文件，缺少完整预设目录与 agent.cordis.yml。迁移器只遍历目录，因此忽略此文件。包内 skills 没有看到接入当前 filesystem provider 的 roots 配置；临时默认发现为空。即使显式加入包 skills 根，只发现索引、记忆、联网 3 项，7 个子领域没有独立发现；其内容仍可作为索引资源读取 | [预设文件](../packages/dsh-godot-stack/godot-stack/agent-presets/godot-codely-lite)、[迁移器](../src/main/state/legacy-preset-migration.ts)、[技能目录](../packages/dsh-godot-stack/skills/README.md)；探针 A/C |
| P0 | 面板的完整 Agent 执行 | 自然语言分支直接请求 `/chat/completions`，payload 只有 model/messages/stream，没有工具定义及工具结果循环。`/tool` 与快捷按钮是独立的人工调用；Bridge 虽有会话 API，面板没有消费。用户要求“改角色跳跃并验证”时，聊天本身不能自动串起读、改、运行、修复 | [panel.gd](../packages/dsh-godot-stack/godot-stack/addons/godot_codely_ai/panel.gd)、[llm_client.gd](../packages/dsh-godot-stack/godot-stack/addons/godot_codely_ai/llm_client.gd)、[Bridge](../packages/dsh-godot-stack/bridge/bridge.mjs) |
| P1 | Godot 专家子代理出厂配置 | 本机 Profile 有 scene/shader/gdscript 三个具名专家，但仓库 patch 只插入 Godot provisioning 插件，未见这些配置进入权威分发输入。当前 CLI 固定使用 `godot-codely` Profile，新机器不能依赖本机已有内容；角色工具范围、任务限制、模型路由与进度验收也需明确 | [包 patch](../packages/dsh-godot-stack/cordis.patch.yml)、[CLI](../packages/dsh-godot-stack/cli/godot-codely.mjs)；本地 Profile 定点检查 |
| P1 | 实时编辑器上下文与操控 | `state.json` 只在连接成功时写一次，包含路径和场景名；未见选中节点、未保存场景、Inspector 修改、场景切换订阅。editor 工具仅 launch/status；project.run/logs 是外部运行。Cowork 文档有实时编辑器状态、选择、编译、Play 控制，文件 CRUD 不能替代这些信息 | [panel 状态写入](../packages/dsh-godot-stack/godot-stack/addons/godot_codely_ai/panel.gd)、[editor schema](../packages/dsh-godot-stack/godot-stack/mcp/godot-mcp-server/src/better/src/tools/registry.ts)；[Unity Tools](https://codely-docs.tuanjie.cn/features-introduction/unity-tools-guide/) |
| P1 | 工程资产与代码引用索引 | 目前是文件扫描、场景解析、UID 与普通搜索；未见统一的 scene/resource/script 调用及入向/出向引用索引。无法直接回答“谁用这个资源”“改此脚本影响哪些场景”。Cowork 的 Unity Insight 是独立静态索引能力，不是 LSP，也不是实时编辑器控制 | MCP registry 与 composite 实现；[Unity Insight](https://codely-docs.tuanjie.cn/features-introduction/unity-insight-guide/) |
| P1 | LSP 完整语义能力 | 仅暴露 diagnostics。未见 definitions、references、symbols、hover、completion、rename 工具；多文件诊断相关性、断线恢复与并发行为仍需验收。历史表中的“LSP 未做”已经过期，但“有诊断”也不等于完整代码智能 | [LSP tools](../packages/dsh-godot-stack/godot-stack/mcp/godot-mcp-server/src/lsp/tools.ts)、[LSP client](../packages/dsh-godot-stack/godot-stack/mcp/godot-mcp-server/src/lsp/lsp-client.ts) |
| P1 | 视觉与可交互功能验证 | 未见 Godot 游戏视图/相机截图、游戏输入驱动和图像回传统一工具链。OCU 已验证启动，但其桌面状态不能自动替代游戏内部视图、模型的 image 能力声明和实际功能断言。quality-gates 技能里的流程描述尚不能证明这些步骤自动执行；性能采集也未见专用接口 | registry、quality-gates 技能、OCU 验证报告；[Unity Tools](https://codely-docs.tuanjie.cn/features-introduction/unity-tools-guide/) |
| P1 | 记忆边界与恢复 | MCP recall 没有复用 topic 校验，自建样本中 `../outside` 会读到记忆根外的 Markdown；remember 覆盖文件没有自动备份。备份仅写在技能指令里，执行器不保证。CLI 与桌面默认 DSH_HOME 不同，“自动跨入口共享”文案也需要明确迁移/共享策略 | [memory.ts](../packages/dsh-godot-stack/godot-stack/mcp/godot-mcp-server/src/memory/memory.ts)、[memory skill](../packages/dsh-godot-stack/skills/godot-memory/SKILL.md)、CLI 与宿主路径；探针 B |
| P2 | 模式、审批与改动恢复接缝 | Harness 有计划/审批能力，面板直连 LLM/MCP 不进入其会话策略。未见面板计划/仅问答模式、统一审批事件、修改 diff、接受/拒绝或 Editor Undo 集成。不能把 CLI `--permission` 的存在当成面板路径已受同一策略控制 | panel、Bridge、CLI、MCP client；[Cowork 模式说明](https://codely-docs.tuanjie.cn/guides/core-workflows/) |
| P2 | 会话、上下文与模型统一 | 面板历史仅保存在内存并截取最近 20 条；没有持久会话重开、跨桌面端接续、token 预算或分段用量。面板 llm_config、CLI Profile 与桌面配置是不同入口。底层已有会话、压缩、meter，不应另造 runtime，应统一接入；主/快/视觉/子代理模型分工尚未见 Godot 产品配置闭环 | panel、llm_client、CLI、package.json；[模型槽位](https://codely-docs.tuanjie.cn/features-introduction/model-slot-overrides/) |
| P2 | 完整资产生产流程 | 图像和 TTS 已有，未见文生 3D、绑定/动画、音乐/音效、表面材质、资产检索及结果审阅的完整流程。`export_mesh_library` 是转换/导出，不能计作文生 3D；生成精灵整图不等于自动切帧并建立动画资源 | [image-gen](../packages/dsh-godot-stack/godot-stack/mcp/godot-mcp-server/src/image-gen/image-gen.ts)、registry；[官方资产生成范围](https://codely-docs.tuanjie.cn/ai-generation-tools/intro/) |
| P2 | 登录态浏览与 IDE 专项接入 | web-access 是方法论技能，Harness 有搜索/抓取；未见 Godot 产品的 Chrome CDP 登录态复用与浏览器工具分发。历史 REA 记录中的 JetBrains/IDE 变体也未见对应 Godot 接入。属于可选扩展，优先级低于引擎主流程 | [web-access skill](../packages/dsh-godot-stack/skills/godot-web-access/SKILL.md)、包与构建目录；REA 历史拆解 |

## 隔离探针结果

探针只在自动创建的临时目录读写；退出后删除全部样本，不动真实记忆/凭据/项目。

### A：首次 provisioning

在空 DSH_HOME 调用实际 Godot 插件 apply，用自建 logger 收集状态，commands 注入不启动业务。再用真实 Node 启动复制后的 server：

```json
{"presetIsMetadataFile":true,"serverExit":1,"missingSdk":true,"provisionReportedConfigured":true}
```

本机源目录已有 build，所以此实验是在“已有开发构建”的较有利条件下仍复现缺依赖；干净 checkout 还会遇到根 build 未生成 Godot MCP 的问题。此次未重建完整正式安装包。

### B：记忆契约

设置独立 `GODOT_CODELY_MEMORY_DIR`，在其父目录创建唯一标记样本，调用 recall 与两次 remember：

```json
{"readsOutsideMemoryRoot":true,"backedUpOnOverwrite":false,"finalContent":"second"}
```

### C：技能发现

使用锁文件对应的实际 FileSystemSkillProvider，关闭 watcher、指定空临时 home/agents root；分别测试默认发现和显式加入包内 skills：

```json
{"freshDefaultSkills":[],"explicitlyAddingPackageSkills":["godot-skill-index","godot-memory","godot-web-access"]}
```

当前 provider 按根目录一层发现 SKILL.md，嵌套领域文件不会自动成为独立候选。仍可经索引的资源读取访问；修复时需明确采用独立技能发现还是索引+资源模式，并验证路由。

## 建议实施顺序与完成判据

1. **先交付可用的 Godot 安装闭包**：补 MCP 构建/依赖装配，修完整 preset、技能 roots 和专家配置。空 home + 中立 cwd 启动时，预设可选、技能真实可激活、Godot MCP 能完成工具发现，失败必须报告失败阶段。
2. **统一面板与 Harness 会话**：面板发送自然语言后，由同一 Harness 执行工具、审批、子代理、取消和会话恢复。用“改跳跃参数并运行验证”验收真实工具事件、文件变化和验证结果；不只看模型回复。
3. **补实时编辑器与视觉验证**：选中节点/切场景/未保存修改反映到 Agent；运行场景、截图入视觉模型上下文、模拟输入并记录断言。写操作有可预览和恢复结果。
4. **并行修可靠性缺陷**：记忆 recall 校验与覆盖备份，统一入口存储策略，补安装失败与加载失败回归。此处“并行”是开发排序建议，本次检查未启动子 Agent。
5. **再扩展索引和资产能力**：Godot 引用图、完整 LSP、模型分工、3D/动画/音频生产流程；CDP/IDE 接入按真实需求追加。

不要把 Codex CLI 外挂列为 Cowork 原生必备能力：之前定位到的链路是项目级 runner，并非 Cowork 自带 Codex 调度。本项目要接 Codex 可以单独设计，但不能据此扣减原生能力对标。

## 验收证据的限制

- 此次新增执行的是上述隔离探针和静态/分发入口检查，未重新运行整仓测试。此前 OCU 修复已通过 7 项专项、typecheck、build 与实际工具注册；当时完整回归仍有失败及一个 worker 异常，不能描述为全绿，也不能未经复现把所有失败都归结为环境。
- 未重新验收当前面板的付费流式对话、全套桌面 UI 或真实 Godot 点击/截图。
- 旧 AGENTS 进度表与 README 有冲突，工具数 23 已落后于先前实测 29。50–70% token 节省属于历史文案，本次未测量，不作为已验证收益。
- 历史拆解把 Unity Insight 与 LSP 通道放在同一分类；按当前官方文档，两者应分别对标。不能以 lsp_diagnostics 宣称已具备工程引用索引。

## 2026-10-13 晚间复核

上面的探针 JSON 和「当前不足」表是 `9a2718d` 当时的记录，不改写。这一节只回答那些不足现在还在不在。

复核基线：当日拉取的 `origin/main` `ebf5f95`。`7817adf` 是其祖先。PR #1（`ba309f9`，实时编辑器上下文）仍是草稿，未合入。专家复制和记忆共享有专项回归；没有重跑整仓测试，也没有发布新的安装包。

修完计数：在 `ebf5f95` 上是 **2/13**。随后的分发修补把专家预设复制和记忆共享目录也收口，合入后是 **4/13**。PR #1 仍只把「实时编辑器上下文与操控」从「未修」变成「部分」，不增加已修完项。

| 优先级 | 能力 | origin/main | 含未合入 PR #1 | 证据 |
| --- | --- | --- | --- | --- |
| P0 | 首次安装与运行时闭包 | 已修 | 已修 | `e8134a5`。根 `npm run godot:build` 生成独立运行时；`packages/dsh-godot-stack/mcp-runtime.mjs` 在缺产物或摘要不符时拒绝登记。`test/godot-runtime.test.mjs` 覆盖空 home 启动、损坏产物不写 `configured`。尚未据此发布新的安装包 |
| P0 | 完整 Godot 预设与技能加载 | 已修 | 已修 | `2285e1a` 把 `godot-codely-lite` 恢复成含 `agent.cordis.yml` 的目录，`index.js` 的 `provisionPreset` 会复制它。`ebf5f95` 把 10 个技能平铺到 `<home>/skills`，同文件的回归断言这些 `SKILL.md`。这次没有重跑 FileSystemSkillProvider |
| P0 | 面板的完整 Agent 执行 | 部分 | 部分 | `033c16c` 的 LLM 工具回喂仍在 `llm_client.gd`。`6afc265` 让面板经 `harness_client.gd` 使用会话、审批、取消和预览，`test/godot-bridge.test.mjs` 覆盖审批领取。建议里的「改跳跃并运行验证」没有做 |
| P1 | Godot 专家子代理出厂配置 | 已修 | 已修 | `4470733` 写了三份预设的工具域、失败出口，模型沿用父级 `{{model}}`。`index.js` 的 `provisionGodotPresets` 现在和 lite 一起复制到 `.agent-presets`。`test/godot-distribution-gaps.test.mjs` 检查四份预设都进了空 home。没有跑真实模型委派 |
| P1 | 实时编辑器上下文与操控 | 未修 | 部分 | `origin/main` 的 `panel.gd` `_write_state` 仍在连接时写一次，字段没有选中节点或未保存标记。`registry.ts` 的 editor 动作仍是 `launch`/`status`。PR #1 订阅选择、切场景、保存和撤销并发布这些字段；Play 与编译控制仍没有 |
| P1 | 工程资产与代码引用索引 | 未修 | 未修 | 仍是场景解析、UID 和搜索。没有统一的入向/出向引用工具 |
| P1 | LSP 完整语义能力 | 未修 | 未修 | `src/lsp/tools.ts` 只注册 `lsp_diagnostics` |
| P1 | 视觉与可交互功能验证 | 未修 | 未修 | `42dc1a7` 修的是 OCU 启动。没有游戏视图截图、输入驱动或断言工具 |
| P1 | 记忆边界与恢复 | 已修 | 已修 | `ebf5f95` 拒绝 `../outside` 并在覆盖前写 `.bak`。记忆目录固定为 `~/.dsh/memories`（或 `GODOT_CODELY_MEMORY_DIR`），不再跟随桌面的 `DSH_HOME`。旧 harness 目录里独有的主题会复制过去，不覆盖已有共享文件。`test/godot-runtime.test.mjs` 与 `test/godot-distribution-gaps.test.mjs` 覆盖这两点。斜杠命令 `/memory` 使用同一目录和同一 topic 校验 |
| P2 | 模式、审批与改动恢复接缝 | 部分 | 部分 | 面板 Harness 路径有审批、取消和预览。没有计划/仅问答模式，也没有把 diff 接进 Editor Undo |
| P2 | 会话、上下文与模型统一 | 部分 | 部分 | `harness_client.gd` 把 `sessionId` 存在工程内 `res://.godot/godot-codely-session.json`。独立 LLM 历史仍截到最近 20 条。面板 `llm_config`、CLI Profile 和桌面配置仍是不同入口 |
| P2 | 完整资产生产流程 | 未修 | 未修 | 图像和 TTS 在写这份清单时已经有。`6fcfbfb` 只增加 `media-generation` 技能说明。没有文生 3D、绑定、音乐或审阅流程 |
| P2 | 登录态浏览与 IDE 专项接入 | 未修 | 未修 | `skills/godot-web-access/SKILL.md` 仍是浏览方法论。没有 Chrome CDP 或 JetBrains 接入 |
