# Godot 面板 Agent 闭环验证

## 安装产物验收发现：ASAR 递归复制

PR #4 对应 Windows CI `38387804606` 全部通过，但其 packaged Harness 启动日志仍出现预设与 MCP provisioning 的 `ENOENT`。最小 Electron ASAR 探针确认源目录 `existsSync` 为真，`fs.promises.cp` 递归复制仍失败；这是 ASAR 读取兼容问题，不能把 Harness ready 当作 Godot provisioning 成功。

修复将宿主自有预设、MCP runtime 和技能的递归复制改用 ASAR 支持的 `readdir/readFile/writeFile`，保留 runtime 摘要校验、用户设置和已有技能的保留语义。OCU 的单文件复制采用相同读写路径，复制后仍自包含。包清单补齐 `data-home.mjs` 与复制模块。

新增真实 Electron/ASAR 行为回归及 `afterPack` Godot gate，检查四份预设的宿主绑定、MCP integrity 和技能 provisioning；不通过就阻断打包。本地 4 套件 18/18 与 typecheck 通过。整仓 189 文件：179 通过、6 失败、4 跳过；1647 测试通过、12 失败、7 跳过，Godot 与 ASAR 用例无失败。其他失败涉及 symlink EPERM、图像写入、pnpm rebuild 与 PPT 上传路径。安装包 UI 与完整 Lite 预设生产激活尚待新 CI 产物验收，P0 仍不能按生产验收关闭。

## 2026-10-13 主线同步验收

本分支在 `2ec9dbe` 的 Agent 工具与编辑器运行验证基础上合入 `origin/main` `00740aa`。下文旧基线与 PR 状态保留为历史记录；本次同步已包含主线的实时编辑器上下文、数据目录隔离、OCU 修复和品牌更新。唯一冲突位于插件入口 import：保留预设绑定当前宿主所需的 `pathToFileURL`，移除主线已替代的 `os` import，采用 `cliHome()`。

- `npm run typecheck`、`npm run build`、`git diff --check` 通过。首次沙箱构建遇到 `realpath` 权限错误，授权环境重跑通过。
- Windows Godot 4.7.1 console 二进制：7 个 Godot/OCU 专项套件，28/28 通过，包含真实 Harness Agent 工具、跳跃修改及运行验证、原生编辑器 Play/Stop。命令沿用下文 7 套件专项命令。
- 编辑器状态 compose/live：2/2 通过。必须给测试进程设置独立的 `APPDATA`、`LOCALAPPDATA`、`USERPROFILE`、`HOME`；本机继承用户配置时 compose 进程崩溃、live 超时，隔离后两项通过，不把原配置下的失败掩盖为通过。
- `npm test -- --maxWorkers=4` 已完整执行，188 文件中 175 通过、9 失败、4 跳过；1619 测试通过、14 失败、32 跳过。失败包括 Windows symlink `EPERM`、图像写入失败、pnpm rebuild 失败、Harness 启动与 PPT hook 超时；本次未修复这些其他模块的失败，不能称整仓全绿。该轮 Godot 回归没有失败。
- 未执行正式安装包和已安装 Electron 的生产 UI 全流程验收，未发布新版本。

## 状态边界

`origin/main` 的基线 `ebf5f95` 仍按 **P0 2/3** 计数。本文对应本地 `codex/godot-agent-validation` 验证分支，组合 PR #1、#3 的实现后补充剩余闭环；不表示两支 PR 已在 GitHub 合并。PR #2 不参与组合。

## 能力归属与加载阶段

- **后端加载 / Agent 作用域**：预设在 standing revision 中加载 `dsh-godot-stack/mcp-agent`，此时不创建子进程。其 scoped `agent/created` 监听器只处理加入该 revision 的 Agent，读取 `session.header.cwd`，从当前 `DSH_HOME/.godot/mcp-server/build/index.js` 启动独立 stdio MCP 子进程，等待 initialize、tools/list；失败保留原因并让 creation announcement 拒绝。`agent/pre-step` 同样等待初始化，防止创建阶段的早期输入越过工具握手。不同项目的 Agent 不共享可变 MCP 配置。框架在 announcement 之前插入 Agent/Session，不能据此声称内部没有中间可见状态；生产创建 API 与完整预设 Loader 的组合仍需后续验收。
- **原生编辑器能力**：Godot `EditorPlugin` 轮询 loopback Bridge，主线程执行资源扫描与 Play/Stop。Bridge 只转交命令和结果，不实现另一套 Agent runtime。命令串行、绑定编辑器身份、过期后不重放；未保存场景会拒绝扫描或 Play，不自动保存覆盖用户编辑。
- **编译与冒烟**：`project.verify` 在独立 headless Godot 进程加载磁盘上的 GDScript、场景，再启动主场景并收集 stdout/stderr。编译错误、启动失败、超时及运行报错通过 MCP `isError` 返回。此处不是 C# 编译，也不能用冒烟成功证明任意玩法正确。
- **面板与会话**：用户消息按 Harness 的真实事件结构显示；新面板实例从持久日志重放历史，当前实例重连仍保留游标。模型、审批审计和会话生命周期继续由 Harness 负责。
- **分发**：新增子入口、宿主 peer、编辑器脚本和 `memory-root.mjs` 纳入包。普通 Profile 使用现有插件解析和明确的宿主依赖 fallback；Safe Mode 不加载该可选能力。本次没有修改通用 loader 或绕过解析边界。
- **工具帮助**：`help` 原本在 bundle 外查找未分发的 docs，会返回“无文档”。构建将权威 Markdown 生成到 `runtime/tool-help/*.txt` 并纳入完整性清单，避免安装包通用 docs 排除规则；Agent 回归同时调用分发包的 `help(project)` 验证新动作说明可读取。

