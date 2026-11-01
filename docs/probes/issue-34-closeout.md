# #34 M1/M2 收尾记录

日期：2026-10-18（Asia/Shanghai）。当前状态：**已完成 — PR #37 已合并，#34 已验收关闭**。

## 范围与停止条件

用户决定：只收敛 #34；最多再做 #39 的轻量版本，然后转入真实游戏项目使用。当前不启动 #39，不扩展 Governance、UI 重写或上游自动化。原主目录的 Governance 等 WIP 保留，本轮不整合进 UX 候选。

## 候选与证据归属

- [#34 原始范围与修复记录](https://github.com/hhhh124hhhh/godot-codely-desktop/issues/34)。顶部 0.1.5 为初始审查基线；后续评论已推进到 0.1.6，不从旧阶段重新实现。
- [PR #32](https://github.com/hhhh124hhhh/godot-codely-desktop/pull/32) 已合并。P0 修复为 [#35](https://github.com/hhhh124hhhh/godot-codely-desktop/pull/35)、[#36](https://github.com/hhhh124hhhh/godot-codely-desktop/pull/36)，既有批次记录包含真实安装版断管、重技能目录对照。
- 当前 P1 候选：[PR #37](https://github.com/hhhh124hhhh/godot-codely-desktop/pull/37)，提交 `fb40461e829724533cca7db8cc5a9ba13811d9c1`，仍 open、未合并。该隔离工作树本轮检查为 clean。
- 已部署 Dev 目录沿用此前批次记录的候选部署；本轮未重建或重新安装，不能证明安装目录与源码逐文件一致。`resources/app.asar` 本轮 SHA-256：`78578BF4262918ADE3311CAF4B1AD8279D367EFAD6B306743D4892F16063A0DF`。
- Dev 运行数据为独立 `godot-codely-dev` userData，其下 `harness` 为 DSH_HOME。本轮未清空配置、会话、模型或技能目录。

## 缺陷与 M1/M2 映射

| 项目 | 既有证据 | 本轮结论 |
| --- | --- | --- |
| P0-1 主进程 EPIPE | 批次 1 安装版断管对照通过 | 日志边界回归通过；未重做断管安装实验 |
| P0-2 Skills watcher 无限等待 | 批次 1 重目录冷启动约 6.6 秒 ready | 8 项行为回归通过；本轮实际启动约 9.2 秒 ready，主界面挂载 |
| P1-1 工作台持久化 / M1 恢复 | 批次 2 两次重启通过 | 本轮启动显示 Godot 开发、TestProject 及两条继续开发会话 |
| P1-3 引擎首次引导 | 批次 2 空项目挂载与引导测试通过 | 本轮配置已有引擎，未冒充干净首启验收 |
| P1-4 无模型提示 | 批次 2 修复 store 注入，单测及已配模型实机通过 | 本轮模型可见；无模型交互未实机重验 |
| P1-2 编辑器连接时效 | 静态缺口，原批次未纳入阻断门槛 | 维持未完成，不声称编辑器连接闭环通过 |
| P1-5 普通目录持续加载 | 原审查疑似，批次 2 未复现 | 本轮未完成普通目录操作，仍待抽查，不推断根因 |
| 窄窗、键盘、宽窄布局 | 初始审查未覆盖 | 本轮窗口激活失败，未完成，不记 PASS |
| 付费模型真实修改/验证 | 前两批 UX 审查未覆盖 | 未执行；不以其他技术 Gate 的历史结果代替本候选验收 |

M1 项目概览、原生会话与 M2 独立引擎运行属于本次；M3 Diff/证据面板、M4 资源中心、治理 G2/G3 和 ENFORCED 均不补做。P2 不扩入本轮。

## 本轮实际检查

在上述 clean 候选工作树直接运行 Vitest（未调用根 pretest）：

```text
node node_modules/vitest/vitest.mjs run test/main-log.test.ts test/plugin-recovery.test.ts test/godot-desktop-client.test.mjs --maxWorkers=2
  3 files / 39 tests PASS
node node_modules/vitest/vitest.mjs run test/skill-filesystem-watch-bounds.test.ts --maxWorkers=2
  1 file / 8 tests PASS
npm run typecheck
  PASS
git diff --check
  PASS
```

首条实际调用还包含不存在的 `test/skill-filesystem-readiness.test.ts` 过滤条件，Vitest 只执行其余三个文件；发现后按真实文件名单独补跑上述 8 项，不能把过滤条件存在当作测试执行。

Windows 实机使用 computer-use 观察到：启动 ready 后，开发会话有原生输入框与 Godot Codely Lite，项目概览正确显示 Codely Audit、主场景及历史会话，右侧显示已配置引擎和未运行状态。截图在本次工具输出中，未保存为仓库图片。一次项目概览切换成功；后续 resize/click 多次返回 `failed to activate captured window`，刷新窗口状态后仍无法可靠操作，故停止输入。没有用渲染截图代替后续交互验收。

本轮未运行 build、全量测试或新安装验收；未修改产品代码。该轮结果仅补充启动/恢复观察及定向源码回归。

## 2026-10-18 补验收（真人任务闭环 + 窄窗）

候选仍为 PR #37 同一部署（`D:\Apps\Godot Codely Dev`，`resources/app.asar` SHA-256 与上轮记录一致）。使用 KimiCU 实机完成：

- **任务闭环 PASS**：TestProject 下输入"新建 ACCEPT_CHECK.md（一行：验收测试 OK。）"→ 首轮因 Dev Profile 未配 DeepSeek API key 报 `MISSING_CREDENTIAL`（设置 → 模型页显示密钥空）；真人补配密钥后，同一会话追发消息重跑，2 轮 6 步完成，用时 7 秒，对话内改动块 +1/-0，`D:\godot-codely-audit\TestProject\ACCEPT_CHECK.md` 真实落盘且内容正确。
- **改动查看 PASS**：改动面板打开第 2 轮 diff，显示新增行。
- **Run/Stop PASS**：独立运行游戏 → 状态"运行中"、引擎版本检查显示 `4.6.3.stable.official.7d41c59c4`、Godot 进程存在；停止独立运行 → 状态回"未运行"、进程退出。
- **退出重开 + 继续会话 PASS**：杀进程重启（Harness 4.1 秒 ready），恢复同一开发会话（完整历史、模型选择不变），继续发送消息正常回复（3 轮 7 步）。
- **窄窗口 PASS**：侧边栏自动折叠为图标，三栏内容无遮挡错位；窗口最小宽度约 1353px（应用自身下限）。
- **普通目录抽查**：本次操作即普通目录（`D:\godot-codely-audit\TestProject`）全程无持续加载，原 P1-5 疑点本轮未复现。
- **键盘路径**：输入框聚焦、Enter 发送、Escape 关闭菜单均正常。

如实记录的限制：中英切换、浅色主题、编辑器内运行（P1-2）未验；改动面板重启后显示"这轮改动的内容已不可用"（会话历史本身完整恢复）；沙箱内首次 `pwsh` 调用报 ACL `SetNamedSecurityInfo failed (win32 5)`，agent 自行改用 glob/write/read 完成，属 Harness 沙箱行为；KimiCU 枚举不到该应用窗口（主窗口标题为空），本轮经 HWND 直取观察，不影响产品本身。

## 最后需要的验收

使用同一明确候选，由真人完成一次小任务：打开游戏项目、确认模型与引擎、输入目标、完成必要审批、查看真实修改、Run/Stop、退出重开并继续会话。补看普通目录与窄窗口；中英、深浅、键盘和错误恢复未覆盖项如实记录。确认纳入门槛的 P0/P1 清零且用户能理解状态，才能签 UX_READY。

如发现新的可复现核心阻断，按 #34 修复；否则不再扩展工具工程，转入真实游戏项目。PR 合并、发布、#20/#26 远端状态同步均尚未执行；本轮没有向 GitHub 发送评论或更改 Issue。
