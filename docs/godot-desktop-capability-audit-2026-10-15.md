# 现有桌面端能力探查

日期：2026-10-15。基线：当前工作区，HEAD `d15645b`，包含尚未提交的其他开发改动；不是对某个已发布安装包的验收。本次只读取实现、运行专项并记录结果，没有修改产品实现、用户真实 Profile 或真实项目。

## 结论

当前已经具备「Godot Agent 修改项目 + 调用引擎验证」的执行底座，以及可组合原生对话的桌面工作台框架。可以进入专用 Godot 工作台的第一版实现，不必重建聊天前端或 Agent runtime。

目前还不是已经落地的 Godot 游戏开发桌面：项目页、Godot 专用工具栏、实时状态面板、结构化改动审阅和验证汇总仍需接入。此前的 `website/desktop.html` 是设计原型，不能当成这些能力已经在桌面端生效的证据。

## 能力分层

| 能力 | 当前可以到哪一步 | 界面落地缺口 |
| --- | --- | --- |
| 项目 / 工作区与会话 | 现有 workspaces、sessions、工作台绑定及导航隔离；真实 Harness 临时 Profile 可以创建 Lite 会话 | 工作区目前是通用目录，需识别 `project.godot`、提供游戏项目摘要，并处理无项目 / 路径丢失 |
| 模型与 Godot 预设 | 宿主注册 Lite、场景、Shader、GDScript 四个预设；生产 API 发现与会话创建本次通过 | 工作台创建会话的默认流程只传 workspaceId，不自动保证选择 Lite；必须补明确的预设选取流程并验证 |
| 对话与任务执行 | Harness 负责持久会话、工具调用、审批、取消；Bridge 提供 sessions、prompt、events、approval、cancel | 专用工作台应组合原生 conversation，不能复制原型聊天 UI 作为第二套业务前端 |
| 脚本与场景改动 | MCP 提供 scripts / scenes / nodes / resources 等工具；真实 Agent 测试完成跳跃参数修改 | 原型中的文件列表、变更数量与差异不是实时数据；需确定真实变更基线、事件来源及审阅接口 |
| 打开 / 运行 / 停止 Godot | `editor.launch`、`project.run/stop/logs` 已有；连接了 EditorPlugin 时有 `editor.live_status/scan/play/stop` | 没有 Godot 专用桌面按钮；需宿主受控调用及 pending / 错误 / 超时状态。独立进程运行与编辑器 Play 是两条不同路径 |
| 编译与冒烟 | `project.verify` 加载磁盘 GDScript / 场景并运行主场景，返回编译、运行及失败证据 | 尚无专用桌面验证摘要。它不等于 C# 编译，也不等于任意玩法视觉 / 交互验收 |
| 编辑器上下文 | 插件监听场景、选中节点、撤销历史等信号；共享 state 包含 selected_nodes、unsaved、open_scenes、updated_at | 状态文件是快照，不可单独用来宣称编辑器在线；需匹配当前项目并结合活跃连接 / live_status |
| 资源与技能 | Godot 技能、MCP、生图与语音相关底层已有 | 不等于已有完整资源浏览、预览、生成任务管理、导入审阅或 3D / 音乐生产线；收费服务未在本次调用 |
| 品牌与布局 | 宿主品牌 slots 已使用机器人身份；工作台支持业务侧栏与 customFrame | `dsh-godot-stack/package.json` 尚无 `dsh.client`，也没有注册 Godot 工作台客户端 |

## 与三栏设计的具体衔接

1. **可以直接复用**：原生工作区 / 会话、模型与预设管理、对话 / 输入框 / 工具卡片 / 审批，以及工作台服务的会话归属和生命周期。
2. **可以新增并接入**：Godot 项目总览、项目识别、当前场景 / 选中节点 / 未保存状态摘要，以及打开编辑器、运行、停止和编译冒烟入口。前端入口必须经过明确宿主服务或现有工具路径，不能从 renderer 随意启动进程。
3. **需要补数据契约**：任务级改动列表与完整差异、验证结果订阅、当前任务和项目状态关联，以及工作台会话默认使用 Lite 的机制。现有 Bridge 的文本 preview 不能自动视为结构化文件 diff。
4. **不能由工作台单独接管**：整个 Desktop 左侧导航、窗口菜单与宿主设置。`customFrame` 只占宿主分配的主内容区域，必须保留原生 sidebar 和 conversation 挂载。原型里的左侧重排需要另行使用语义匹配的 slot 或最小宿主接缝。

