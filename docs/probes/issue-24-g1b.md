# G1b · OBSERVED 项目事实恢复

范围批准：用户选择 OBSERVED，并于后续“推进”授权编码。唯一目标是重开 Codely、切换 Agent 后仍能恢复进度、原始授权边界和真实验证记录。后台执行、权限拦截、Gate 评判与工作台新 UI 均不属于本阶段。

## 实现合同

- 权威输入在 Harness Node 侧，存放 `$DSH_HOME/governance/projects/<canonical-root-hash>`；已有 Godot 项目按 realpath + 物理目录身份识别，junction 不重复建档，无 Git 也可用；同一路径换成另一目录不会承接旧项目事实。
- 每个 revision 是同一份状态与 DecisionEvent 的不可变事务目录，包含独立主副本和 SHA-256 manifest。先写入并 fsync staging，再原子 rename 至版本目录；已有非空版本目录不能覆盖，跨进程同版本竞争返回 CONFLICT。未发布 staging 不算已提交。
- 重开重新校验连续历史、项目归属、revision 与前序摘要；单副本损坏可从校验通过的独立副本读取并显式报告 RECOVERED。双副本/历史链损坏只给出 RECOVERY_REQUIRED 与最后可验证现场，禁止继续写入，不静默回退成成功。保留原始损坏材料。
- v1 是首次正式结构；显式支持文档化的 v0 导入结构（同一事务布局但尚无 governanceMode/delegation 字段），读时迁移为 OBSERVED/无委托，新提交使用 v1，历史不覆写。未来 schema 拒绝加载。
- 稳定 projectId、stateRevision、policyVersion、任务 Intent/Boundary/STOP、设计基线、实现指纹独立保存。生命周期默认 UNASSIGNED；USER_ADOPTION 仅记录具名人类确认，不生成历史 Gate PASS。
- 授权合同保留范围、批准版本、截止时间和预算；永远 MANUAL/NOT_AVAILABLE，不消费预算、不执行任务、不自动续期。交接区分“原始记录”和“当前版本是否仍匹配”。
- 验证记录保留原始 outcome、provenance、runId、输入/环境指纹与制品引用；不把 Agent 自述变成适配器验证。旧 revision、旧 run 或输入不符提交拒绝，记录只追加。
- Handoff 是从当前状态和历史投影的事实 JSON，包含未验证项、停止原因与下一步，读取不改写。切换 Agent 不依赖聊天摘要。
- 现有插件只增加只读上下文恢复接缝；没有建档的工程保持原行为。持久化写入仅暴露给可信 Node 调用者，不提供模型写工具或 renderer 任意写入 API。保持 Harness 权限与完整工具能力。

## 运行验收

真实临时 DSH_HOME + 无 Git 工程：新进程写入，再由两个新 Agent/进程恢复，字段一致；两个并发进程同 revision 只能一方提交；副本损坏恢复和双损坏拒写；未发布 staging 崩溃重开；项目切换与 Windows junction；过期授权和原始 FAIL/UNKNOWN 不被提升；v0 迁移与未来版本拒绝。生成包验证包含同一治理模块，真实 Harness 进程重启验证只读交接接缝。

G1b 不以自动化测试证明人类恢复上下文时间已下降。届时提供同一份交接进行人工检查，桌面关闭/重开的实际 UI 与体验提升仍须如实单独验收。

## 已实现与当前 Gate

**BACKEND_VERIFIED / EXPERIENCE_PENDING；未进入 G2。** 本轮授权只覆盖 G1b 限定范围。实现位于 `packages/dsh-godot-stack/governance/`，按既有构建链生成和装配，没有新增依赖、Agent Runtime、执行调度器、权限 Hook 或模型写工具。

