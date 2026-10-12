# Godot Codely 定制层记忆（packages/dsh-godot-stack/AGENTS.md）

本文件覆盖本目录的定制工作。仓库根级 AGENTS.md（上游 DSH 开发约束）仍然适用；
本目录规则更具体时优先。

## 产品定位
Godot Codely = 垂直 AI 编程助手：内核 @deepseek-ai/dsh + Godot UI（桌面端）+ headless CLI 双形态，
能力面标杆 Tuanjie Cowork。品牌：候选B 机器人吉祥物（白底深蓝圆头机器人 + 圆角字标 "Godot Codely"）。

## 本目录职责
- `index.js` —— DSH 插件入口（apply：preset / MCP 复制 / bridge）。**MCP 复制必须增量 + 排除 node_modules**
  （勿恢复全量 cp，会拖慢启动至 95s+ 超时）。
- `cli/godot-codely.mjs` —— CLI 启动器（品牌横幅 + --model/--provider/--list-models + config add|list）。
- `godot-stack/mcp/godot-mcp-server/` —— MCP server（src 编译到 build；node_modules 现场安装，不入库）。
- `godot-stack/agent-presets/godot-codely-lite/` —— agent 预设。
- `skills/godot/` —— Godot 领域技能。
- `README.md` —— 模型套餐 / 多模态 / 子代理 / 启动修复 文档。

## 常用命令
```bash
# 本目录开发
npm install && npm run build     # 编译 MCP server 等
# CLI 跑任务（从 cli/ 目录）
cd cli && node godot-codely.mjs --model qwen3.8-flash "任务"
node godot-codely.mjs --list-models
# 打包
cd D:\godot-codely-desktop && npm run package:win
```

## 关键陷阱
- **cordis.patch.yml 追加插件行**：必须放 `- insert:` 块；普通 `- id:` 只覆盖已有行。
- **模型**：默认 tokenplan-qwen / qwen3.8-flash（配额可能 429，切 kimi-for-coding）。
  已验证失效：zhipu(401) / minimax(402) / volcengine(400) / deepseek官方(402)。
- **多模态**：图像默认火山 ep- 接入点（~/.claude/skills/volcengine-generation/.env）；TTS 需自备 DashScope key。
- **子代理**：subagent_godot_scene / subagent_godot_shader / subagent_godot_gdscript 已配置（persona 定制）。
- **Godot 集成资产源** 在 D:\godot-extensions（addon/MCP/skills），改完按 README「更新资源」复制回本包。

## 能力对照进度（对标 cowork）
✅ #13 多模态资产生成（generate_sprite/generate_image/text_to_speech）
✅ #14 子代理系统（3 个 Godot 专家工具 + 启动修复 ad23a93）
📌 #15 记忆系统（本文件 + ~/.dsh/AGENTS.md 为产物，验证注入中）
⬜ #16 安全策略/协作模式（approval + plan/default）
⬜ #17 斜杠命令（godot 领域命令）
⬜ #18 LSP 通道（godot --language-server）
