# 游戏创作 WITNESS 与验收卡对齐

2026-10-17（Asia/Shanghai）。已读取 GitHub [验收卡 #26](https://github.com/hhhh124hhhh/godot-codely-desktop/issues/26) 正文及评论，以及 [治理 RFC #24](https://github.com/hhhh124hhhh/godot-codely-desktop/issues/24)。本轮是最小 G2 WITNESS 与事实交接增量，不是整套 G2/G3 或 R1 放行。

## 本轮交付

- 复用现有 MCP `project.verify` 的 TypeScript 验证器，构建时生成 `governance/validator.mjs`。没有复制第二套编译/冒烟算法，没有新增运行时依赖或 Agent runtime。
- 可信 Node 采集器读取已注册 workspace 和已保存任务。浏览器请求只能携带 projectId/state revision，不能指定执行文件、项目路径、任意命令或 PASS/outcome。
- 执行前先发布 RUNNING/UNKNOWN 观察；执行后追加独立结果，绑定 project/task/run、当前文件指纹、Godot 精确版本、Node/平台/架构、验证器摘要、固定帧数、原始 stdout/stderr 和时间。崩溃/最终 CAS 冲突不能回到旧 PASS。
- 原始收据按内容摘要保存到项目权威目录下 `witness/<sha256>.json`，写入并 fsync 后再由原子 journal 事务引用。读取校验摘要和 journal 字段对应关系；损坏不升级通过。仅最近一次相关运行的观察决定当前检查，历史原文仍留在 journal。
- `GODOT-COMPILE-SMOKE@1` 只评价编译/headless 冒烟；`GODOT-TASK-REVIEW@1` 还要求当前 scope/revision 的独立真人回答。生产界面尚未开放真人证明写入，所以技术通过后仍 WAIT_HUMAN，不 Local Close。
- 纯判定器区分 PASS / WAIT_EVIDENCE / WAIT_HUMAN / REPAIR / STOP / UNKNOWN，输出具名 gate、策略版本、理由、缺项、阻断证据与所评价 state revision。人工否定和终止规则通过独立输入回归；不把这些单测写成生产强制 STOP 已完成。
- 文件或环境变化时旧证据失效；不匹配的项目/run、Agent 自报、设备类型或覆盖不足均不能满足要求。Godot headless PASS 不推出 Web、Android、FUN 或发布通过。
- 当前保守覆盖全部普通文件，只排除 `.git` / `.godot` 生成状态。内部链接资源、超限/变化中的输入拒绝确认；根目录别名仍复用现有项目物理身份。不宣称已实现细粒度依赖分析。
- 工作台默认显示事实摘要：任务、自动验证、人工确认状态、文件版本、停止/缺证据原因与下一步；编辑表单和原始依据按需展开。重读与 prompt 组装重新核对文件和环境，不是后台常驻监测。

当前仍为 **OBSERVED / MANUAL+RESUMABLE / executionAuthorized=false**。没有新增行动授权、ContinuationRunner、触发器、预算执行器、强制写入拦截、生命周期转换或对外发布。UNKNOWN 收据需要先核对现场，采集器拒绝盲目重放；尚无自动对账/一键恢复执行流程。

## 用户范围调整：Office/PPT 暂停

用户本轮明确要求专注游戏创作。默认宿主组合不再挂载 Office/PPT；普通模式和 Safe Mode 都停用上游 `office-to-pdf`。旧宿主 patch 中的 Office/PPT 插入项在源码解析前过滤。锁定 Harness 补丁去掉相关宿主依赖注入，保留 Godot 和图像生成。

`dev` / `build` / 原生打包不再准备 Office/PPT。安装包过滤这些插件及 Python/LibreOffice 负载；afterPack 保留品牌、原生二进制、Godot 闭包验证，并增加禁止 Office/PPT 混入的 ASAR 检查。源码、锁文件中的本地依赖、专项命令和用户已有数据保留。全量源码测试的 pretest 仍准备被保留套件的依赖；它不属于游戏专项迭代。

此前为解除 Office 构建目录 EPERM 临时增加的重试已撤回，本轮不继续维护 Office 功能。普通游戏构建已通过，运行链不再需要 Office 资源。

## 实际验证与证据

```powershell
# 指向本机实际 Godot 4 可执行文件，不要复制机器路径到源码/fixture。
$env:GODOT_TEST_BIN='<Godot 4 executable>'
npm run test:governance
npm run test:governance:runtime
npm run typecheck
npm run build
node scripts/probes/governance-record-ui.mjs
git diff --check
```

- 治理专项 5 套件 38 项通过，包括实际 Godot PASS → 外部改动 STALE → 编译 REPAIR → 修复 PASS、原始收据损坏、并发运行、最终提交冲突后 UNKNOWN 与禁止重放。
- 随游戏范围调整追加的相关回归：12 套件 96 项通过，含宿主来源投影、Profile 一致性、包范围 ASAR、发布合同、Safe Mode 和治理。后续 `office-to-pdf` 调整须以最终复核结果为准。
- 真实临时 Harness 重启、切换 Agent、插件卸载重载、原权限/工具保留通过。根 typecheck、探针单独 strict/noUncheckedIndexedAccess、治理声明检查通过。
- 锁定 Harness 补丁在 `.build/game-host-patch-replay/result.json` 记录原始态反向还原和正向重放通过。未在共享 node_modules 上执行全新 npm ci，不能冒称 clean install/postinstall 通过。
- Office 暂停前的 `.build/governance-record-ui/run-ZWdhhy/result.json` 为 passed：真实 bundled MCP 脚本写入（前后摘要）→ 工作台真实 Godot 验证 → 外部插错/修复 → 中英文/深浅/两尺寸/键盘 → renderer 关闭与 Harness 重启恢复。它不能替代游戏专用组合的最终复核。

桌面探针只操作自建临时项目、独立 userData/DSH_HOME 与探针自己的 native cache。每次 `run-*` 的 candidate.json 保存 HEAD、锁文件、实际 host patch/安装目录模块、main/preload 和生成插件摘要。直接 MCP 调用是真实工具协议，不是模型回合，也不是 ENFORCED 通道；不冒充当前候选 D3 真实模型验收。

已保留的失败：Harness 的 Windows `execFile` 包装不保留 custom-promisify 返回结构，导致版本输出缺失；已改为显式回调并在桌面断言保留真实 `VALIDATION_COMPLETE`。另有探针工作台/存储等待失败、Office 资源生成 EPERM 与缺资源启动失败。游戏专用负例首次揭示上游 `office-to-pdf` 对 LibreOffice 的依赖，已据此停用；失败目录不记 PASS。

## #26 当前判定

| 项 | 本轮证据 | 尚未关闭 |
| --- | --- | --- |
| D1/D6 | 游戏开发构建、候选摘要、专项/类型检查 | 当前工作区不是已签核安装包；完整安装升级、全新 npm ci、远程 CI 与全量回归结论需分别记录 |
| D2/D4/D5 | 项目隔离、CAS/UNKNOWN、重开、双语/主题/键盘的实际桌面证据 | 完整失败矩阵、安装版流程与人工体验仍须验收 |
| D3 | 本轮直接真实 MCP 与 Godot；此前真实模型证据另见 issue-26 报告 | 不能将不同开发候选拼成同一安装包真实模型 PASS |
| G1 | 保留 OBSERVED | 未覆盖受管写入强制边界，**R1 BLOCKED** |
| G2 | 复用权威状态、任务、原始委托与恢复 | 不是有效执行授权强制器，无预算/过期授权执行窗口 |
| G3 | 真实收据、输入/环境绑定、确定性技术 Gate、失效/修复/未知路径 | 尚未完成独立真人证明持久化、真实设备收集、完整 G2 Preflight 与外部副作用对账 |
| G4 | 事实摘要和真实恢复增量 | 真人恢复耗时/交接价值、有效授权范围续作尚未签核 |
| G5 | 负例证明未知/损坏不升级通过 | 无同一完整安装包的越权拒写、Android/人工检查点端到端安全演练 |

**Decision：WAIT_EVIDENCE；R1 BLOCKED。** 不修改 issue checkbox，不进入《折层工厂》正式受管试点，不自动发布。最终人工问题是：用户返回后，是否能从摘要正确判断已验证、未验证、停止原因与下一步；自动化不能代签这个判断。
