# Godot Codely 定制层记忆（packages/dsh-godot-stack/AGENTS.md）

本文件覆盖本目录的定制工作。仓库根级 AGENTS.md（上游 DSH 开发约束）仍然适用；
本目录规则更具体时优先。

## 产品定位
Godot Codely = 垂直 AI 编程助手：内核 @deepseek-ai/dsh + Godot UI（桌面端）+ headless CLI 双形态，
能力面标杆 Tuanjie Cowork。品牌使用蓝色机器人，唯一图形源为根目录 `build/brand-mark.svg`；桌面图标不含字标，界面使用同一 SVG 的单色轮廓，CLI 使用 `cli/brand.mjs` 的字符版。图标与动画由 `npm run brand:prepare` 生成到 `.build/brand-assets`，不单独维护 PNG/ICO/ICNS 副本。

## 本目录职责
- `index.js` —— DSH 插件入口（apply：preset / MCP 复制 / bridge）。**MCP 复制必须增量 + 排除 node_modules**
  （勿恢复全量 cp，会拖慢启动至 95s+ 超时）。
- `cli/godot-codely.mjs` —— CLI 启动器（品牌横幅 + --model/--provider/--list-models + config add|list）。
- `godot-stack/mcp/godot-mcp-server/` —— MCP server（src 编译到 build；node_modules 现场安装，不入库）。
- `godot-stack/agent-presets/godot-codely-lite/` —— agent 预设（短 persona + `docs/`）。
- `skills/godot/` —— Godot 领域技能。
- `README.md` —— 模型套餐 / 多模态 / 子代理 / 启动修复 文档。

## 常用命令
```bash
# 本目录开发
npm install && npm run build     # 编译 MCP server 等
# CLI 跑任务（仓库根，bin 为 godot-codely）
node packages/dsh-godot-stack/cli/godot-codely.mjs --model <模型ID> "任务"
node packages/dsh-godot-stack/cli/godot-codely.mjs --list-models
# 打包（仓库根）
npm run package:win
```

## Persona 同步（DeepSeek-V4.1-Flash 短提示词）

每轮只注入短 persona。下面两处正文必须逐字相同（比较时去掉文件末尾那一个换行；YAML 用 `|-`，加载结果不带末尾换行）：

- `godot-stack/agent-presets/godot-codely-lite/SYSTEM_PROMPT.md`
- `godot-stack/agent-presets/godot-codely-lite/agent.cordis.yml` 中 `@deepseek-ai/dsh-persona` 的 `config.prefix`

本仓库桌面 Harness 的字段是 `prefix`，不是旧键 `text`。`src/shared/persona-prefix.ts` 会在用户预设挂载前把 `text` 改成 `prefix`；源文件写 `text` 会在迁移前挂不上。长材料不进热路径，放在同目录 `docs/`：

- `methodology-2.0.md` — 方法论 2.0、四轴、阶段、分层验证
- `loop-examples.md` — 工具地图与长示例
- `zfoo-framework.md` — 框架 API 表
- `team-routing.md` — 五人团与专家预设，**仅 Game Studio / 多 Agent**。单人 Codely 不要先五人团再动手

分层验证：结构/编辑器用 `scenes.info`（脚本用 `scripts.read`）；必须引擎的行为才一次 `project.run`；宣称可交付或 Phase 3 才跑完整三道闸。小改动不自动跑冒烟或功能自测。

## 关键陷阱
- **cordis.patch.yml 追加插件行**：必须放 `- insert:` 块；普通 `- id:` 只覆盖已有行。
- **模型**：默认模型由用户侧模型路由决定（`{{model}}` 注入）；支持 OpenAI/Anthropic 兼容端点自由接入。
  401/402/400 分别为密钥失效、余额不足、账号无对应订阅——按服务商排查，**密钥不入仓库**。
- **多模态**：图像经 `generate_sprite`/`generate_image`（需 `VOLC_ARK_API_KEY`）；TTS 经 `text_to_speech`
  （需 DashScope key）。密钥经环境变量/配置注入，详见 `README.md` 与 `skills/godot/media-generation/SKILL.md`。
- **子代理**：`godot-scene-expert` / `godot-shader-expert` / `godot-gdscript-expert` 三个预设已配置（persona 定制），
  **出厂能力未真机验收前不标记完成**（headless 通过 ≠ 出厂验收通过）。
- **Godot 集成资产源** 在外部仓库（godot-extensions，按环境配置路径），改完按 README「更新资源」复制回本包。

## 能力对照进度（对标 cowork）
✅ #13 多模态资产生成（generate_sprite/generate_image/text_to_speech，headless 通过）
📌 #14 子代理系统（3 个 Godot 专家预设已配置 + 启动修复；**真机验收待完成**）
✅ #15 记忆系统（静态 AGENTS.md 链 + 动态 ~/.godot-codely/memories，已验证注入）
✅ #16 安全策略/协作模式（approval + plan/default + 权限降级默认 workspace-write）
✅ #17 斜杠命令（godot 领域命令 /memory /status /models）
✅ #18 LSP 通道（godot --language-server，agentic 链路 lsp_diagnostics 零错误/警告）
✅ 面板 LLM 流式对话（OpenAI 兼容 SSE，headless 实测逐字输出）
✅ 面板 agentic 工具调用（LLM 决策 → MCP 工具执行 → 结果回喂）
