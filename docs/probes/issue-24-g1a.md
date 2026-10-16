# Issue #24 · G1a 运行时与 Profile 探针

> 后续决策：用户已选择 OBSERVED，并在限定范围确认后授权推进 G1b。下文未进入 G1b 保留本轮探针结束时点；当前进展见 [G1b 记录](issue-24-g1b.md)。

日期：2026-10-16。来源：[RFC #24](https://github.com/hhhh124hhhh/godot-codely-desktop/issues/24) 的 G1a 与 §3.1–3.3。
基线：`bf3163a982c5e43a2290fd3417a4c197dbae919d`；独立分支 `codex/governance-hook-probe`。

**结论：真实接缝验证通过；项目整体 ENFORCED 不成立。G1a 的下一步是治理模式决策，未进入 G1b。**

现有 Hook 足以在受管调用准入处拒绝真实写入；当前结果不证明所有 Agent、任意 Shell、可变 MCP 工程与调用准入之后的副作用均受保护。建议首版按 OBSERVED 进入 G1b，先交付可信状态与交接；保留原生工具能力和默认权限。若选择 ENFORCED 优先，则留在 G1a 收紧执行入口，取得新证据后再推进。

## 实验范围

- Windows x64 / Node v24.15.0；已安装 `@deepseek-ai/dsh`、`dsh-tools` 均为 `0.2.0-rc.2`。
- 隔离工作树生成本次 Godot MCP，临时 `DSH_HOME`、真实 Godot 工程文本文件、正式 MCP stdio 握手。没有调用 LLM，不需要模型凭据；没有操作真实游戏工程。
- 第一组使用真实 Cordis、ToolRuntime、Agent、Agent preset Loader、MCP 子进程、sandboxed tool-fs 和 PowerShell executor；审批使用真实 ApprovalService 与 Session 审计，回答由测试监听器提供，没有测试审批 UI。
- 第二组通过 Desktop 的 `build/harness-node-entry.mjs` 启动真实 Harness CLI 子进程，读取临时普通 Profile manifest 与 patch，加载 `dsh-base` 与探针插件。`cwd` 为中立 `launch-root`，Profile 依赖通过显式临时 junction 投影至已安装闭包，未使用 `NODE_PATH`。
- 第二组确认会话实际政策为 `danger-full-access`、原生审批 `never`。仅测试 Profile/后端和工具，没有 Web UI、Electron 安装包或正式发行版验收。
- 探针只在实验插件中挂载 Hook；没有向产品默认组合加入治理插件。

## 复现

在独立工作树根目录、依赖就绪后：

```powershell
node scripts/build-godot-runtime.mjs --no-project --output .build/governance-probe-runtime
node scripts/probes/governance-hook.mjs
node scripts/probes/governance-profile.mjs
```

维护入口：

- [运行时探针](../../scripts/probes/governance-hook.mjs)
- [Profile 子进程驱动](../../scripts/probes/governance-profile.mjs)
- [Profile 实验插件](../../scripts/probes/governance-profile-plugin.mjs)

结果生成至 `.build/governance-hook-probe/results.json` 与 `profile-results.json`，保留完整 SHA-256、工具结果、原生审批 asked/decided 审计及启动日志。生成证据不作为第二份源码提交。临时工程、Profile 和会话数据已清理；独立生成运行包与 Windows loader 原生缓存供重放保留。

## 真实结果

运行时组退出 0，产生 27 条观测记录；Profile 组退出 0，含 6 条真实工具调用。这些数量包含边界观察与审计记录，**不能称为 33 项产品功能测试**。

| 请求/作用域 | 实际效果 | 判定 |
|---|---|---|
| MCP scripts.read | 正常返回文件，哈希不变 | 只读成功 |
| MCP scripts.write、tool-fs write | 正常修改，哈希改变 | ALLOW 成功 |
| full 下 PowerShell 写入 | 实际命令修改文件；拒绝整个 pwsh 调用后文件不变 | 仅证明整次调用可拦截，未解析 Shell 内副作用 |
| full 下冻结写入 + 后续 allow 监听器 | MCP/FS 返回 ISSUE24_DENY，哈希不变 | 后续 pre-execute allow 不覆盖 guard |
| 两次并发 MCP 写入 | 均拒绝，哈希不变 | 简单并发拒绝成立 |
| stale/wrong-project 测试政策 | 按注入政策拒绝，哈希不变 | fixture 判定；不是持久化版本或真实路径校验实现 |
| 原生审批 rejected | 拒绝，哈希不变 | 原生拒绝成立 |
| 原生 allowed-once + guard 拒绝 | 返回治理拒绝，哈希不变 | 原生批准不替代业务许可 |
| 原生 allowed-once + guard 允许 | 实际修改 | 正常路径未误拦 |
| 原生审批日志 | 3 对 asked/decided，ID 配对且 outcome 与回答一致 | 审计成立，未测试 UI |
| guard 内抛异常 | 错误返回，哈希不变 | 此次准入 fail-closed |
| 手动卸载 guard / 重新挂载 | 卸载后能写；重新挂载后拒绝 | 卸载不自动维持强制模式 |
| 当前 Agent 局部 guard | 当前 Agent 拒绝；无关 Agent 能写自身工程 | 局部隔离成立 |
| parentAgent 指向受管 Agent 的子 Agent | 子 Agent 实际写入，哈希改变 | **父子关系不自动继承局部 guard** |
| guard 已允许，tools/execute wrapper 内撤销政策 | 后续 MCP 仍写入 | **准入后撤销没有原子写入保证** |
| MCP config.set 切换 project_path | 后续 res:// 写入新工程 | **session cwd 不能单独作为 MCP 实际目标依据** |
| 全局 guard 拒绝所有工具时，外部 Node CLI 写入 | 外部进程仍改变哈希 | **独立 CLI 不受该进程 guard 保护** |
| 普通临时 Profile、full/never、正式 MCP/FS | 读/允许写入均成功；deny 哈希相等且原因可见 | **实际启动链路准入拒绝成立** |

关键哈希（完整值见原始 JSON）：

- Profile MCP allow：`0247edfec725` → `5a27847af32a`。
- Profile FS allow：`5a27847af32a` → `09a0f5c2f264`。
- Profile MCP/FS deny：均保持 `09a0f5c2f264`。
- wrapper 中撤销：`b89c09bde0f5` → `809359d51679`，证明仍写入。
- 子 Agent：`a6f6c5604e9b` → `b1505b4966c1`，证明局部 guard 未继承。

## 入口覆盖

| 入口 | 已证事实 | 当前整体治理标签 |
|---|---|---|
| Godot MCP | 正式 scripts.write 可在 Harness 准入拒绝；config 切换和准入后窗口仍存在 | OBSERVED；不能笼统 ENFORCED |
| tool-fs | 正式 read/write 与 full/never 下 deny 已测 | 仅测试调用的准入点受控 |
| PowerShell | 正式 pwsh 整次调用 allow/deny 已测 | 任意命令副作用未受细粒度约束 |
| Bash | Windows 预设禁用；本轮未运行 | NOT_TESTED |
| 子代理 | 真实 child Agent 调用不继承局部 guard；正式委派工具未测试 | OBSERVED / 委派工具 NOT_TESTED |
| 外部 CLI | 独立 Node 子进程写入旁路已证；单独受管 CLI 启动未做 | OBSERVED |
| Desktop 原生进程控制 | 本轮未进入 Electron IPC；保持 #21 范围 | NOT_TESTED |
| 外部 Godot IDE / Git / GitHub | 不在此 ToolRuntime 执行链中 | 未提供强制保护 |

## Gate 与模式决策

HOOK-01 的真实注册/执行/手动卸载、HOOK-02/03 的正式允许/拒绝、HOOK-04 的 full 与原生审批组合均有证据。HOOK-05 的入口矩阵如上；HOOK-06 已覆盖简单并发、注入旧政策、手动卸载、政策异常、子 Agent 和 MCP 项目切换、准入后撤销窗口。没有证明异常插件卸载期间持续保护、进程中途撤销、重启恢复、所有动作路径/junction 逃逸及任何安装包防护。

因此：**RUNTIME_SEAM = PASS；PROJECT_ENFORCED = NOT_PROVEN；G1a 强制路线不放行。** 现有正例不能覆盖上述反例。未给 G0 纸面场景补写产品 PASS，也未进入 G1b–G4。

需要选择后续交付路线：

1. **OBSERVED 优先（建议）**：G1b 实现权威状态、CAS、恢复、冻结设计与工程版本分离，G2 做可信证据判定，G3 诚实展示仅观察；不声称能阻止未授权修改。它直接验证恢复/交接价值，现有 Shell 与委派能力保留。
2. **ENFORCED 优先**：继续停留 G1a，设计所有 Agent 的受信任政策归属，约束 MCP config 和目标路径，默认拒绝不能证明安全的 Shell/委派，并在可信写入点复验政策；重新验证后再进入 G1b。交付时间更长，工具能力会收紧。

这不是重复申请运行探针权限：用户已授权按阶段推进；该选择会改变首版工具可用性与对用户作出的防护承诺，依据 RFC §3.1、§3.3 和 G1a 分流规则提交产品决策。

## 检查

- 本次独立 MCP 构建成功。
- 两个上述探针均实际退出 0；运行时探针修正正式 turn 协议和审计断言后重新通过。
- 三个实验脚本 Node 语法检查通过；新增文件差异与链接已检查。
- 未运行全量 npm test、typecheck 或 Electron build：本轮仅隔离实验脚本和报告，没有提交产品实现或修改正式加载配置。不将这些未运行检查报告为通过。
- 原开发工作树的 WIP 未修改；未创建 PR、未向 GitHub 发消息，#24 保持 Open。