工作台已有 `desktopWorkbenches.register(descriptor, Component)`，支持 `customFrame`、业务面板左右位置和 0.25–0.7 的比例；注册还会核验 repository 与来源包归属，不能只传一个任意 id 就认为注册完成。服务的 `createOwnedSession()` 当前调用 `sessions.create({ workspaceId })`，所以接通 Godot 预设并非换一个工作台标题即可。

Bridge 会拒绝与自身 origin 不一致的浏览器 Origin。桌面客户端不应直接跨端口 fetch 4399 来绕开这层约束；应通过宿主已有认证与授权边界接入。

## 本次实际验证

首次在沙箱内运行 Vitest 时，Vite `realpath` 返回 EPERM，五个套件都没有执行到测试；随后以本机权限重跑。不能把首次错误记为行为回归失败或把未执行测试计入通过。

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=2 test/workbench-client.test.mjs test/workbench-navigation.test.mjs test/workbench-patch-slots.test.mjs test/godot-editor-control.test.mjs test/godot-bridge.test.mjs test/godot-launch-token.test.mjs
```

结果：**6 个套件、194 项测试通过**。其中工作台与 Bridge 多数是行为隔离 / 组件组合测试；`godot-launch-token` 使用真实 Harness 子进程、临时 Profile 和生产 Typert API，覆盖四个预设发现 / 诊断、Lite 会话创建、随机端口凭据与重启，不是已安装 Electron 的 UI 流程。

```powershell
$env:GODOT_TEST_BIN = '<本机 Godot 4.7.1 console executable>'
node node_modules/vitest/vitest.mjs run --maxWorkers=1 test/godot-agent-tools.test.mjs test/godot-editor-live.test.mjs
```

结果：**2 个套件、2 项测试通过，无跳过**。使用测试自建的隔离项目 / 环境，验证：

- 真实 Harness Agent / Loop / ToolRuntime 经 MCP 将跳跃参数从 -400 改到 -600，Godot 返回 `JUMP_RESULT velocity=-600`。
- Godot 面板收到任务结果；重建面板后可以重放持久会话；损坏脚本返回编译错误。
- 真实 headless Godot 编辑器完成 status → scan → play → stop，拒绝重复 Play，观察 native playing 状态。不是可视化编辑器点击验收。

合计：**8 个套件、196 项测试通过**。本次没有修改行为代码，因此没有额外跑整仓 build / typecheck / 全量回归。

## 证据与限制

主要实现入口：

- `packages/dsh-desktop-workbenches/client.js`：register、createOwnedSession、newSession、Frame、原生 conversation 的固定挂载。
- `packages/dsh-godot-stack/package.json` 与 `index.js`：服务端插件、四个 Godot 预设、桥接及命令注册；无 Godot 工作台客户端入口。
- `packages/dsh-godot-stack/mcp-agent.mjs`：每个 Agent 独立启动 MCP，使用会话 cwd；启动失败阻断工具就绪。
- `packages/dsh-godot-stack/bridge/bridge.mjs`、`editor-control.mjs`：会话、审批和编辑器命令生命周期。
- `packages/dsh-godot-stack/godot-stack/addons/godot_codely_ai/editor_state.gd` 与 `plugin.gd`：上下文快照和编辑器信号。
- `packages/dsh-godot-stack/godot-stack/mcp/godot-mcp-server/src/better/src/tools/registry.ts`、`composite/project.ts`、`composite/editor.ts`：实际工具契约。
- `docs/workbench-standard.zh.md`、`docs/patch-plugin-contract.md`：工作台可控制的范围及扩展边界。

本机既有 `.build/p0-acceptance-result.json` 记录的是 `af8053113ea65378df4d82190b1c01e7decb7666` 与固定安装 artifact 的历史验收，不能替代当前 `d15645b` 工作区或任意 Releases 包的验收。

本次未调用付费模型、未做新安装包的桌面 UI / 安装验收、未验证任意玩法的截图与输入自动断言、未验证 C#、未验证专家真实模型委派。这里给出的是当前源码及专项实测的能力边界，不声称已发布版本同步具备所有能力。

## 建议的第一步

先增加一个可关闭的 Godot 工作台客户端，保留原生侧栏与会话；做项目识别、Lite 预设选择和真实项目摘要。再把已有启动 / 运行 / 验证能力接到受控入口。完整替换侧栏、独立资源管理器和高级差异审阅放到后续阶段，这样首版可以较快获得真实可用且可验证的游戏开发流程。