- `ProjectStore.create/read/commit` 是可信 Node 边界；项目与预期 revision 做 CAS，提交输入在首次 I/O 前复制，防止中途改写。
- 初始生命周期 UNASSIGNED；用户采纳为 USER_ADOPTION，历史 Gate 仍为 UNVERIFIED。冻结设计与实现版本指纹分开。
- 每份事务含同 revision 的状态与 DecisionEvent，checksum 检查主副本与独立恢复副本；每次读取重新验证磁盘，不以 Agent 内存为权威。
- 验证记录只追加，保留原始 PASS/FAIL/UNKNOWN、来源、运行、输入/环境指纹与制品引用；不重评 Gate 或证据有效性。
- 授权保留原批准人、版本、政策、任务、期限和预算；恢复不续期，`executionAuthorized` 恒为 false。
- 已建档工程在既有 `system-prompt/assemble` 恢复交接；不同 Agent 读同一项目，其他工程不混入。原桌面桥增加 workspace 的 GET handoff 查询，没有远程写状态 API。
- 插件卸载移除只读交接，重载不重复注册；原权限、审批政策和完整工具集合不变。

## 实际检查

环境：Windows x64 / Node v24.15.0、Harness 0.2.0-rc.2，独立工作树与临时 DSH_HOME。

```powershell
node node_modules/vitest/vitest.mjs run test/godot-governance.test.mjs test/godot-desktop-api.test.mjs --maxWorkers=1
npm run typecheck
node node_modules/typescript/bin/tsc --noEmit --strict --noUncheckedIndexedAccess --skipLibCheck --module NodeNext --target ES2022 packages/dsh-godot-stack/governance/index.d.mts
npm test -- --maxWorkers=2
npm test -- test/ppt-personal-templates.test.mjs --maxWorkers=1 --hookTimeout=60000
npm run build
node scripts/build-godot-runtime.mjs --no-project --output .build/governance-probe-runtime
node scripts/probes/governance-reopen.mjs
```

- 定向 23 项通过：18 项治理行为 + 5 项原/新增 API。覆盖跨进程 CAS、实际进程崩溃与重开、副本损坏和历史断链、同路径替换工程、Windows junction、旧运行/输入、提交对象中途变更、过期/版本不符授权、观察来源、阶段采纳、v0 迁移及未知授权字段拒绝。
- `npm run typecheck` 和新增 `.d.mts` 单独严格检查通过；前者不覆盖插件 JS，不能称为 JS 已经 TS 检查。新 JS 另做运行时与 Node 语法检查。
- 最近全量：191 文件通过、6 跳过、1 个 PPT 套件因 beforeAll 的 10 秒初始化限时失败；1698 项通过、23 跳过。该 PPT 套件单独给予 60 秒 hook 时间后 9 项通过，未改产品或断言。**不把有超时的全量命令写成全绿。** 后续目录身份和 v0 字段负例由定向回归覆盖。
- 构建与文件清单证据位于 `.build/g1b-validation/`，真实重开结果在 `.build/governance-reopen-probe/`；以最终日志为准。治理源码与声明均纳入生成包及 npm 文件白名单。

## 真实重启如何复现

驱动：[governance-reopen.mjs](../../scripts/probes/governance-reopen.mjs)；Profile 验收插件：[governance-reopen-plugin.mjs](../../scripts/probes/governance-reopen-plugin.mjs)。

1. 本次生成包、普通临时 Profile、中立 launch-root、独立 Godot 工程；所有数据位于自建目录。
2. 第一个真实 Harness 进程记录任务短卡、过期委托，以及实际 Node 文件断言 PASS 和故意返回 17 的 FAIL，保存原始退出码制品。
3. 退出进程后启动第二个，通过 `agents.resume({resumeSessionId})` 恢复原会话，并创建新 Agent 和另一个工程的 Agent。
4. 原会话和新 Agent 的交接一致，其他工程无交接；状态、原授权合同和原始结果与旧进程一致，EXPIRED 不变成授权，FAIL 不变成 PASS。
5. 两个进程中都实际卸载/重载插件，交接消失/恢复且仅一份；工具集合、danger-full-access 和 never 不变。

这是实际 Harness 进程/会话/Agent 验收。Node 断言和故意失败是隔离夹具，**不是 Godot 游戏、FF-01 ACCESS、Android 或 FUN 测试**。

