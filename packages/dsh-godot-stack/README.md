# dsh-godot-stack

Godot Codely 预装插件：把 godot-extensions 全家桶打进出厂配置，首启自动落位。

## 内置内容

| 资源 | 落位目标 |
|---|---|
| `godot-stack/agent-presets/godot-codely-lite/`（preset.yml + agent.cordis.yml） | `<dshHome>/.agent-presets/godot-codely-lite` |
| `godot-stack/mcp/godot-mcp-server/`（23 工具 MCP server 源码） | `<dshHome>/.godot/mcp-server` |
| `skills/godot/`（7 个领域技能 + SKILL.md 索引） | 内置技能，由 DSH skill 系统自动发现（bundled） |

`<dshHome>` = `DSH_HOME` 环境变量，未设置时为 `~/.godot-codely`。

## 桌面开发工作台

当前开发源码提供 Godot 项目概览、Lite 开发会话和编辑器基础控制。重建桌面后，在“工作台 → 已安装”启用 **Godot 开发**，再从工作台菜单进入；选择包含 `project.godot` 的项目根目录。

“开始开发”显式使用 `godot-codely-lite`，并保留原生模型选择、审批和取消。检查连接、编辑器运行/停止和刷新资源需要项目中的 Godot Codely 插件已启用并连接。编辑器超时表示结果未知，请检查实际状态后再重试；未保存场景需在 Godot 中处理。

在 Electron 桌面端，项目信息栏还提供选择 Godot 4 可执行文件、打开 Godot、独立运行/停止与运行日志。引擎路径与 MCP 的 `<dshHome>/.godot/godot-path.txt` 共用，优先于自动发现；已存在的工具连接需重连后应用新选择。独立停止仅作用于桌面启动的游戏，不会停止编辑器或 MCP 启动的游戏；退出桌面会停止这些独立游戏，编辑器继续保留。

