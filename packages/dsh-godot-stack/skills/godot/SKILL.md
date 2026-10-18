---
name: godot-skill-index
description: Godot 技能库索引与路由。当你需要 Godot 开发帮助但不明确该用哪个技能时加载本技能。列出全部 7 个领域技能与 23 个 MCP 工具总览，并按任务类型给出路由建议。
---

# Godot 技能库索引

## 技能清单（按需加载，不要一次全读）

| 技能 | 覆盖 | 触发场景 |
|------|------|---------|
| `scene-tree` | .tscn 格式、节点树操作、信号连接、输入映射 | 新建/改场景、加节点、连信号、绑输入 |
| `gdscript` | GDScript 规范、zfoo 框架 API（禁止手写表） | 写/改脚本、用框架、类型安全 |
| `physics-movement` | 物理、角色移动手感、碰撞层、动画状态机 | 角色控制、跳跃手感、碰撞、状态机 |
| `ui-ux` | Control 布局、响应式、主题、商业化 UI | UI 界面、HUD、菜单、商店 UI |
| `shader-worldgen` | 着色器、TileMap、程序化关卡、地形 | 关卡生成、地形、视觉特效 |
| `quality-gates` | 三道闸（编译/冒烟/功能）、视觉验证、导出 | 验证、发布、截图对比、性能 |
| `project-workflow` | 工程自选、阶段门控、方法论 2.0、四轴 | 选工程、阶段规划、PROJECT.md |
| `media-generation` | generate_sprite / generate_image / text_to_speech 调用与排错 | 生成精灵/概念图/UI 图标/配音 |

## 23 个 MCP 工具总览（前缀 mcp__godot__）

- **project**：info / version / run / stop / settings_get / settings_set / export
- **scenes**：create / list / info / delete / duplicate / set_main
- **nodes**：add / remove / rename / list / set_property / get_property
- **scripts**：create / read / write / attach / list / delete
- **editor**：launch / status
- **config**：status / set / detect_godot / check
- **resources**：list / info / delete / import_config
- **input_map**：list / add_action / remove_action / add_event
- **signals**：list / connect / disconnect
- **animation**：create_player / add_animation / add_track / add_keyframe / list
- **tilemap**：create_tileset / add_source / set_tile / paint / list
- **shader**：create / read / write / get_params / list
- **physics**：layers / collision_setup / body_config / set_layer_name
- **audio**：list_buses / add_bus / add_effect / create_stream
- **navigation**：create_region / add_agent / add_obstacle
- **ui**：create_control / set_theme / layout / list_controls
- **help**：获取任意工具的完整参数文档（动手前先用它确认参数）
- **list_projects**：纯目录扫描列出本机 Godot 工程（无需 Godot 二进制）
- **export_mesh_library / get_uid / update_project_uids**：Godot 进程驱动的资源工具
- **generate_sprite / generate_image**：Volcengine 文生图 → 写 assets/（需 VOLC_ARK_API_KEY）
- **text_to_speech**：DashScope 文生语音 → 写 assets/audio/（需 GODOT_CODELY_TTS_API_KEY）
- 多模态调用参数/示例/排错 → 加载 `media-generation` 技能

## 使用纪律

1. 不确定某工具的参数 → 先调 `mcp__godot__help` 拿完整文档，再动手
2. 一次只改一件事，改前先读（scenes.info / nodes.list / scripts.read）
3. 按实际改动影响检查：读回只证明文本/结构，代码/类型用编译或 LSP，行为用针对性引擎检查。失败修复后重跑失败项，直到任务完成或明确阻塞，不追加无关验收。可交付或 Phase 3 跑完整三道闸（`quality-gates`）；细则用 `read` 从 persona 的绝对文档根目录读取 `methodology-2.0.md`
