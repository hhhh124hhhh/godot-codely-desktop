---
name: gdscript
description: Godot GDScript 专家。覆盖 GDScript 规范、zfoo 框架 API 用法（禁止手写等价逻辑的表）、类型安全。当写/改脚本、使用框架功能、涉及类型与信号解耦时加载本技能。
---

# GDScript + godot-framework（gdscript）

## 项目框架（godot-framework / zfoo/）

本项目整合了 [godot-fun/godot-framework](https://github.com/godot-fun/godot-framework) 的运行时框架。框架以 Autoload 方式加载（GodotFramework.tscn → 全局类名 gdf）。**写 GDScript 时优先使用框架 API，不要手写等价逻辑**。下表与预设 `docs/zfoo-framework.md` 保持一致：

| 场景 | 框架 API | 禁止手写 |
|------|----------|----------|
| 播放音乐 | `Audio.play_music("res://audio/bgm.mp3")` | 不要手写 AudioStreamPlayer 节点 |
| 播放音效 | `Audios.play("res://audio/click.mp3", 0.8)` | 不要手写 AudioStreamPlayer2D |
| 场景切换 | `await SceneHelper.async_change_scene_to_file("res://scene/Main.tscn")` | 不要手写 get_tree().change_scene_to_file() |
| 异步加载资源 | `await ResourceHelper.async_load("res://assets/icon.svg")` | 不要用 load() 阻塞主线程 |
| 日志 | `Log.info("msg:[{}]", val)` / `Log.error(...)` | 不要用 print() / push_error() |
| 持久化配置 | `Setting.get_bool("key", false)` / `Setting.set_string("key", "val")` + `Setting.save()` | 不要手写 ConfigFile |
| 定时任务 | `SchedulerBus.schedule(func(): do_something(), 1000)` | 不要用 Timer 节点 |
| HTTP 请求 | `await HttpHelper.async_get("https://...")` | 不要手写 HTTPRequest 节点 |
| 主线程回调 | `gdf.callable_deferred(func(): refresh_ui())` | 不要用 call_deferred 字符串形式 |
| 安全退出 | `await gdf.quit()` | 不要用 get_tree().quit() |
| 精灵表动画 | `EffectAnimation2D.spawn(pos, parent, "res://effects/attack.png", Vector2i(4,4), 0.5, 13)` | 不要手写 AnimatedSprite2D |
| Toast 提示 | `Alert.alert("Saved", Colors.success)` | 不要手写 Label + Tween |

框架 Autoload 注册方式（项目集成时）：Project → Project Settings → Autoload → GodotFramework (res://zfoo/GodotFramework.tscn)

## GDScript 规范

- 场景 = 节点树；脚本 = GDScript 文件。一次只改一件事，改前先用查询类工具确认现状
- 类型安全：用显式类型标注（`var x: int`、`func f() -> void`），涉及 Resource/信号解耦时优先让架构师思路
- 错误归因：报错先定位到具体文件 / 行 / 属性，再动手；不要整体重写

## 脚本工具（scripts.*）

| action | 说明 |
|--------|------|
| create | 新建脚本（script_path + extends + content） |
| read / write | 读写脚本内容 |
| attach | 把脚本挂到场景节点（script_path + scene_path + node_name） |
| list / delete | 列 / 删脚本 |

## 实操示例：报错修复闭环

场景：`project(action="run")` 后控制台报 "Invalid call. Nonexistent function 'move_and_slide' on base: 'Node2D'"

```
Step 1: scripts(action="read", script_path="scripts/player.gd")        # 读取脚本
Step 2: 定位 → 节点类型是 Node2D 而非 CharacterBody2D，所以没有 move_and_slide()
Step 3: scripts(action="write", script_path="scripts/player.gd", content="extends CharacterBody2D\n...")  # 只改 extends 类型
Step 4: project(action="run")                                          # 这条报错来自引擎，修完跑一次
# 只改注释、类型标注或与行为无关的文本时，用 scripts.read 确认即可，不要自动 project.run，也不要升到冒烟/功能自测。
```