## 未证明与限制

- 尚无普通用户建档/写入 UI；G1b 交付可信 Node 接口、自动只读 Agent 交接与 GET API。未建档项目不自动迁移聊天，更不把聊天摘要变成授权。
- 未启动真实 Electron 窗口做关闭/重开验收，也未更新用户已安装应用。真实桌面与人类接管耗时待验收；自动化进程耗时不代表 Human Attention Time 或 Return-to-Context Time。
- 未重新采集实际工程指纹或验证证据是否仍适用当前代码/设备；交接明确 `implementationRevalidated:false` 和 `verificationValidity:NOT_EVALUATED`。证据重评属 G2。
- 目录迁移、磁盘整体丢失/恶意离线修改、普遍断电一致性未验证。Windows 用文件 fsync + 同卷目录原子发布，不宣称目录 fsync 或跨文件系统强事务。
- 每事务上限 8 MiB、最多 1000 条验证记录；超限报错，不静默裁剪。没有自动压缩或删除历史。

下一步只做真实项目的建档/重开与交接体验确认，核对是否减少重新指挥；不自动进入 G2、后台执行或 ENFORCED。

## 受控测试入口（按用户后续要求调整）

- `npm run test:governance`：只跑上述两个直接相关套件，固定最多 2 个 worker，不执行根 pretest，不准备 Office/PPT。实际 23 项通过，命令总耗时约 5 秒（Vitest 本体约 3 秒）。
- `npm run test:governance:runtime`：仅生成独立 Godot 包并启动真实 Harness 重开/Agent 切换/卸载重载验收。仅在挂载、分发或恢复接缝变化时运行，不作为每次编辑的默认动作。
- 新入口只声明对应范围通过。`npm test` 和 CI 保留，完整回归集中到合并/发布或跨模块验收；文档、脚本参数等低影响修改不再次触发全量。
- 根 AGENTS.md 是分层验证规则的权威维护入口；docs/development.md 说明具体命令及资产准备边界。计时证据位于 `.build/g1b-validation/controlled-fast.json` 和 `controlled-runtime.json`。这些是测试循环耗时，不是用户恢复上下文耗时。

受控入口实测补充：`test:governance` 总耗时 5.03 秒，23 项通过；`test:governance:runtime` 总耗时 20.44 秒，通过本次包的真实进程重开、原会话恢复、新 Agent、项目隔离和卸载/重载断言。日志未出现品牌、Office 或 PPT 准备。覆盖范围不同，不用这两个时长宣称等价替代全量。

最终正式 `npm run build`、类型与语法检查、暂存差异检查通过；生成包治理源码与维护输入摘要完全一致。仍为 BACKEND_VERIFIED / EXPERIENCE_PENDING。

## 真实项目只读验收（2026-10-16）

用户指定原型集合后，选择 Bullet Heaven（培养皿：弹幕余生）。新增驱动 `scripts/probes/governance-real-project.mjs <project-root>`，复用既有 Harness 重启探针；真实项目参数必须与只读证据同时提供，避免落入写夹具路径。

- 本轮只读取 project.godot、主场景及其直接引用，共 6 个文件；检查入口/文件存在并记录 SHA-256。重启后重复读取，6 个摘要完全一致。该指纹只覆盖选中文件，不代表完整工程快照。
- 独立临时 DSH_HOME、APPDATA、USERPROFILE 与中立 launch-root。两个真实 Harness 进程、原会话恢复、新 Agent、其他工程隔离和插件卸载/重载均通过。工具集合及原生权限设置未变化。
- 恢复后的状态、交接文本、原始 PASS/UNKNOWN 完全一致。PASS 仅表示本轮只读入口检查；桌面体验为 UNKNOWN。delegation 保持空，executionAuthorized=false，没有伪造人工批准或历史阶段采纳。
- 未启动 Godot，不导入资源、不运行游戏、不访问游戏存档；探针没有原工程写入操作。未执行游戏全量回归。
- 最终真实项目驱动与原夹具驱动均通过；只检查修改探针语法及 git diff，不重复产品全量。

