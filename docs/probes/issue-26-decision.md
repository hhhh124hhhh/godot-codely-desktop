# #26 验收决策记录

本记录区分“已执行的验收子项”与“整张 Release Gate 放行”。自动化不得替代 issue 要求的人类审核，也不因安装包已发布而改变 R0/R1 门槛。

## 候选与证据归属

- 已发布候选：[0.1.4 unsigned](https://github.com/hhhh124hhhh/godot-codely-desktop/releases/tag/v0.1.4-unsigned)，源码 `ba47931c3e7d4b058d150d68ce65b2a35a07e6d7`。
- Windows 安装包由 GitHub 报告 SHA-256：`8a6f69dafcd29890bee6f98057774f9ca76f8f39d06c22373bb1f464aed86f49`。专用升级验收另将下载文件对照发布的 SHA256SUMS，并与更新器实际下载结果核对。
- [构建与安装流水线 38920714355](https://github.com/hhhh124hhhh/godot-codely-desktop/actions/runs/38920714355) 全部成功，包含实际 Windows 安装、锁定升级失败回退、同目录覆盖、异目录安装、客户端引导和预设发现。自动升级尚需单独的真实更新器流程，不能用该流水线代替。
- [原生 Godot 报告](issue-26-r0-native.md)、[真实模型报告](issue-26-real-agent.md)、[UI/恢复报告](issue-26-ui-recovery.md) 属于各自注明的开发运行方式，不能改写成全部发生于该安装包。
- 新增治理建档/交接界面正在另一个工作窗口推进，未纳入本候选或本记录的通过结论。

## R0 / R1 当前逐项结论

| 项 | 已验证事实 | 整项判定与剩余 |
| --- | --- | --- |
| D1 | 0.1.4 安装包身份、真实远程安装、锁定失败回退、手动覆盖升级及真实自动升级（下载/安装/重启/数据保留）均有 CI 证据 | PASS（专项）：常规目录自动升级闭环；卸载保留、自定义目录修复（`c42bb33`）发布后再验与全部真人安装体验仍缺 |
| D2 | 真实 Lite 会话创建、项目身份/路径别名、开发 renderer/Harness 重开后同会话与草稿恢复 | WAIT_EVIDENCE：完整候选多项目实际交互与全部关闭重开生命周期 |
| D3 | 自定义真实模型完成脚本修改、编译/冒烟、注入错误并同会话修复；真实 Godot Run/Stop 和编辑器 Play/Stop | WAIT_EVIDENCE：同一完整安装候选内模型闭环、真人最小行为确认；不能把开发证据拼成同包通过 |
| D4 | 模型缺凭据真实报错、停止/日志保留、错误所有权、超时不重放与损坏/CAS恢复回归 | WAIT_EVIDENCE：安装候选内审批拒绝、崩溃/取消/外部修改等完整矩阵 |
| D5 | 中英文、中文深浅主题与两种宽度、Tab、草稿保留/恢复实际截图与行为检查 | WAIT_HUMAN：非全组合覆盖，工作台切换/长日志及真人易用性未完成 |
| D6 | 0.1.4 远程构建/测试/类型/安装UI成功；新增升级夹具及更新专项 36 PASS | WAIT_EVIDENCE：专项结果与实际候选归属必须保留，不能宣称所有门槛已满足 |
| G1 | 局部 Hook 拦截有探针，仍有未强制入口，产品保持 OBSERVED | BLOCKED：当前 issue 明确不允许在这一模式下放行受管试点 |
| G2 | 权威状态、CAS、过期事实、项目隔离与恢复具备局部证据 | 部分证据：不是执行授权强制器，不整体 PASS |
| G3 | 保存原始观察/来源，模型/Godot 核心链路另有证据 | NOT_IMPLEMENTED：未验证有效性/Gate 判定闭环 |
| G4 | 有只读交接与恢复后端；新建档/交接 UI 由其他窗口实现中 | NOT_TESTED：不提前采纳未交付候选或代替真人交接评价 |
| G5 | 普通工具修改与验证通过 | NOT_TESTED：没有同包端到端强制越权拦截演练 |

## 决策与交接

### 2026-10-17 自动升级专项进度

- [38988632254](https://github.com/hhhh124hhhh/godot-codely-desktop/actions/runs/38988632254)：真实更新提示、下载、SHA-256 对照、触发安装均通过；安装/重启判定失败。
- [38989472516](https://github.com/hhhh124hhhh/godot-codely-desktop/actions/runs/38989472516)：窗口文本和截图证实安装向导停在用户范围选择页。探针未正确识别原生 Next 控件，已修正驱动。
- [38990060870](https://github.com/hhhh124hhhh/godot-codely-desktop/actions/runs/38990060870)：真实 Next/Finish 已完成，应用已自动启动，但目标由自定义 `installed` 变成 `installed/Godot Codely`，没有替换原目录。此项是实际自定义目录升级缺陷，不计 PASS。
- 根因：锁定版本 electron-builder 的 assisted installer `instFilesPre` 会给不含产品名的目录追加产品名；更新路径也执行了该逻辑。修复提交 `c42bb33` 将此行为限制为非更新安装。定向模板与夹具回归 5 PASS；**修复尚未进入已发布 0.1.4，尚无新安装包的原生修复验收**。
- [38990761315](https://github.com/hhhh124hhhh/godot-codely-desktop/actions/runs/38990761315) 正在验证已发布 0.1.4 在常规产品目录下的其余更新与数据保留链路；即使成功，也不消除上述自定义目录缺陷。
- [38991669999](https://github.com/hhhh124hhhh/godot-codely-desktop/actions/runs/38991669999)：修复限流后更新器真实下载/安装/自动重启全通过；最终 settings 断言误读 `settings.json`（该文件只是 godot-stack MCP 注册，权威设置在 settings 服务文档），改为经 `settings/describe` API 读回并补前后快照。
- [38992438040](https://github.com/hhhh124hhhh/godot-codely-desktop/actions/runs/38992438040) **PASS**：已发布 0.1.4 安装包对 0.1.3 种子的真实自动升级全流程通过——更新提示、下载（SHA-256 与发布一致）、NSIS 安装、自动重启；升级后会话、凭据值与元数据、`localStorage` 草稿、`settings/describe` 的 `locale.preference='en'` 均保留（证据 artifact `windows-auto-upgrade-evidence`，`ui-result.json` 全 true）。限制：种子为降版本夹具，不代表官方旧版本兼容或真人 UX 验收；自定义目录缺陷 `c42bb33` 的修复不在 0.1.4 内，需新版本发布后再验。

当前自动化决策：**WAIT_EVIDENCE；R1 BLOCKED**。不记录 R0_READY/R1_READY，不关闭 #26，也不授权《折层工厂》的正式受管试点。只有对同一候选收齐 R0 的必需证据并由人类确认，才能记录 R0_READY；R1 还必须满足现有强制边界要求，不能通过改名或隐藏工具旁路得到 PASS。

下一步优先闭合自动升级专项，再将完整候选的剩余验收与人工检查分别落到明确记录。安装/下载/启动成功、开发证据、人工行为与治理强制四类结论不相互代替。
