# 最小项目建档与交接入口

> 后续进展：2026-10-17 增加真实 WITNESS、确定性 Gate 与默认事实摘要，Office/PPT 从游戏产品暂停。当前状态和验收卡对齐见 [WITNESS 记录](governance-witness.md)。下文为首次建档界面验收，不能替代新候选验收。

2026-10-16（Asia/Shanghai）。承接 [G1b](issue-24-g1b.md) 的后端事实恢复，在现有 Godot 工作台的「项目概览」增加项目记录与交接区域。

## 用户流程与边界

1. 选择已注册的 Godot 工程，填写记录人姓名，建立项目记录。
2. 填写任务目标、允许修改范围、停止条件、当前进度与下一步，保存任务短卡。
3. 重开或切换回来时读取同一项目记录；已有 Agent prompt 交接接缝继续使用同一权威存储。
4. 查看原始验证记录及可展开的完整交接、停止原因和诊断信息。来源与原始 PASS/FAIL/UNKNOWN 保留，证据有效性仍为 NOT_EVALUATED。

仍为 **OBSERVED**，不拦截工具写入，不授予执行权限，不生成 Gate PASS、不新增调度或模型工具。姓名是用户填写的记录归属，不是已认证的人类身份或执行授权。本轮不实现 G2 或 ENFORCED。

## 实现合同

- 沿用 `ProjectStore` 与 `$DSH_HOME/governance/projects/<canonical-root-hash>`，没有第二套持久化源。
- 新增同源、已认证 Harness 路由 `POST /api/godot-desktop/record?workspaceId=…`；根目录只取已注册 workspace，不接受文件路径。
- `create` 只建档；`task` 只写五个短卡字段，必须携带 projectId 和 expectedStateRevision。请求限制长度、字段、姓名和文本，不能提交授权、政策、验证结果或任意状态补丁。
- 原 GET handoff 保持只读。版本冲突返回 409，不自动重试覆盖；重读保留当前表单输入，完整交接展示最新状态，核对后由用户再次保存。
- 目标、修改范围或停止条件变化时分配新 runId，避免旧验证记录继续匹配当前运行。单纯进度更新保留运行归属。
- 损坏状态停止写入并展示诊断；每个 workspace 的表单独立挂载，请求在卸载时取消，迟到结果不写回另一个项目。
- 客户端使用既有 ModuleLoader、工作台挂载和 locale；未改 bootstrap、解析 anchor、Profile 组合或 Safe Mode 加载规则。新增服务端模块由现有 governance 文件白名单及构建复制流程携带。

## 可复现检查

```powershell
node node_modules/vitest/vitest.mjs run test/godot-desktop-client.test.mjs test/godot-desktop-api.test.mjs test/godot-governance.test.mjs --maxWorkers=2
npm run typecheck
npm run build
npm run test:governance:runtime
node scripts/probes/governance-record-ui.mjs
node node_modules/typescript/bin/tsc --noEmit --strict --noUncheckedIndexedAccess --skipLibCheck --module ESNext --moduleResolution bundler --target ES2022 scripts/probes/governance-record-ui.ts
git diff --check
```

桌面探针只操作自建临时工程和独立 Electron userData / DSH_HOME，不发送模型请求。每次证据在 `.build/governance-record-ui/run-*`，临时 Profile 与工程结束后删除。日志保存前移除 endpoint token。

## 验收状态

定向 3 套件 29 项通过；根类型检查、探针单独 strict/noUncheckedIndexedAccess 检查及完整构建通过。首次沙箱内 Vitest 因 realpath EPERM 没有执行测试，沙箱外重跑通过。

桌面首轮探针分别因未等待工作台标签选中、未切到项目概览而超时；没有作为产品通过证据。后续键盘探针因隐藏窗口没有网页焦点失败，补窗口/网页焦点后通过，保留失败收据。

最终生成包验收：`.build/governance-record-ui/run-GxYDmF/result.json` 为 passed，覆盖真实 UI 建档/保存、冲突拒写与重读保留输入、项目切换隔离、1280/900 深浅主题截图、中英文标签、实际 Tab 焦点顺序、关闭 renderer 并重启真实 Harness 后完整交接一致。截图已检查；窄窗收起可切换的项目信息侧栏后检查表单。引擎 IPC 在本探针返回明确不可用，不把它当引擎运行验收。

`npm run test:governance:runtime` 通过真实临时 Harness 重启、Agent 切换与原权限/工具保留检查；最终 API 套件 6 项通过，包含项目身份不匹配、损坏记录停止写入的负例。完整构建后新增的项目身份校验已再次通过 Godot 运行包生成、API 回归及上述最终桌面流程；未重复无关 Office/PPT 构建。

真人需在实际项目上检查：恢复后是否清楚目标、修改范围、停止条件、当前进度与下一步，是否减少重新指挥。自动化不能替代这项价值评价。当前不宣称已安装版本、完整安装包、人工易用性或强制治理验收通过；未运行全量 npm test。