真实项目证据单独保存在 `.build/governance-real-project-probe/`（results.json、real-project-evidence.json、real-project-summary.json），不覆盖夹具证据。临时 Profile 完成后删除，只保留验收制品。机器路径不写入源码/fixture。

结论仍为 BACKEND_VERIFIED / EXPERIENCE_PENDING。实际 Electron 窗口关闭/重开、普通用户录入入口、交接减少重复指挥的人工评价尚未完成；本轮不能替代这些验收。下一步需先解决开发应用 userData 的独立隔离，再做桌面流程；不得直接启动会使用现有 godot-codely-dev 数据的默认开发入口。

## 桌面层隔离探针（2026-10-16）

新增 `scripts/probes/governance-desktop.mjs <project-root> [--warm-profile]`。它启动本次已有构建的真实 Windows Electron：测试夹具在导入产品入口前设置独立 appData，实际记录并断言 userData/appPath；不修改产品的目录策略、IPC、权限或窗口关闭语义。窗口隐藏运行，通过 loopback CDP 检查 bootstrap、模块注册队列及 React 挂载。

每次使用新建的专用目录。只读真实项目的选中文件，状态由 ADAPTER 显式建档，未冒充人工阶段批准、未创建 delegation。通过正常桌面 workspace/create 与 Godot Lite session/create 注册真实工作区/创建会话，通过认证后的 handoff GET 与可信 Node 投影精确比对；退出使用 app.quit，校验退出码，再重开同一 Profile。会话创建不调用模型，也不执行游戏工具。

启动探针自身最初错误使用遥测枚举 OFF，日志证明当前完整 Web 组合只接受 FEEDBACK_ONLY/DISABLED；已改用 DISABLED。错误首轮证据保存为 `first-attempt-results.json`/`first-attempt.log`，不算产品失败。

修正后的全新 Profile 冷启动仍未通过：日志显示插件树初始化超过 100 秒，最终报告 dsh-godot-stack apply timeout；未完成 UI 挂载。证据为 `.build/governance-desktop-probe/cold-attempt-results.json`/`cold-attempt.log`。未证明根因为资源复制，也未证明由 G1b 引入，不能据此宣称版本回归。

对照参数 `--warm-profile` 在启动前，用现有 provisioning 函数准备同一批 Godot preset/MCP/skills，并把 MCP command 设为实际 Electron 执行器；不关闭或替换插件、不延长产品 loader 的 100 秒限制。它只覆盖资源准备完成后的重启恢复，不能替代首次安装验收。

本机 node_modules 是共享 junction，宿主源解析实际指向共享物理路径。已逐一核对治理 5 文件、desktop-api.mjs、index.js 共 7 个文件摘要，与本 worktree 的维护源码完全一致；因此没有把另一份 Godot 实现当成本轮结果。其他共享宿主插件不属于本轮代码改动。

预准备对照最终结果：**PASS（限定范围）**。first/reopen 两轮真实 Electron 都完成 bootstrap/注册队列与 React 挂载，均正常退出码 0；同一工作区重开后仍能读取交接，两轮各创建两个 Godot Lite 会话，交接与冻结投影完全一致，basisRevision=2、executionAuthorized=false。原工程选中 6 文件的摘要前后相同。未调用模型、未运行 Godot 游戏、未执行游戏写入工具。

结果保存在 `.build/governance-desktop-probe/results.json`，两轮日志为 first.log/reopen.log。专用 Profile 验收结束后清理，只保留收据与脱敏日志。本轮仅新增探针/文档，未修改产品主进程，也未重跑全量或构建。

最新结论：BACKEND_VERIFIED + WARM_DESKTOP_REOPEN_VERIFIED / COLD_START_FAILED / HUMAN_VALUE_PENDING。此前“未启动真实 Electron 窗口”的限制由此限定更新：已验证隐藏运行的真实窗口和 DOM 挂载，没有人工可见操作、聊天中实际发送消息或 UI 展示交接卡的验收。此前独立 Harness 进程覆盖原会话恢复与 Agent prompt 注入；本桌面探针覆盖创建多个真实 Godot 会话及 API 交接，不把它扩大为桌面中实际模型对话交接验证。

