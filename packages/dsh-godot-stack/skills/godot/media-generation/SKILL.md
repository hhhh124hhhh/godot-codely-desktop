---
name: media-generation
description: Godot 工程多模态资产生成（文生图/文生语音）。覆盖 generate_sprite / generate_image / text_to_speech 三个 MCP 工具的调用参数、操作示例、落盘路径与排错。当任务需要生成 2D 精灵、概念图、UI 图标或配音音频时加载本技能。
---

# 多模态资产生成（media-generation）

## 工具总览（前缀 mcp__godot__）

| 工具 | 能力 | 默认落盘 | 所需凭据 |
|---|---|---|---|
| `generate_sprite` | 2D 游戏精灵（角色/敌人/道具/头像/UI 图标，透明背景构图） | `<project>/assets/textures/` | `VOLC_ARK_API_KEY` |
| `generate_image` | 任意图像（概念/场景/宣发） | `<project>/assets/textures/` | `VOLC_ARK_API_KEY` |
| `text_to_speech` | 文本转语音（wav/mp3） | `<project>/assets/audio/` | DashScope key（`GODOT_CODELY_TTS_API_KEY`） |

key 优先级：面板/配置文件填写的 key > 进程环境变量。**密钥一律不入仓库**。

## 参数速查

### generate_sprite / generate_image

| 参数 | 必填 | 说明 |
|---|---|---|
| `prompt` | ✅ | 自然语言描述（如"绿色史莱姆，正面，透明背景"） |
| `name` | ✅ | 资产名（如 `slime_green`），决定文件名前缀 |
| `category` | 否 | 命名前缀：char / enemy / prop / ui / fx / bg（默认 prop） |
| `size` | 否 | 像素数组 `[宽, 高]`，默认 `[1024, 1024]` |
| `style_anchor` | 否 | 风格锚词（同一项目必带，保证多图风格一致） |
| `ui_mode` | 否 | UI 图标专用构图 |
| `target_dir` | 否 | 落盘目录，默认 `<project>/assets/textures/` |
| `project_root` | 否 | Godot 工程根，默认运行时项目路径或 cwd |

### text_to_speech

| 参数 | 必填 | 说明 |
|---|---|---|
| `text` | ✅ | 待朗读文本 |
| `voice` | 否 | 音色（默认 Cherry） |
| `format` | 否 | wav / mp3（默认 wav） |
| `sample_rate` | 否 | 采样率（默认 24000） |
| `name` | 否 | 文件名前缀（默认 voice） |
| `target_dir` | 否 | 默认 `<project>/assets/audio/` |
| `project_root` | 否 | Godot 工程根 |

## 操作示例

### 示例 1：生成主角精灵

```
Step 1: mcp__godot__help（generate_sprite）           # 确认参数
Step 2: generate_sprite(prompt="绿色史莱姆，正面站立，透明背景",
                        name="slime_green", category="char",
                        style_anchor="cartoon_outline")
Step 3: 工具返回落盘路径 assets/textures/char_slime_green.png
Step 4: scenes.info 确认场景；nodes.set_property 把 Sprite2D.texture 指向该资源（或导入后在编辑器引用）
```

### 示例 2：生成场景概念图

```
generate_image(prompt="奇幻森林入口，清晨光线，游戏概念图", name="forest_entrance", category="bg")
→ assets/textures/bg_forest_entrance.png
```

### 示例 3：生成角色语音

```
text_to_speech(text="欢迎来到冒险世界！", name="npc_welcome", voice="Cherry")
→ assets/audio/npc_welcome_<8位hex>.wav
```

## 落盘与工程导入

- 写入 `<project>/assets/` 后，Godot 4 会在启动/导入时自动生成 `.import` 文件，无需手写 meta。
- 引用方式：场景里把 `Sprite2D.texture` / `AudioStreamPlayer.stream` 指向对应资源路径；也可用 `resources.list` 确认资源可见。
- 批量生成时**每图必带 `style_anchor`**（同项目同一锚词），否则多图风格会漂移。

## 排错

| 现象 | 常见原因 | 处理 |
|---|---|---|
| 工具报"未配置 API Key" / 401 | 缺 `VOLC_ARK_API_KEY`（图）或 `GODOT_CODELY_TTS_API_KEY`（语音） | 在环境变量或面板/配置文件填入 key；确认 `VOLCENGINE_IMAGE_ENDPOINT=ep-xxxx`（接入点优先） |
| `images/generations` 返回 400 url error | 当前模型套餐网关只透传 chat 接口，不透传图像/音频接口 | 改用 `ep-` 接入点直调，或自备支持 images/audio 的 OpenAI 兼容端点 |
| 直调模型名 404 | 火山模型需经接入点调用，不支持模型名直调 | 用 `ep-` 接入点（`VOLCENGINE_IMAGE_ENDPOINT`） |
| TTS 返回无音频数据 | 模型/接口不支持或返回结构变化 | 核对 `GODOT_CODELY_TTS_MODEL`（默认 qwen-audio-3.0-tts-plus）与响应体；换支持多模态的 DashScope key |
| 落盘路径不对 | `project_root` 未指向工程根 | 显式传 `project_root=<工程根>` 或用 `config status` 确认当前 project_path |

## 能力边界

- 当前支持：文生图（精灵/概念/图标）与文本转语音。
- **不宣称**已支持：3D 模型生成、骨骼动画、音乐/音效生成。
- 生成结果需人工抽查（构图、文字细节、风格一致性）后再进场景。