普通浏览器中显示桌面能力不可用的提示。结构化变更审查仍待后续实现。已安装发行版是否包含这些能力，以具体构建为准。实施计划见 [Issue #20](https://github.com/hhhh124hhhh/godot-codely-desktop/issues/20)。

## 项目事实恢复（G1b / OBSERVED）

源码新增可信 Node 接口 `dsh-godot-stack/governance`：`ProjectStore.create/read/commit` 与只读 `projectHandoff`。状态位于 `<dshHome>/governance/projects/<canonical-root-hash>`，与聊天、Agent、Git 分离。任务进度、Intent/Boundary/STOP、原始授权合同、设计基线、实现指纹与验证记录以同一 revision 事务保存；并发提交必须携带 `projectId + expectedStateRevision`，异步验证还绑定运行及输入指纹。

只有已通过该接口建档的 Godot 工程会在 Agent 提示上下文中恢复事实。桌面桥开启时，已认证的 `/api/godot-desktop/handoff?workspaceId=...` 返回同一份只读交接；尚无普通用户建档/写入 UI，也没有模型写状态工具。可信调用者须自行取得相应记录权限；把 `actor.kind` 填成人类不构成工具执行授权。

此阶段保持 `OBSERVED` 与原有 Harness 权限/完整工具能力。重开不续期授权、不运行任务、不将历史 PASS 视为当前工程验证通过；交接明确标记当前工程和证据有效性尚未重新评估。主副本受损会报告恢复来源，双副本或历史链损坏会拒绝续写并保留最后可核验现场。项目目录移动需要后续显式迁移，不按目录名猜测身份。

设计、复现与验收边界见 [G1b 记录](../../docs/probes/issue-24-g1b.md)。后台执行、强制防护、Gate 判定和新的工作台 UI 留在后续阶段；当前已安装版本不会自动获得源码改动。
## 工作机制

- 插件随 `build/dsh-desktop.patch.yml` 的 `- insert: dsh-godot-stack` 挂载，每次 Harness 启动时 `apply()` 执行。
- 全部 best-effort：失败只写 warning，不阻塞启动。
- MCP 注册：若 `<dshHome>/.godot/mcp-server/build/index.js` 已构建，则把 `mcpServers.godot` 写入 `<dshHome>/settings.json`（不覆盖已有配置）；未构建则只复制源码并提示：
  ```
  cd <dshHome>/.godot/mcp-server && npm install && npm run build
  ```

## 模型套餐（自由选择，对标 cowork 模型市场）

Godot Codely CLI 出厂预置 2 个实测可用的模型套餐，可在运行/会话间自由切换：

| 套餐 | Provider | 模型 | 状态 |
|---|---|---|---|
| Token Plan Qwen | `tokenplan-qwen` | qwen3.8-flash / qwen3.8-max / qwen3.7-plus / qwen3.7-max / deepseek-v4-flash-0731 / deepseek-v4-pro | 出厂预置 |
| Kimi For Coding | `kimi-for-coding` | kimi-for-coding | 出厂预置 |

```bash
# 查看可换模型
godot-codely --list-models

# 指定模型跑任务（仅本次生效）
godot-codely --model glm-5.2 "分析场景树"
godot-codely --provider volcengine --model glm-latest "..."

# 默认模型配置在用户级 profile 的 cordis.patch.yml（--default 设为默认）
```

### DeepSeek-V4.1-Flash（用户侧，不改预设字段）

日常 Godot Codely 用 DeepSeek-V4.1-Flash，并打开思考。本仓库能核对到的只有这些入口，不要另造键：

| 用途 | 已有字段 | 怎么填 |
| --- | --- | --- |
| 选模型 | CLI 临时 overlay 的 `agent-default-model.config.model`（旁边是 `provider`）；桌面/手机会话走 `session/selectModel` 的 `model` | 出厂 Token Plan 列表里的 Flash id 是 `deepseek-v4-flash-0731`。你的端点若把 V4.1-Flash 标成 `deepseek-flash`，就把这个 id 填进 `model` |
| 思考强度 | 会话字段 `reasoningEffort`（`session/selectModel` 的 request；桌面和手机设置里的「思考强度」） | 目录里有对应档位时：日常 `high`，小改动 `low`，难问题 `max` |
| 模型是否提供这些档位 | 设置页模型行的 `reasoningEfforts`（会解析成运行时的 `model.reasoning`） | `off` 表示关掉思考（能力图里 `off: null`）。没有名为 `thinking` 的配置键 |

CLI 的 `--model` 只写 `provider` + `model`，不写 `reasoningEffort`。思考强度在桌面或手机的会话设置里选。短 persona 已经按 Flash 的上下文预算收过；方法论在预设 `docs/`，需要时再读。

### 自建套餐

任何 OpenAI 兼容 / Anthropic 兼容端点都可一条命令接入（key 写入用户级凭据文件，套餐写入用户级 cordis.patch.yml，DSH 自动应用）：

```bash
godot-codely config add \
  --name my-plan \
  --base-url https://api.example.com/v1 \
  --api openai-completions \        # 或 anthropic-messages
  --key-env MY_API_KEY \
  --key sk-xxx \
  --models m1,m2,m3 \
  --display "我的套餐" \
  [--default]                        # 设为默认模型
```

- `godot-codely config list` 查看全部套餐（出厂 + 自建）
- 移除失效套餐：直接编辑 `~/.godot-codely/cordis.patch.yml`（自建）或 `~/.godot-codely/profiles/godot-codely/cordis.patch.yml`（出厂）
- 桌面端同套配置：桌面端应用配置目录下的 harness settings.yaml（重启自动导入，Models 页可视/可换）

### 常见模型错误排查（通用指引）

| 错误码 | 常见原因 | 处理 |
|---|---|---|
| 401 | 密钥失效 / 身份验证失败 | 核对并轮换 API key |
| 402 | 余额不足 / 无对应订阅 | 充值或确认套餐含目标模型/接口 |
| 400 | 请求参数不符（如网关不透传 images/audio 接口） | 确认端点支持目标接口（images/generations、audio/speech），或用 `ep-` 接入点直调 |

## 多模态资产生成（MCP：generate_sprite / generate_image / text_to_speech）

操作示例与排错详见 `skills/godot/media-generation/SKILL.md`（已挂技能索引 `skills/godot/SKILL.md`）。Godot Codely 的 MCP server 提供 3 个多模态工具，写入 Godot 工程 `assets/`（Godot 4 自动 import，无需手写 meta）：

| 工具 | 能力 | 落盘 |
|---|---|---|
| `generate_sprite` | 2D 游戏精灵（角色/敌人/道具/UI，透明背景） | `assets/textures/` |
| `generate_image` | 任意图像（概念/场景/宣发） | `assets/textures/` |
| `text_to_speech` | 文本转语音（wav/mp3） | `assets/audio/` |

### 文生图（✅ 已通，开箱即用）

- 默认走**火山方舟 doubao-seedream**：MCP 从用户级技能配置（`.env`，含 `VOLCENGINE_API_KEY` + `VOLCENGINE_IMAGE_ENDPOINT=ep-xxxx`）加载，接入点优先于进程级通用 URL。
- 实测（2026-10-12）：`generate_image` 真机出图成功（2048x2048，自动落盘 `assets/textures/`）。
- 兜底：`GODOT_CODELY_IMAGE_BASE_URL` + `GODOT_CODELY_IMAGE_MODEL` + `GODOT_CODELY_IMAGE_API_KEY`
  （任意 OpenAI 兼容 images/generations 端点，如自备 DashScope 原生 key）。

### 语音合成（⚠️ 工具就绪，需自备 key）

`text_to_speech` 走 DashScope multimodal-generation 格式（`qwen-audio-3.0-tts-plus` 等），
需自备支持多模态的 DashScope/百炼 key：

```
GODOT_CODELY_TTS_BASE_URL=…（默认 dashscope multimodal-generation 端点）
GODOT_CODELY_TTS_MODEL=qwen-audio-3.0-tts-plus
GODOT_CODELY_TTS_API_KEY=sk-xxx
GODOT_CODELY_TTS_VOICE=Cherry
```

### 已知限制（2026-10-12 实测）

- **Token Plan 套餐**的 `wan2.7-image` / `qwen-audio-3.0-tts-plus` 虽在模型白名单，但网关只透传
  chat 接口——`images/generations` 与 `audio/speech` 均返回 400 url error，**不能**经套餐调用。
- **火山模型名直调**（doubao-seedream-5.0-lite-260128 等）404，必须用 `ep-` 接入点。

## 子代理系统（Godot 领域专家 agents，对标 cowork agents）

DSH 内核自带完整子代理栈（dsh-subagent 服务 + spawn/fork 后端 + 委派工具）。本包在
`~/.godot-codely/profiles/godot-codely/cordis.patch.yml` 追加了 3 个 **Godot 领域专家实例**（每实例 = 一个具名工具，
persona 遮蔽全局提示词、spawn 以空对话开始、继承父级 cwd/LLM）：

| 工具 | 领域 | 典型任务 |
|---|---|---|
| `subagent_godot_scene` | 场景架构 | 节点树设计、场景复用、UI 布局、2D/3D 场景搭建 |
| `subagent_godot_shader` | 着色器 | GDShader 编写、材质、特效 shader |
| `subagent_godot_gdscript` | GDScript | 脚本编写重构、信号/协程、状态机、对象池 |

- 验证（2026-10-12，kimi-for-coding）：主 agent 委派 `subagent_godot_scene` 设计 2D 平台关卡入口，
  子代理返回完整节点树 + 信号接线 GDScript + 搭建检查清单 ✅。
- 注意：新增插件行必须放 `- insert:` 块（普通 `- id:` 行只覆盖已有行）。
- 原生工具 `subagent` / `subagent_fork` / `list_agents` / `send_message` / `interrupt_agent` 亦可用。

## 启动修复（2026-10-12）

- 根因：apply() 在 provisionMcp 之前做了一层**无 filter 的全量 cp**，npm install 后源目录
  39.5MB node_modules 被整体复制，插件初始化 95s+ 超时。
- 修复：删除外层冗余 cp；MCP 复制收敛到 provisionMcp 内部（dstReady 判定 + srcNewer mtime 比较 +
  filter 双分隔符排除 node_modules）。apply() 实测 0.0s，CLI 启动不再超时。

## 记忆系统（AGENTS.md 注入，对标 cowork 记忆）

DSH 原生按链注入工作区指令（dsh-base 默认开启，预算 64KB）：**全局** `~/.godot-codely/AGENTS.md` →
**项目根** AGENTS.md/CLAUDE.md → **目录级** AGENTS.md（更具体者优先，变更增量注入）。

- 全局记忆：`~/.godot-codely/AGENTS.md`（用户习惯：简体中文、飞书推送节点、3D 低精度偏好、产品背景、模型套餐）。
- 项目记忆：仓库根 `AGENTS.md`（上游 DSH 开发约束，保留）+ 本目录 `packages/dsh-godot-stack/AGENTS.md`
  （Godot Codely 定制层：目录地图、命令、陷阱、能力进度）。
- 验证（2026-10-12，kimi）：CLI 询问产品定位/默认模型/3D 偏好，agent 全部正确回答 ✅。

## 安全策略/协作模式（对标 cowork permission 体系）

DSH 的权限 = 沙箱模式 + 审批策略的捆绑（preset）。Godot Codely CLI 默认走 **danger-full-access**（完全权限 + 无审批，能写工作区外、能干重活）：

```bash
godot-codely "任意任务"                                # 默认 full
godot-codely --permission workspace-write "任务"       # 降级：工作区写 + ask 审批
godot-codely --permission read-only "任务"             # 只读（安全浏览）
```

- 实现：启动器注入 `DSH_PERMISSION_MODE`（dsh-sandbox-policy 直读）；profile patch 覆盖 `permission` 插件 `defaultPreset: danger-full-access`（Web 端新会话默认同此）。
- 审批语义：`danger-full-access` → `never`（不询问）；`workspace-write`/`read-only` → `ask`（headless 无审批通道时，写工作区外 fail-closed = 安全兜底）。
- 协作模式：Web 端可用 `/permission <preset>` 切换（read-only / workspace-write / danger-full-access）。

### 动态记忆（godot-memory skill + MCP 工具，对标 cowork 独有记忆）
- 静态链（上文）+ 动态层：agent 主动读写 `~/.godot-codely/memories/<topic>.md`（`godot-memory` skill 约定，headless 已跑通）。
- MCP 工具版：`memory_remember / memory_recall / memory_list`（`godot-mcp-server`，单元验证全过；桌面端 harness 可用，headless 因 stdio 握手延迟暂不暴露）。
- 2026-10-12 真机：full 权限下 CLI 写入 `~/.godot-codely/memories/verify_test4.md` 并回读一致 ✅；workspace-write 下写记忆目录亦放行（行为观察中）。

## 斜杠命令（对标 cowork /command 面）

- **CLI**（秒回，不启动模型）：`godot-codely "/memory 记 <topic> <内容>"`、`/memory 查 <topic>`、`/memory 列表`、`/models`、`/status`
- **桌面端/Web 会话**：dsh-godot-stack 通过 `ctx.inject(['commands'])` 注册 `/memory`（记/查/列表）与 `/status`（能力进度+记忆概览），确定性动作不产生模型消息；headless 无 commands 服务时静默跳过
- `/permission <preset>` 为 DSH 自带（read-only / workspace-write / danger-full-access）

## LSP 通道（#18 · 2026-10-12 真机打通）

- **机制**：Godot 原生 GDScript Language Server（`--editor --lsp-port <port> --headless`，TCP JSON-RPC；stdio 模式在 Windows 不可用）
- **工具**：MCP server 新增 `lsp_diagnostics(path, project_path?)`——打开 .gd 文件收 `publishDiagnostics` + 工作区加载错误，返回结构化诊断（severity/line/column/message）
- **Godot 探测**：`GODOT_PATH` → 环境已知安装位 → 常见安装目录扫描；项目目录从 path 向上找 `project.godot` 自动定位
- **真机验证**：错误文件（未定义函数/未用参数）返回 2 条诊断；干净文件无诊断 ✅
- **能力意义**：agent 可自审 GDScript（对标 cowork 代码智能），无需人工开编辑器

## 开发

### OCU 原生界面操作

OCU 网关源码由本包维护，启动时复制到 `<DSH_HOME>/.godot/ocu-gateway/`。
原生依赖显式安装到 `<DSH_HOME>/.godot/ocu-runtime/`，不从豆包沙箱、工作区或全局 PATH 查找：

```bash
node packages/dsh-godot-stack/cli/setup-ocu.mjs --home <DSH_HOME>
```

安装脚本固定使用 `open-computer-use@1.0.0`（MIT，来源：
[iFurySt/open-codex-computer-use](https://github.com/iFurySt/open-codex-computer-use)），
由 npm 写入该独立 runtime 的锁文件和 integrity。新安装先在临时目录完成并检查
`capabilities --json`，成功后才发布；已安装的同版本可以重复运行检查，失败保留原目录。
此项依赖包含跨平台原生程序，按需安装避免默认安装包携带全部平台的二进制；启动本身不会联网安装。

脚本打印完整 MCP 配置。把现有 `mcp-ocu` 的 `config` 替换成该配置，保留插件 id/name。
其中 `command` 是 Node 可执行文件，`args` 只含固定目录内的网关，`env.DSH_HOME` 必须明确传递
（Harness 会清理继承的 `DSH_*` 环境变量）。更新配置后重启对应 Harness 或重新加载 MCP。
安装、配置、MCP 握手、工具发现和实际界面操作分别验收；能力检查不代表点击已验证。

网关用参数数组和 `shell: false` 启动，支持 Windows 带空格路径。自定义上游时可使用
`node ocu-gateway.js -- <node.exe> <OCU bin/ocu> mcp`，不传 `.cmd`、`.bat` 或 `.ps1` shim。
默认 `write-approve`、`Godot*,godot*,Godot_*` 白名单；缺少 app、未知工具及只读档位的写操作
返回明确拒绝。程序找不到、管道失败、协议损坏及异常退出在 stderr 保留对应阶段，
不把退出或工具失败标记为操作成功。

```bash
npm test -- test/ocu-gateway.test.mjs
```

```bash
npm install            # file: 依赖链接本包
npm run build          # 编译主进程后打包时插件随 asar 进入
```

## 更新资源

外部集成资产源（godot-extensions，路径按环境配置）改完后重新复制对应目录到本包：
- `agent-presets/godot-codely-lite` → `godot-stack/agent-presets/`
- `godot-codely/godot-mcp-server` → `godot-stack/mcp/`
- `skills/godot` → `skills/godot`

### 启动阶段诊断

排查首次启动慢或 loader 超时时，可在启动进程环境设置
`GODOT_CODELY_STARTUP_TRACE=1`。插件会向 stderr 记录固定阶段名（OCU、presets、MCP、bridge）、
单调累计耗时，以及等待时的事件循环延迟；不输出配置或项目内容。默认关闭，初始化完成或插件卸载后停止心跳。
这只增加诊断，不改变 loader 时限、权限或 provisioning 顺序。