仍不授予 G2/ENFORCED 或无人值守执行。下一步应定位全新 Profile 初始化超时，并由用户评估只读交接内容是否足以减少重新指挥；普通建档/交接展示 UI 尚未实现。

## 冷启动超时定位复核（2026-10-16，最新结论）

本轮未找到能确定归因的启动逻辑缺陷，**不能声称原偶发超时已修复**。此前“资源准备导致超时”只是一项假设，现已降为未证实。

受控复核均为全新独立 Profile，无 warm-profile 预准备；同一条真实 Electron 驱动完成冷启动、两次 UI 挂载、正常退出/重开、会话创建、认证 handoff 精确比对和原项目选中文件不变检查：

| 对照 | Godot apply | Harness ready（桌面启动后） | 结果 |
| --- | --- | --- | --- |
| 阶段计时、隔离 bridge/memory | 5.250s | 13.741s | PASS |
| 默认 bridge/memory，其他条件不变 | 5.963s | 14.725s | PASS |
| 最终 opt-in 诊断、默认 bridge/memory | 5.301s | 13.838s | PASS |

因此不能用此前“预准备通过、冷启动失败”直接推导复制是根因；对照还需排除 bridge/memory 配置，且系统缓存/运行负载未锁定。本轮没有清空系统缓存、关闭防护或修改用户环境。旧冷启动日志同时延后的多个 loader 等待计时只提示存在进程/调度层等待，尚不能证明某个插件同步阻塞或定位到磁盘/防护软件。

实际保留的变更：

- `index.js` 增加默认关闭的 `GODOT_CODELY_STARTUP_TRACE=1`：固定阶段起止、累计单调耗时、5 秒等待心跳与事件循环延迟；初始化完成/卸载停止。它从 apply 起记录，不能覆盖此前模块导入/宿主初始化耗时。
- 桌面探针遇到 Harness 明确失败即结束等待，保留日志；新增 `--default-bridge-memory` 对照和实际挂载耗时。未增加重试掩盖失败，也未延长产品 loader 时限。
- 删除临时 DEBUG 标记，最终诊断使用明确的 opt-in 接缝。没有改动复制、bridge 或权限逻辑；没有以尚未证实的假设引入性能重构。

相关 4 套件验证：32 项通过、1 项因缺少 GODOT_TEST_BIN 跳过。包含治理/桌面 API、真实 MCP 子进程和真实 ASAR provisioning。Godot 插件已重新生成并实际由 Electron 加载；Node 语法与差异检查通过。未重复全量回归，未更新已安装应用。

证据：`.build/governance-desktop-probe/` 保留原 cold-attempt 失败、warm-passed 对照、cold-traced、cold-defaults 与最终 results/first/reopen 日志。以最新 results 的 warmProfile=false、defaultBridgeMemory=true 为准。当前判定为 **COLD_AND_REOPEN_OBSERVED_PASS / INTERMITTENT_TIMEOUT_UNRESOLVED / HUMAN_VALUE_PENDING**。再次出现故障时需使用阶段/心跳证据定位；连续通过不是根因修复证明。

最终清理补充：末轮桌面断言和两次正常退出已通过，但驱动随后卡在清理重试，不能把整个旧命令报告为正常退出 0。剩余文件仅为输入法注入日志，已确认并停止本轮驱动的清理进程，没有停止系统输入法或其他应用。已修复探针递归 rm 在各级重复 retry 的长等待：maxRetries=0，锁占用写入 cleanup.json 并退出 2，明确区分验收结果与清理结果。随后对同一残留目录验证清理逻辑，7ms 完成；cleanup.json=REMOVED，临时 Profile 无残留。该修复针对测试清理，**不是原启动超时的根因修复**。
