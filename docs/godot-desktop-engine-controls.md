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

## 后续排查（2026-10-16）

- 对主分支 `0320754` 的独立源码快照运行上述 6 个失败套件，得到 130 通过、12 失败；失败用例与原先全量的 12 项一致，包含相同的符号链接 EPERM、图片沙箱保存失败和 pnpm rebuild 失败。共享的是当前安装依赖，因此这是同机源码基线对照，不代表干净安装或 CI 验收。
- 正常 Windows 环境直接启动临时项目：编辑器可退出 0，游戏仍以 `3221225477` 崩溃。分别替换 APPDATA、LOCALAPPDATA、USERPROFILE、HOME 后，只有单独替换 APPDATA 能让游戏退出 0；因此先前关于 LOCALAPPDATA 沙箱重定向的猜测不成立。当前工具进程在真实 Godot app_userdata 下创建唯一临时探针也无法完成写入，尚不能把原因归为用户配置损坏；没有重置真实数据。
- 补齐 Windows 异常退出反馈：显示“Godot 游戏进程异常退出”、保留数字退出码、自动展开日志并提示直接运行对照与重试。普通退出和用户停止不被标为 Windows 崩溃。覆盖有符号/无符号异常码、正常退出和运行中状态的组件回归通过。
- 原生脚本支持 `GODOT_ENGINE_SMOKE_USER_ENV=1` 使用当前用户环境作诊断；配合 `GODOT_ENGINE_SMOKE_EXPECT_CRASH=1` 检查真实异常状态和展开日志。后者只验收失败反馈，不代表游戏运行成功，也不能替代默认隔离环境下的完整 13 项流程。
- 本轮类型检查、完整构建和 11 项专项通过；隔离环境真实可见模式的完整 13 项流程再次通过，当前用户环境真实崩溃反馈检查通过。截图时短暂显示不抢焦点的验收窗口，等待绘制后采集再隐藏，避免隐藏窗口返回旧帧；每轮先移除旧报告，`expected-crash` 不作为成功运行报告。
- 最终串行全量 `CI=1 npx vitest run --maxWorkers=1 --pool=threads`：1675 通过、13 失败、11 跳过。除了基线同样的 12 项，另有 memory root 的 HOME 断言在 threads 池失败；默认 forks 池单独复验该套件 2 项通过。不能把不同池/CI 条件的统计混为同一轮，也不将该额外失败认定为本批产品回归。此前 forks 全量因未完成而中止，不作为最终结果。完整回归仍未全绿，PR 保持草稿。

## 用户目录崩溃修复（2026-10-16）

上节的本机游戏启动阻塞已修复。触发条件定位在 Codex/MSIX 的 AppData 虚拟目录视图与既有 `%APPDATA%\Godot` junction 的交互：原路径为全新目录返回 Win32 `183`（已存在），但随后查询目录不存在；相同物理数据目录和临时标准 junction 均能正常创建、写入。Godot 4.7.1 在此前路径环境下以 `3221225477` 退出。这个结果不能归因于项目或编辑器配置损坏。

排查中复刻了原 junction 的空 PrintName；临时位置仍能正常创建目录，因此空显示名本身不是原因。新建的 Roaming 探针实际落在 `%LOCALAPPDATA%\Packages\<Codex PFN>\LocalCache\Roaming`，确认当前工具进程受到 MSIX 文件重定向影响。[微软的 MSIX 说明](https://learn.microsoft.com/en-us/windows/msix/desktop/flexible-virtualization)描述了 AppData 的私有目录优先与真实目录回退行为。这里确认的是本机可复现的路径触发条件，未定位 Windows 或 Godot 内部的具体缺陷行。

修复保留原链接作回滚，在当前目录视图中重新建立指向**同一物理 Godot 目录**的 junction，确认逻辑路径写入可从物理路径读回。实际生效映射位于 Codex 的 LocalCache Roaming 中；真实用户数据目标保留。修复不包含配置重置、存档迁移或引擎替换，也不把本机缓存路径写入生产启动逻辑。

修复后的证据：

- 原逻辑路径的全新目录创建、文件写入与读取全部恢复。
- 唯一随机项目名（此前没有 user_data）分别通过默认 APPDATA、物理路径、临时标准 junction 启动，三组均退出 `0`，排除了已有用户目录掩盖故障。
- `GODOT_ENGINE_SMOKE_USER_ENV=1 npm run test:godot-engine:native` 完整 13 项再次通过：`headless: false`、`isolatedGodotUserDirectories: false`，使用原有真实环境完成游戏启动、stdout、停止、编辑器启动及退出清理。原生文件对话框仍由测试代选。
- 本次修复位于环境映射层，仓库仅补充诊断记录；原有全量回归失败和正式安装包/其他平台的验收状态沿用上节，不能据本次成功声称全部回归通过。
