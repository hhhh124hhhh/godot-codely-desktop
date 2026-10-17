# #26 R0 原生链路验收补充

2026-10-16（Asia/Shanghai）。范围：自动更新之外的 D2/D3/D4 原生链路与相关回归；不改变 #26 的放行门槛。

本文件记录首轮原生冒烟。后续真实模型修改/修复链路已完成，见 [真实模型补充报告](issue-26-real-agent.md)；下表的模型未测状态仅描述首轮，不代表最新进度。

后续窗口/会话/草稿恢复、中英文及两尺寸深浅主题检查见 [桌面 UI 与恢复报告](issue-26-ui-recovery.md)。

结论：本轮原生冒烟 PASS；R0 仍为 WAIT_EVIDENCE，R1 仍因 OBSERVED 写入边界 BLOCKED。没有进行真实模型调用或安装版验收，没有修改游戏用户工程。

## 受测来源与边界

- 仓库 HEAD：`21e607b17d310c9c0ba1bd63f101fb7be3a46d67`，应用声明版本 `0.1.4`。
- Windows，Node `v24.15.0`、Electron `43.0.0`、Harness `0.2.0-rc.2`；Godot 实际返回 `4.7.1.stable.official.a13da4feb`。
- 执行现有 `scripts/run-godot-engine-smoke.mjs`：实时打包测试入口、实际 Harness 子进程、隔离临时 userData/DSH_HOME/Godot 用户目录，清理由脚本完成。
- 使用现有开发 preload，SHA-256：`EF68000F158F9EB7A045A4B1864E4ECA144FA49EF1A570AAE77235AF053CCE50`。没有为本轮重建整应用，不能把 HEAD 或 package.json 版本当作完整安装产物身份。
- 未操作其他窗口的自动更新工作；未安装、升级、卸载或改动用户模型配置。

## 实际检查

```powershell
node node_modules/vitest/vitest.mjs run test/godot-desktop-api.test.mjs test/godot-editor-control.test.mjs test/godot-runtime.test.mjs test/godot-governance.test.mjs --maxWorkers=2
# 35 PASS / 1 SKIP（尚未传 GODOT_TEST_BIN）

$env:GODOT_TEST_BIN='<Godot 4 executable>'
node node_modules/vitest/vitest.mjs run test/godot-editor-live.test.mjs test/godot-runtime.test.mjs --maxWorkers=1
# 10 PASS / 0 SKIP，包含上轮跳过的真实引擎选择项；重复 runtime 项不累计为独立测试

node scripts/run-godot-engine-smoke.mjs
# exit 0 / Godot engine native acceptance passed
```

最初沙箱内 Vitest 因 `realpath EPERM` 未执行测试；在允许的沙箱外运行后通过。原生冒烟输出中的 `ENGINE_ALREADY_RUNNING`、`WORKSPACE_MISSING` 是负例断言对应的预期失败。

| Gate | 本轮新增证据 | 仍缺少的验收 |
| --- | --- | --- |
| D1 | 干净临时 Profile 的实际 Harness/认证/UI 链路可启动 | 同一完整安装包身份、安装/升级/卸载、重启重复验收 |
| D2 | 真实 workspace/create、Lite session 创建；API/治理项目隔离、Windows junction 与过期结果回归通过 | 安装版多项目切换、草稿/会话关闭重开与完整交互 |
| D3 | 真 Godot 非 headless Run/Stop、stdout `NATIVE_GAME_READY`；真实编辑器 Play/Stop 测试通过 | 真实选定模型修改 GDScript、插错修复与重新验证；真人行为确认 |
| D4 | 拒绝重复运行/未知工程/Safe Mode/另一窗口/外部 origin；停止保留日志，退出仅停止所属游戏并保留编辑器；超时不重放、损坏恢复/CAS 回归通过 | 完整模型失败/审批拒绝/崩溃/取消矩阵与安装版恢复流程 |
| D5 | 实际 React 工作台挂载及运行日志截图 | 1280×800/窄窗、中英文/深浅主题、输入/键盘及人工易用性验收 |
| D6 | 上述专项检查通过 | 当前完整候选的 typecheck/build/CI/产物验收，本轮未执行全量回归 |

原生引擎选择器使用测试替代文件选择对话框，只证明选择结果保存及使用，不证明真人操作原生文件选择器。真实编辑器 Play/Stop 套件启动 headless editor，不能代替可见编辑器人工操作。

## 本地证据与下一步

- `.build/godot-engine-acceptance/result.json`：`status=passed`、`platform=win32`、`headless=false`、`isolatedGodotUserDirectories=true`，包含 14 个检查标识。
- `.build/godot-engine-acceptance/workbench.png`：本轮已查看，实际 Lite 会话、原生聊天输入、Godot 版本与运行日志可见。SHA-256：`D3621B28B1E9DE9C38456C3914FC60CEFB92FC9C7389A74CAE30CF58E36F5879`。
- 生成文件保留为本地验收证据，不重复提交截图或测试 bundle；该输出目录其他历史截图不属于本轮证据。

下一步优先补 D3：在选定完整候选及隔离 fixture 中，记录真实模型指令、工具调用、文件前后哈希和 Godot 错误/修复日志。随后由用户完成 D5 人工体验检查。G1–G5 本轮未新增强制写入或治理 Gate 能力，不能放行受管游戏试点。