## 回归内容

`test/godot-agent-tools.test.mjs` 消费独占生成目录中的真实分发模块，使用真实 Harness AgentRegistry、AgentLoop、ToolRuntime 和 MCP 子进程，以及真实 Godot 面板和游戏进程。受控模型适配器依次输出读脚本、改跳跃、运行验证三次工具调用；模型不访问外部服务。

验收检查从 `-400` 改到 `-600` 的文件结果、真实角色运行输出 `JUMP_RESULT velocity=-600`、会话工具日志、面板可见结果、任务结束状态、重建面板的历史恢复，以及损坏脚本的编译失败反馈。Bridge 的测试 carrier 直接委托真实 Harness 对象；生产 Typert 的认证、端点发现、结果封装和历史分页由 `test/godot-bridge.test.mjs` 单独覆盖，因此不能把组合回归说成已安装 Electron 的生产 Typert/UI 全流程验收。

`test/godot-editor-live.test.mjs` 在 Windows Godot 4.7.1 隔离编辑器中验证真实 Play/Stop 状态、禁止重复 Play 和插件信号。测试设置独立 APPDATA、LOCALAPPDATA、USERPROFILE、HOME、DSH_HOME；退出时只关闭测试自有游戏与编辑器。

```powershell
$env:GODOT_TEST_BIN = '<Godot Windows executable>'
npm run godot:build
node node_modules/vitest/vitest.mjs run --maxWorkers=4 test/godot-runtime.test.mjs test/godot-distribution-gaps.test.mjs test/godot-bridge.test.mjs test/godot-editor-control.test.mjs test/godot-agent-tools.test.mjs test/godot-editor-live.test.mjs test/ocu-gateway.test.mjs
```

没有 `GODOT_TEST_BIN` 时两项真实引擎回归明确跳过。GitHub workflow 固定官方 Godot 4.7.1 Windows 归档并核对 SHA256，执行上述专项和根类型检查；workflow 存在不等于 CI 已通过。

## 交付限制

本次不声称已经完成：真实付费模型调用、已安装 Electron 的完整生产连接、正式 Windows 安装包验收、C# 编译、交互截图/输入、自定义玩法的完整断言、计划模式和 Editor Undo。当前 main 的 P0 计数不能随着本地测试成功改为 3/3；分支合入与生产链路验收分别记录。

## 本地检查记录

- 预设复制将本包的 MCP 子入口改为当前宿主包的明确 file URL；冷启动或升级后重新绑定，不给其他裸包增加宿主兜底。真实 Loader/AgentPresetRegistry 已加载这条实际复制后的行，同一 revision 的两个 Agent 使用独立项目配置。此处验证的是 MCP 行，不是整个 Lite 预设所有依赖的组合。
- 4 worker 的上一轮完整回归：188 文件中 9 失败、174 通过、4 跳过；16 测试失败、1615 通过、32 跳过，另有 1 个运行器错误；Godot 用例无失败。修正真实预设加载后重新执行最终构建、专项与整仓回归，上传时仍在收集最终整仓结果，不能称整仓全绿。

- Windows Godot 4.7.1：上述 7 个专项套件 **28/28 通过**，没有跳过；额外的编辑器状态 compose/live **2/2 通过**。
- `npm run typecheck`、MCP server 的 `tsc --noEmit`、`npm run build`、`git diff --check` 通过。
- 生成包 `npm pack --dry-run --json` 检查包含新增 Agent/记忆子入口、Bridge、编辑器脚本、编译 bundle 与 `tool-help/project.txt`。
- 最终代码的整仓默认并发回归未通过：187 文件中 20 失败、162 通过、4 跳过；27 测试失败、1583 通过、40 跳过，另有 2 个运行器错误。其中新增的真实 Agent/编辑器用例也超时，不能将本次修复称为整仓稳定或把失败全部归因于环境。随后使用 4 个 worker、相同用例和超时重跑，结果另行记录。

## 2026-10-13 安装验收新增阻断

CI Dev 安装包 `caf9b58` 已验证 ASAR preset / MCP / skill 复制完整、客户端界面挂载。继续调用生产 API 后发现两项尚未被旧缩小组合回归覆盖的问题：

- launch token 到达时 `HarnessRuntime.url` 尚未赋值，凭据文件第二行写成 `undefined`。改为就绪探测成功、实际随机端口确定后原子写入，再通知 ready。
- Harness 0.2 不扫描 `.agent-presets` 目录；使用宿主 `agentPresets` 服务和官方 `dsh-agent-preset` 注册四个定义，include 当前 Profile 的复制文件。普通 Profile 生效，Safe Mode 保持原有排除。persona 使用当前 `prefix` 字段；隔离 delegation realm 明确提供 `dsh-workflow`，移除不存在的旧 worker 包。

`test/godot-launch-token.test.mjs` 使用真实 Harness 子进程、临时 Profile 和生产 Typert API，覆盖全部四个 preset 的发现/诊断、完整 Lite 会话创建、随机端口凭据认证以及重启。此项在 Windows 已通过；新版 CI 安装包的最终任务验收仍待完成，旧包的界面成功不替代此项验收。
