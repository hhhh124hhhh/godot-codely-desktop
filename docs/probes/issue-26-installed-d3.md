# #26 D3 安装版真实模型闭环验收（0.1.5）

2026-10-17（Asia/Shanghai）。结论：**D3 的真实模型 → Godot 修改 → 运行验证 → 注入错误 → 同会话修复链路，在已发布的 0.1.5 安装版上以真人操作方式 PASS**。这是开发探针（issue-26-real-agent.md）之后的同包验收，模型配置由用户在应用 Models 页完成，提示由用户在真实窗口发送。

## 受测对象与边界

- 应用：本机 all-users 安装 `D:\Program Files\Godot Codely\Godot Codely.exe`，发布版本 0.1.5（v0.1.5-unsigned）。
- 模型：用户自配 provider（真实模型服务，非固定响应适配器）。
- 会话：真实 Profile（`%APPDATA%\godot-codely`）中 lite 预设会话 `session-32ea1117-d9f1-4c6a-91f1-521f4932e779`，工作区 `D:\codely-r0-fixture`。
- 夹具：`main.gd`（基线 `SPEED = 100`）、`project.godot`、`main.tscn`（后两者哈希全程冻结核对，未变）。
- Godot：`project.verify` 走应用内 MCP 自动发现的 4.6.3；独立复验走 Godot 4.7.1 headless（`D:\Godot_v4.7.1-stable_win64.exe`）。
- 人工边界：prompt 由真人发送（满足"用户确认"）；模型按键不在本记录范围。

## 第一轮：修改 + 验证（journal 109 条记录）

用户提示"把 SPEED 从 100 改为 240 并用 Godot 工具实际验证"。journal 工具链：

1. `read main.gd` → `edit` 改 `SPEED = 240`（成功）
2. `project.verify` → 失败 `GODOT_NOT_FOUND`（Godot 路径未配置）
3. 模型自行诊断：`config status/check`、`lsp_diagnostics`（4.7 LSP 正常）→ `config auto_setup` 发现 4.6.3 → 再次 `project.verify` → **成功，smoke stdout 含 `CODELY_SPEED=240`**，`turn/end completed`

独立复验：Godot 4.7.1 headless 运行输出 `CODELY_SPEED=240`；`main.gd` 与冻结文件哈希一致。

## 第二轮：注入错误 + 修复（journal 增至 151 条）

验收人员在 `main.gd` 末尾注入 `func broken(`（注入后独立验证报 `Parse Error: Expected closing ")" after function parameters`）。用户提示修复。journal 工具链：

1. `project.verify` → **失败，真实 Parse Error（main.gd:7）被观测**
2. `read main.gd`
3. `lsp_diagnostics` 仍报"无错误"（与实际矛盾，模型未采信）
4. `edit` 精确删除坏行（`old_string` 含坏行，`SPEED=240` 保留）
5. 再次 `read` 确认 → `project.verify` → **成功，`CODELY_SPEED=240`**，`turn/end completed`

独立复验：Godot 4.7.1 headless 输出 `CODELY_SPEED=240`，无 Parse Error；`main.gd` 最终哈希 `07337dd0…`，冻结文件未变。

## 发现与限制（如实记录）

- **首次使用 Godot 路径未配置**：`project.verify` 直接 `GODOT_NOT_FOUND`，靠模型 `auto_setup` 兜底。首次使用引导应主动提示配置 Godot 路径（记入 D5 缺口）。
- **LSP 诊断不可信**：修复前 LSP 报"无错误"，与实际 Parse Error 矛盾（4.7 LSP 服务器与 4.6.3 编译器版本不一致，疑似陈旧缓存）。验收与模型决策应以 `project.verify` 真实编译输出为准。这是上游 Godot MCP 的已知风险，不是本次回归。
- 用户沙箱内 shell 不可用（`SetNamedSecurityInfoW failed`，用户环境 ACL 问题，非产品缺陷）；全部操作经 MCP/文件工具完成，未影响结论。
- 本轮是真人操作的单会话验收，非自动化批量；不代表所有提示词或模型下的行为。
