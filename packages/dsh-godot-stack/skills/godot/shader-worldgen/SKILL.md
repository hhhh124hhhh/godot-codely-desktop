---
name: shader-worldgen
description: Godot 着色器与世界生成专家。覆盖 gdshader 着色器（shader.* 工具）、TileMap 关卡（tilemap.* 工具）、程序化生成、地形、导航（navigation.*）、音频总线（audio.*）。当处理关卡生成、地形、视觉特效、着色器时加载本技能。
---

# 着色器与世界生成（shader-worldgen）

## 着色器（shader.*）

| action | 说明 |
|--------|------|
| create / read / write | 创建/读写 .gdshader |
| get_params | 获取着色器参数 |
| list | 列着色器 |

- Godot 着色器语言：`gdshader`，类型 `shader_type canvas_item`（2D）或 `spatial`（3D）
- 常用：`COLOR`（canvas_item）、`uniform` 参数、`TIME`（动画）、`UV`（采样）
- 特效从"能跑"开始，不要一上来写复杂后处理

## TileMap 关卡（tilemap.*）

| action | 说明 |
|--------|------|
| create_tileset | 创建 Tileset |
| add_source | 添加 Tile 源 |
| set_tile / paint | 放置/绘制 Tile |
| list | 列 TileMap |

- 关卡 = TileMap 数据，程序化生成时先定义 tileset（地形/碰撞），再按规则 paint
- 碰撞：TileSet 里给 Tile 配物理层（collision polygon）

## 导航（navigation.*）

- `create_region` / `add_agent` / `add_obstacle`：寻路区域、AI agent、障碍物
- 敌人寻路：NavigationAgent2D 沿 NavigationRegion 移动

## 音频（audio.*）

- `list_buses` / `add_bus` / `add_effect` / `create_stream`：总线、音效链、流
- **优先用框架 API**：`Audio.play_music(...)` / `Audios.play(...)`（见 gdscript 技能），不要手写 AudioStreamPlayer

## 红线

- 世界生成先保证"能玩的核心循环"（占位美术可接受），再谈质感
- 程序化生成必须可复现（种子固定），避免每次打开场景都不一样
