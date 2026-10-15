# Godot 桌面第二批：引擎与独立运行

关联 Issue #20，依赖第一批项目工作台。该批不改变 Harness bootstrap、Profile 插件解析或 Agent runtime。

## 实现与进程边界

- `src/main/godot-engine.ts` 管理引擎配置和桌面启动的进程；preload 只暴露 `status/choose/open/run/stop` 五个具名方法。Renderer 不传可执行路径、PID、命令参数或任意 IPC 通道。
- IPC handler 检查主窗口、主 frame、当前 Harness origin 和正常运行模式；项目由 main 使用该窗口认证 session 请求现有项目 API 解析，不能把 renderer 提供的目录当授权依据。Safe Mode、其他窗口、其他 origin 不提供控制。
- 引擎由原生文件选择器选择，使用参数数组执行 `--version`，要求 Godot 4.1+ 的 Godot 4 版本。保存前校验，临时文件与原子 rename 保留旧有效配置；不改用户项目与会话。
- 路径复用 `<DSH_HOME>/.godot/godot-path.txt`，与既有 MCP auto_setup 共用。新 MCP 连接优先使用这份有效选择，其他发现方式作为后备；已有连接需重连后应用新选择。没有安装/下载引擎的新流程。
- 独立运行使用已注册项目的主场景；未设置主场景时明确拒绝。重复启动同一项目对应进程会被拒绝。启动成功只表示进程已创建，不代表玩法验证通过。
- 独立停止只作用于 manager 持有的游戏子进程；不接受 PID，不扫描或停止其他用户程序，不影响编辑器 Play 或 MCP 发起的运行。它不是全局 Godot 进程管理器。
- 退出桌面会等待本批启动中的操作收口，再停止其独立游戏；已打开编辑器继续保留，避免丢弃未保存编辑。Harness 重启与窗口隐藏不重建 manager，不丢失仍在运行的桌面进程记录。
- 每个项目保留最近 32768 个 UTF-16 单元的 stdout/stderr，最多保留 16 个项目记录；满额时只淘汰已退出记录。新一轮运行清空旧输出，旧进程尾部输出不会混入新一轮。日志在停止后仍可读取，应用退出后不持久化。

## 界面

项目信息栏新增引擎位置、版本、独立运行状态、打开编辑器、独立运行/停止与可展开日志；编辑器连接和 Play/Stop 保留独立分区。中英文同批注册，使用现有主题 token。没有原生 bridge 的浏览器页面显示不可用提示。

仅在面板挂载、工作台激活且已知自有进程仍运行时以 1.5 秒间隔刷新；窗口隐藏时暂停请求，离开项目/卸载后释放 interval，过期响应不能更新新项目。停止、路径选择和启动失败都有可重试的文字反馈。游戏运行结果需由用户在实际项目中确认。

## 可复现的验证入口

```powershell
npm run build
npm run typecheck
npm test -- test/godot-engine.test.ts test/godot-desktop-client.test.mjs
$env:GODOT_TEST_BIN = '<Godot 4 executable>'
npm run test:godot-engine:native
```

原生验收使用临时 Profile、项目、原生 Electron preload 与真实 Harness。引擎文件由测试选择函数代选，文件对话框交互本身不算自动化验收。验收不调用付费模型。结果和截图写入 `.build/godot-engine-acceptance`；临时 Profile 与项目由 runner 清理，不使用开发或正式用户数据。

## 本轮证据与限制（Windows）

- 类型检查、首轮完整构建通过；引擎服务/IPC、工作台、品牌专项 5 套件 17 项通过。
- 真实 Electron + Harness + Godot 4.7.1 可见模式的 13 项流程检查通过：选择并保存引擎、认证项目解析、独立启动与 stdout、重复运行拒绝、停止后日志保留、真实编辑器启动、退出只停止自有游戏，以及无效工作区、不可用模式、其他窗口与其他 origin 的拒绝。原生选择器通过测试函数代选，不代表文件对话框的交互已自动验收。
- 首次使用默认 Godot 用户环境出现退出码 `3221225477`，直接启动同一引擎也复现；静音频、ANGLE、headless 均未消除。将 Godot 的 APPDATA/LOCALAPPDATA/USERPROFILE/HOME 指向临时目录后，直接启动的可见/headless 对照以及完整原生流程通过。只定位到用户环境差异，未确认具体文件或原因；没有清理、迁移或重置真实配置。测试使用隔离目录，产品仍沿用用户正常环境，不能宣称默认环境问题已修复。
- 最终源码：`npm run typecheck`、完整 `npm run build` 通过；6 套件 26 项专项通过，包含真实 MCP 新连接读取已选择的引擎路径与版本、项目目录移动后的停止保护。原生可见模式再次完成 13 项流程检查，实际展开日志并检查其可见性后截图。
- 全量 `npm test -- --maxWorkers=2` 报告 1678 通过、12 失败、8 跳过，无 worker 异常。本批相关套件通过；失败涉及图片沙箱/符号链接权限、generation/pnpm 构建审批、market/host fallback 符号链接和 PPT 个人模板路径保护。随后最后一项目录移动保护与提示调整已专项/原生复验，没有为此重复全量测试。没有主分支对照，不统一认定这些失败属于既有问题。PR 保持草稿，未生成或安装正式发布包。

正式安装包升级、其他平台、外部已打开编辑器的聚焦、持久化日志与独立编译/冒烟按钮不在本批完成范围；不能据此关闭整个 M2 或总 Issue。
