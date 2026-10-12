# dsh-godot-stack

Godot Codely 预装插件：把 godot-extensions 全家桶打进出厂配置，首启自动落位。

## 内置内容

| 资源 | 落位目标 |
|---|---|
| `godot-stack/agent-presets/godot-codely-lite/`（preset.yml + agent.cordis.yml） | `<dshHome>/.agent-presets/godot-codely-lite` |
| `godot-stack/mcp/godot-mcp-server/`（23 工具 MCP server 源码） | `<dshHome>/.godot/mcp-server` |
| `skills/godot/`（7 个领域技能 + SKILL.md 索引） | 内置技能，由 DSH skill 系统自动发现（bundled） |

`<dshHome>` = `DSH_HOME` 环境变量，未设置时为 `~/.dsh`。

## 工作机制

- 插件随 `build/dsh-desktop.patch.yml` 的 `- insert: dsh-godot-stack` 挂载，每次 Harness 启动时 `apply()` 执行。
- 全部 best-effort：失败只写 warning，不阻塞启动。
- MCP 注册：若 `<dshHome>/.godot/mcp-server/build/index.js` 已构建，则把 `mcpServers.godot` 写入 `<dshHome>/settings.json`（不覆盖已有配置）；未构建则只复制源码并提示：
  ```
  cd <dshHome>/.godot/mcp-server && npm install && npm run build
  ```

## 模型套餐（自由选择，对标 cowork 模型市场）

Godot Codely CLI 出厂预置 2 个实测可用的模型套餐，可在运行/会话间自由切换：

| 套餐 | Provider | 模型 | 验证 |
|---|---|---|---|
| Token Plan Qwen | `tokenplan-qwen` | qwen3.8-flash / qwen3.8-max / qwen3.7-plus / qwen3.7-max / deepseek-v4-flash-0731 / deepseek-v4-pro | ✅ 实测回复 |
| Kimi For Coding | `kimi-for-coding` | kimi-for-coding | ✅ 实测回复 |

```bash
# 查看可换模型
godot-codely --list-models

# 指定模型跑任务（仅本次生效）
godot-codely --model glm-5.2 "分析场景树"
godot-codely --provider volcengine --model glm-latest "..."

# 默认模型（tokenplan-qwen / qwen3.8-flash）在 ~/.dsh/profiles/godot-codely/cordis.patch.yml
```

### 自建套餐

任何 OpenAI 兼容 / Anthropic 兼容端点都可一条命令接入（key 写入 `~/.dsh/.credentials.yaml`，套餐写入 `~/.dsh/cordis.patch.yml`，DSH 自动应用）：

```bash
godot-codely config add \
  --name my-plan \
  --base-url https://api.example.com/v1 \
  --api openai-completions \        # 或 anthropic-messages
  --key-env MY_API_KEY \
  --key sk-xxx \
  --models m1,m2,m3 \
  --display "我的套餐" \
  [--default]                        # 设为默认模型
```

- `godot-codely config list` 查看全部套餐（出厂 + 自建）
- 移除失效套餐：直接编辑 `~/.dsh/cordis.patch.yml`（自建）或 `~/.dsh/profiles/godot-codely/cordis.patch.yml`（出厂）
- 桌面端同套配置：`%APPDATA%\dsh-desktop\harness\settings.yaml`（重启自动导入，Models 页可视/可换）

### 失效套餐排查记录（2026-10-12 逐一实测）

| Provider | 结果 | 原因 |
|---|---|---|
| zhipu-glm | ❌ 401 | key 失效（身份验证失败） |
| minimax | ❌ 402 | 余额不足 |
| volcengine | ❌ 400 | 账号无 CodingPlan 订阅 |
| deepseek 官方 | ❌ 402 | 余额不足 |

## 多模态资产生成（MCP：generate_sprite / generate_image / text_to_speech）

Godot Codely 的 MCP server 提供 3 个多模态工具，写入 Godot 工程 `assets/`（Godot 4 自动 import，无需手写 meta）：

| 工具 | 能力 | 落盘 |
|---|---|---|
| `generate_sprite` | 2D 游戏精灵（角色/敌人/道具/UI，透明背景） | `assets/textures/` |
| `generate_image` | 任意图像（概念/场景/宣发） | `assets/textures/` |
| `text_to_speech` | 文本转语音（wav/mp3） | `assets/audio/` |

### 文生图（✅ 已通，开箱即用）

- 默认走**火山方舟 doubao-seedream**：MCP 自动从 `~/.claude/skills/volcengine-generation/.env` 加载
  `VOLCENGINE_API_KEY` + `VOLCENGINE_IMAGE_ENDPOINT=ep-xxxx`（接入点优先于进程级通用 URL）。
- 实测（2026-10-12）：`generate_image` 真机出图成功（2048x2048，自动落盘 `assets/textures/`）。
- 兜底：`GODOT_CODELY_IMAGE_BASE_URL` + `GODOT_CODELY_IMAGE_MODEL` + `GODOT_CODELY_IMAGE_API_KEY`
  （任意 OpenAI 兼容 images/generations 端点，如自备 DashScope 原生 key）。

### 语音合成（⚠️ 工具就绪，需自备 key）

`text_to_speech` 走 DashScope multimodal-generation 格式（`qwen-audio-3.0-tts-plus` 等），
需自备支持多模态的 DashScope/百炼 key：

```
GODOT_CODELY_TTS_BASE_URL=…（默认 dashscope multimodal-generation 端点）
GODOT_CODELY_TTS_MODEL=qwen-audio-3.0-tts-plus
GODOT_CODELY_TTS_API_KEY=sk-xxx
GODOT_CODELY_TTS_VOICE=Cherry
```

### 已知限制（2026-10-12 实测）

- **Token Plan 套餐**的 `wan2.7-image` / `qwen-audio-3.0-tts-plus` 虽在模型白名单，但网关只透传
  chat 接口——`images/generations` 与 `audio/speech` 均返回 400 url error，**不能**经套餐调用。
- **火山模型名直调**（doubao-seedream-5.0-lite-260128 等）404，必须用 `ep-` 接入点。

## 开发

```bash
npm install            # file: 依赖链接本包
npm run build          # 编译主进程后打包时插件随 asar 进入
```

## 更新资源

改 `D:\godot-extensions` 后重新复制对应目录到本包：
- `agent-presets/godot-codely-lite` → `godot-stack/agent-presets/`
- `godot-codely/godot-mcp-server` → `godot-stack/mcp/`
- `skills/godot` → `skills/godot`
