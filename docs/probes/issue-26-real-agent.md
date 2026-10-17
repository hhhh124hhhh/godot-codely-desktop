# #26 真实模型修改与修复证据

2026-10-16（Asia/Shanghai）。结论：**D3 的真实模型 → Godot MCP 写入 → 编译/冒烟 → 注入错误 → 同会话修复链路 PASS**。D3 整体仍缺受测完整安装包与真人可观察行为确认，R0 保持 WAIT_EVIDENCE；本轮没有补建治理强制能力，R1 仍 BLOCKED。

## 受测环境与范围

- 仓库 HEAD：`21e607b17d310c9c0ba1bd63f101fb7be3a46d67`，应用声明版本 `0.1.4`。新增探针为当前未提交工作区源码。
- Windows / Node `v24.15.0` / Electron `43.0.0` / Harness `0.2.0-rc.2`。
- 实际 Godot：`4.7.1.stable.official.a13da4feb`。MCP 原始返回和独立 Godot 子进程输出均核对同一版本。
- 用户明确授权仅发送新建最小夹具、验收提示和工具结果至现有阿里云模型服务，使用 `qwen3.8-flash`；这是自定义真实模型，不是固定响应适配器，也不证明默认 DeepSeek 模型通过。
- 实际 Electron 窗口、认证后的 Harness API、真实 workspace/create、桌面 session API 创建的 `godot-codely-lite` 原生会话。提示由已认证 renderer RPC 提交，不是人工点击聊天发送按钮。
- 临时 userData、DSH_HOME、项目与记忆目录；没有复制真实用户 Profile、凭据文件或游戏工程。密钥通过环境凭据引用读取，没有写入临时 overlay。完成后夹具/Profile 已删除；证据文本扫描未发现本次凭据值。
- 使用现有开发 preload，未重建或安装完整应用；不作为正式安装版验收。原生 UI 的首次挂载截图不显示本轮会话内容，只证明 UI 引导，不能当作聊天交互或 D5 PASS。

## 真实执行结果

成功运行的证据目录：`.build/godot-agent-desktop/run-QJ5QZb/`。两次模型 turn 均以 `completed` 结束，共 15 次真实工具调用。

| 步骤 | 原始证据 | 结果 |
| --- | --- | --- |
| 初始脚本 | `files.json` 的 baseline；独立 `baseline.log` | SPEED=100，Godot check-only exit 0 |
| 模型读后写 | journal seq 37/42/47，`mcp__godot__scripts` read/write/read | SPEED 改为 240，保留打印逻辑 |
| 模型验证 | journal seq 52→53，project.verify | compile + smoke 均 exit 0；stdout `CODELY_SPEED=240` |
| 独立复核 | `changed.log` | check-only exit 0 |
| 人为插错 | 追加 `func intentional_error(:`；`broken.log` | check-only exit 1 |
| 模型先读真实失败 | journal seq 80→81，project.verify | `isError=true`，`Expected parameter name`，定位 main.gd:6 |
| 模型修复 | journal seq 85/90，scripts read/write | 只移除注入错误，保留 SPEED=240 |
| 模型再次验证 | journal seq 95→96，project.verify | compile + smoke 均 exit 0；stdout `CODELY_SPEED=240` |
| 独立最终复核 | `repaired.log` | check-only exit 0；project.godot/main.tscn 哈希不变 |

文件 SHA-256：

| 状态 | SHA-256 |
| --- | --- |
| baseline | `3eb13da231d0f9e35412808a39e9311cf3d04abcb3128b9a3590f8d142326a49` |
| changed / repaired | `6932de6bfbf9e1d7ac99e9d6c24c1dc20ed5537403b50dfdbfeb241c7532c7b6` |
| broken | `d0313b653677d2dc1c6b0acae084d5d34e0ba1c6364d0d7860c2f26a82ed9905` |

修复后与注入错误前逐字相同；不把文本“修好了”当作通过依据。模型的只读 `glob` 属于实际入口记录；本轮未调用 shell/子代理，不能据此宣称这些入口已被强制拦截。

证据完整性：

| 文件 | SHA-256 |
| --- | --- |
| journal.json | `fbad6161167ba4e66880f9b24473a30ef49ba8753025dcfd242fcad1913a8340` |
| files.json | `9b76860365b551c2f6072ed26e351f054b81b36b4e95c4476734e5d208821e62` |
| result.json | `a5a7711ec1660111b43cf4edb73f77f659d79d1deef86881b639d6732760c1bf` |

## 可复现入口与检查

```powershell
# 已由调用环境提供 ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_MODEL。
# 新的外部模型目的地或数据范围需另行授权；不要把凭据写入命令历史或报告。
$env:GODOT_TEST_BIN='<Godot 4 executable>'
node scripts/probes/godot-agent-desktop.mjs
```

探针生成独立证据目录，按真实 session journal 等待完成；超时会取消会话并停止所属 Harness，不盲重试。每轮保留原始提示、调用/结果、四阶段文件快照、独立 Godot 日志，生成产物不重复提交。

本轮另执行并通过：`npm run typecheck`、探针 TS 单独 strict/noUncheckedIndexedAccess 类型检查、runner 的 `node --check`、`git diff --check`。根 typecheck 不包含 scripts，因此单独检查是必要的。本轮未运行 build 或全量 npm test，前轮原生与定向结果见 [原生报告](issue-26-r0-native.md)。

首次实验未通过探针：只读 glob 被过严入口断言拒绝，而且 Godot 路径在 MCP 启动后才写入，导致自动发现 4.6.3。保留的首轮 `.build/godot-agent-desktop/{journal,files,result}.json` 为失败证据，不能与成功目录混用。修正探针为启动前固定引擎、显式选择路径并核对版本，允许限定的只读查询后，用全新临时 Profile 完整重跑；没有修改产品代码来凑 PASS。

## 当前放行缺口

后续窗口关闭/Harness 重开及草稿保留、中英文与尺寸检查已补充部分证据，见 [UI 与恢复报告](issue-26-ui-recovery.md)；不代表完整安装版流程或人工体验已通过。

- R0：同一完整候选安装包的安装/升级与身份追溯、真实会话交互/恢复、剩余失败矩阵、D5 多尺寸/语言/主题/键盘及人工体验、候选整体构建/CI 证据尚未补齐。
- D3：本轮真实模型工具链核心通过，完整安装版与真人确认仍 WAIT_EVIDENCE；不改变 issue checkbox 或自动发布。
- R1：OBSERVED 不能满足现有 ENFORCED 受管试点门槛；G3/G4/G5 等缺口未因本轮模型通过而关闭。
