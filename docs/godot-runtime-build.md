# Godot MCP 分发闭包

修复阶段：构建输入及 MCP 子进程加载。普通 Profile 与开发环境都消费生成的 Godot 插件；Safe Mode 保持其现有插件白名单。没有改变通用宿主依赖 fallback。

## 输入和路径

- 权威输入：`packages/dsh-godot-stack/` 与其中 MCP 的 TypeScript、Godot 脚本。
- 构建工具：根 package-lock.json 锁定的 esbuild 0.25.12 与 MCP SDK 1.30.0。SDK 是构建依赖，嵌入独立 ESM 可执行文件；不新增生产环境第三方包搜索路径。
- `npm run godot:build` 生成 `.build/godot-runtime/packages/dsh-godot-stack`，再投影到开发 `node_modules/dsh-godot-stack`。替换的是 npm 的 junction/包目录，不是维护源码目录。修改源码后重新执行此命令。
- 根 dev/build 在消费前调用生成器；Electron Builder 显式装配本次生成包，排除旧开发副本。产物不提交到 Git。
- `--no-project` 仅供隔离测试生成产物，不改变开发 node_modules。
- 插件从自身包的 `godot-stack/mcp/godot-mcp-server/runtime` 读取产物，校验 manifest 和文件 SHA-256，然后复制到 `<DSH_HOME>/.godot/mcp-server`。不复制 node_modules、不在启动时下载依赖。

保留 Godot 操作脚本和第三方许可；构建检查不得出现未嵌入的普通包 import。生成包使用独立 .npmignore，避免源码的 build/ 忽略规则误伤可执行文件。

## 失败与恢复

缺产物、摘要不符或无效 settings.json 时保留原始错误并由插件记录 provisioning skipped；不能记录 configured。旧用户配置、凭据和自装依赖不删除。目标被损坏时可从通过校验的本次产物恢复。已有自定义 Godot MCP 注册项保留；新注册使用当前实际 Node 可执行文件和显式 DSH_HOME，避免依赖系统 PATH 或继承已被 scrub 的变量。

`configured` 只表示运行时已准备、兼容 settings.json 已登记。Harness 当前通过 dsh-mcp-client 插件配置加载 MCP；完整 Agent preset 的分发和其实际激活仍是另一项验收，不能用旧 settings.json 兼容项替代。

## 已有回归

`test/godot-runtime.test.mjs` 在全新临时 home、仓库外 cwd 实际启动生成包，通过 MCP initialize、tools/list、记忆写入及读取，并检查 Godot 脚本资源；另覆盖缺失/损坏产物拒绝登记、修复托管代码时保留用户文件、无效用户 JSON 保留原文。

此次验收不代表已发布新安装包，也不代表整个 Godot preset、面板和编辑器链路均已激活。Windows 安装包、完整 Harness 与真实 Godot UI 的验收继续按分工清单执行。

2026-10-13 验证结果：新增回归 5/5 通过，包括 stdio 和 `/api` JSON 子进程；typecheck、根 build、最终 godot:build 和 diff 检查通过。生成包 `npm pack --dry-run` 包含 runtime/build/index.js、provisioning 模块及 22 个依赖许可/归属文件。

完整 `npm test`：183 个测试文件中 167 通过、12 失败、4 跳过；1647 个测试中 1599 通过、16 失败、32 跳过。失败涉及 PPT、generation、宿主启动/依赖 fallback、图像工具、预设迁移、market、Profile 命令和 Safe Mode，含 Windows symlink EPERM 及超时；未建立干净基线，不能将全部失败归为环境或宣称整体回归通过。日志留在忽略的 `.build/godot-runtime-full-test.log`，专项结果在 `.build/godot-runtime-tests.log`。
